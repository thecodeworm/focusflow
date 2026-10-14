//! Local SQLite storage for tasks and completed sessions.
//!
//! Exposed to the UI only through typed commands; the webview never runs SQL.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

const MIGRATIONS: &[&str] = &[include_str!("../migrations/001_init.sql")];

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub done: bool,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: i64,
    pub phase: String,
    pub started_at: Option<i64>,
    pub ended_at: i64,
    pub duration_ms: i64,
    pub task_id: Option<i64>,
    pub task_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatsSummary {
    pub total_focus_ms: i64,
    pub total_sessions: i64,
    pub task_sessions: i64,
    pub first_session_at: Option<i64>,
}

pub struct NewSession<'a> {
    pub key: String,
    pub phase: &'a str,
    pub started_at: Option<i64>,
    pub ended_at: i64,
    pub duration_ms: i64,
    pub task_id: Option<i64>,
    pub recovered: bool,
}

type R<T> = Result<T, String>;

fn e(err: rusqlite::Error) -> String {
    format!("Database error: {err}")
}

impl Db {
    pub fn open(path: &Path) -> R<Db> {
        let conn = Connection::open(path).map_err(e)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> Db {
        Self::init(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn init(conn: Connection) -> R<Db> {
        conn.pragma_update(None, "journal_mode", "WAL").map_err(e)?;
        conn.pragma_update(None, "foreign_keys", "ON").map_err(e)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(e)?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            conn.execute_batch(sql).map_err(e)?;
            conn.pragma_update(None, "user_version", (i + 1) as i64).map_err(e)?;
        }
        Ok(Db { conn: Mutex::new(conn) })
    }

    fn c(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    // ---- tasks ---------------------------------------------------------

    pub fn tasks(&self) -> R<Vec<Task>> {
        let c = self.c();
        let mut st = c
            .prepare("SELECT id, title, done, created_at, completed_at FROM tasks ORDER BY done ASC, COALESCE(completed_at, 0) DESC, id ASC")
            .map_err(e)?;
        let rows = st
            .query_map([], |r| {
                Ok(Task {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    done: r.get::<_, i64>(2)? != 0,
                    created_at: r.get(3)?,
                    completed_at: r.get(4)?,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn task(&self, id: i64) -> R<Option<Task>> {
        Ok(self.tasks()?.into_iter().find(|t| t.id == id))
    }

    pub fn add_task(&self, title: &str, now: i64) -> R<Task> {
        let title = clean_title(title)?;
        let c = self.c();
        c.execute(
            "INSERT INTO tasks (title, done, created_at) VALUES (?1, 0, ?2)",
            params![title, now],
        )
        .map_err(e)?;
        Ok(Task {
            id: c.last_insert_rowid(),
            title,
            done: false,
            created_at: now,
            completed_at: None,
        })
    }

    pub fn update_task(&self, id: i64, title: Option<&str>, done: Option<bool>, now: i64) -> R<()> {
        let c = self.c();
        if let Some(t) = title {
            let t = clean_title(t)?;
            c.execute("UPDATE tasks SET title = ?1 WHERE id = ?2", params![t, id])
                .map_err(e)?;
        }
        if let Some(d) = done {
            c.execute(
                "UPDATE tasks SET done = ?1, completed_at = ?2 WHERE id = ?3",
                params![d as i64, if d { Some(now) } else { None }, id],
            )
            .map_err(e)?;
        }
        Ok(())
    }

    pub fn delete_task(&self, id: i64) -> R<()> {
        self.c()
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])
            .map_err(e)?;
        Ok(())
    }

    pub fn clear_completed_tasks(&self) -> R<()> {
        self.c()
            .execute("DELETE FROM tasks WHERE done = 1", [])
            .map_err(e)?;
        Ok(())
    }

    // ---- sessions ------------------------------------------------------

    /// Records a completed session. The unique session key makes this
    /// idempotent: recording the same session twice is a no-op.
    pub fn record_session(&self, s: &NewSession) -> R<bool> {
        let c = self.c();
        let title: Option<String> = match s.task_id {
            Some(id) => c
                .query_row("SELECT title FROM tasks WHERE id = ?1", params![id], |r| r.get(0))
                .optional()
                .map_err(e)?,
            None => None,
        };
        let n = c
            .execute(
                "INSERT OR IGNORE INTO sessions (session_key, phase, started_at, ended_at, duration_ms, task_id, task_title, recovered)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![s.key, s.phase, s.started_at, s.ended_at, s.duration_ms, s.task_id, title, s.recovered as i64],
            )
            .map_err(e)?;
        Ok(n == 1)
    }

    pub fn sessions_since(&self, since: i64) -> R<Vec<SessionRow>> {
        let c = self.c();
        let mut st = c
            .prepare("SELECT id, phase, started_at, ended_at, duration_ms, task_id, task_title FROM sessions WHERE ended_at >= ?1 ORDER BY ended_at ASC")
            .map_err(e)?;
        let rows = st
            .query_map(params![since], |r| {
                Ok(SessionRow {
                    id: r.get(0)?,
                    phase: r.get(1)?,
                    started_at: r.get(2)?,
                    ended_at: r.get(3)?,
                    duration_ms: r.get(4)?,
                    task_id: r.get(5)?,
                    task_title: r.get(6)?,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn summary(&self) -> R<StatsSummary> {
        self.c()
            .query_row(
                "SELECT COALESCE(SUM(duration_ms), 0), COUNT(*), COUNT(task_id), MIN(ended_at) FROM sessions WHERE phase = 'focus'",
                [],
                |r| {
                    Ok(StatsSummary {
                        total_focus_ms: r.get(0)?,
                        total_sessions: r.get(1)?,
                        task_sessions: r.get(2)?,
                        first_session_at: r.get(3)?,
                    })
                },
            )
            .map_err(e)
    }

    pub fn clear_sessions(&self) -> R<()> {
        self.c().execute("DELETE FROM sessions", []).map_err(e)?;
        Ok(())
    }
}

fn clean_title(t: &str) -> R<String> {
    let t: String = t.trim().chars().filter(|c| !c.is_control()).take(200).collect();
    if t.is_empty() {
        Err("Task title can't be empty.".into())
    } else {
        Ok(t)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(key: &str, ended: i64, task: Option<i64>) -> NewSession<'static> {
        NewSession {
            key: key.into(),
            phase: "focus",
            started_at: Some(ended - 1500_000),
            ended_at: ended,
            duration_ms: 1_500_000,
            task_id: task,
            recovered: false,
        }
    }

    #[test]
    fn records_each_session_once() {
        let db = Db::in_memory();
        assert!(db.record_session(&session("a", 10, None)).unwrap());
        assert!(!db.record_session(&session("a", 10, None)).unwrap());
        assert_eq!(db.summary().unwrap().total_sessions, 1);
    }

    #[test]
    fn task_crud_and_association() {
        let db = Db::in_memory();
        let t = db.add_task("  Write report ", 1).unwrap();
        assert_eq!(t.title, "Write report");
        assert!(db.add_task("   ", 1).is_err());
        db.update_task(t.id, Some("Write the report"), Some(true), 5).unwrap();
        let got = db.task(t.id).unwrap().unwrap();
        assert!(got.done);
        assert_eq!(got.completed_at, Some(5));
        db.record_session(&session("b", 20, Some(t.id))).unwrap();
        let rows = db.sessions_since(0).unwrap();
        assert_eq!(rows[0].task_title.as_deref(), Some("Write the report"));
        assert_eq!(db.summary().unwrap().task_sessions, 1);
        db.delete_task(t.id).unwrap();
        assert!(db.tasks().unwrap().is_empty());
        // History keeps its snapshot of the title.
        assert_eq!(db.sessions_since(0).unwrap()[0].task_title.as_deref(), Some("Write the report"));
    }

    #[test]
    fn clear_sessions_empties_history() {
        let db = Db::in_memory();
        db.record_session(&session("c", 30, None)).unwrap();
        db.clear_sessions().unwrap();
        assert_eq!(db.summary().unwrap().total_sessions, 0);
        assert_eq!(db.summary().unwrap().total_focus_ms, 0);
    }
}

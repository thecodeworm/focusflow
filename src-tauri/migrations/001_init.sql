-- Ringlet schema v1
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  completed_at INTEGER
);

-- Only sessions that ran to completion are stored. Times are Unix epoch ms
-- (UTC); day bucketing happens in the UI using the current local time zone.
CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key   TEXT    NOT NULL UNIQUE,
  phase         TEXT    NOT NULL,
  started_at    INTEGER,
  ended_at      INTEGER NOT NULL,
  duration_ms   INTEGER NOT NULL,
  task_id       INTEGER,
  task_title    TEXT,
  recovered     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sessions_ended_at ON sessions(ended_at);

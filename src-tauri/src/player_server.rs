//! Loopback host for the YouTube embed page.
//!
//! YouTube's embedded player requires the embedding page to have an HTTP(S)
//! origin and to send a Referer (otherwise it shows "Error 153 — video player
//! configuration error"). Tauri serves the app from `tauri://localhost` on
//! macOS, which YouTube rejects. Ringlet therefore serves exactly one static
//! page (plus its script) from `http://127.0.0.1:<random port>`; the dashboard
//! embeds that page in an iframe and talks to it with `postMessage`.
//!
//! The server only answers `GET /player.html` and `GET /player.js`, validates
//! the Host header (DNS-rebinding defence), sends a strict CSP, and has no
//! access to Tauri IPC.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

const PAGE: &str = include_str!("../player/player.html");
const SCRIPT: &str = include_str!("../player/player.js");

pub struct PlayerServer {
    pub origin: String,
}

pub fn allowed_parent_origins() -> Vec<&'static str> {
    let mut v = vec!["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];
    if cfg!(debug_assertions) {
        v.push("http://localhost:1420");
    }
    v
}

pub fn start() -> std::io::Result<PlayerServer> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    let host = format!("127.0.0.1:{port}");
    let origin = format!("http://{host}");
    let parents = allowed_parent_origins();
    let script = SCRIPT.replace(
        "\"__ALLOWED_PARENT_ORIGINS__\"",
        &serde_json::to_string(&parents).unwrap_or_else(|_| "[]".into()),
    );
    let csp = format!(
        "default-src 'none'; script-src 'self' https://www.youtube.com https://s.ytimg.com; \
         frame-src https://www.youtube.com https://www.youtube-nocookie.com; \
         img-src https://i.ytimg.com https://s.ytimg.com; style-src 'unsafe-inline'; \
         connect-src https://www.youtube.com; frame-ancestors {}; base-uri 'none'; form-action 'none'",
        parents.join(" ")
    );
    std::thread::Builder::new()
        .name("ringlet-player-host".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let _ = handle(stream, &host, &script, &csp);
            }
        })?;
    Ok(PlayerServer { origin })
}

fn handle(mut s: TcpStream, host: &str, script: &str, csp: &str) -> std::io::Result<()> {
    s.set_read_timeout(Some(Duration::from_secs(3)))?;
    s.set_write_timeout(Some(Duration::from_secs(3)))?;
    let mut buf = [0u8; 4096];
    let mut len = 0;
    // Read until end of headers or buffer full.
    loop {
        let n = s.read(&mut buf[len..])?;
        if n == 0 {
            break;
        }
        len += n;
        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") || len == buf.len() {
            break;
        }
    }
    let req = String::from_utf8_lossy(&buf[..len]);
    let mut lines = req.split("\r\n");
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split(' ');
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    let host_ok = lines
        .filter_map(|l| l.split_once(':'))
        .any(|(k, v)| k.eq_ignore_ascii_case("host") && v.trim() == host);

    let path_only = path.split('?').next().unwrap_or("");
    let (status, ctype, body): (&str, &str, &str) = if method != "GET" {
        ("405 Method Not Allowed", "text/plain", "")
    } else if !host_ok {
        ("421 Misdirected Request", "text/plain", "")
    } else {
        match path_only {
            "/player.html" => ("200 OK", "text/html; charset=utf-8", PAGE),
            "/player.js" => ("200 OK", "text/javascript; charset=utf-8", script),
            _ => ("404 Not Found", "text/plain", ""),
        }
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\n\
         Content-Security-Policy: {csp}\r\nX-Content-Type-Options: nosniff\r\n\
         Referrer-Policy: strict-origin-when-cross-origin\r\nCache-Control: no-store\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );
    s.write_all(head.as_bytes())?;
    s.write_all(body.as_bytes())?;
    s.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(origin: &str, path: &str, host: Option<&str>) -> String {
        let addr = origin.trim_start_matches("http://");
        let mut s = TcpStream::connect(addr).unwrap();
        let h = host.unwrap_or(addr);
        write!(s, "GET {path} HTTP/1.1\r\nHost: {h}\r\n\r\n").unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn serves_only_player_assets_with_valid_host() {
        let srv = start().unwrap();
        let ok = get(&srv.origin, "/player.html", None);
        assert!(ok.starts_with("HTTP/1.1 200"));
        assert!(ok.contains("frame-ancestors"));
        let js = get(&srv.origin, "/player.js?x=1", None);
        assert!(js.starts_with("HTTP/1.1 200"));
        assert!(!js.contains("__ALLOWED_PARENT_ORIGINS__"));
        assert!(get(&srv.origin, "/etc/passwd", None).starts_with("HTTP/1.1 404"));
        assert!(get(&srv.origin, "/player.html", Some("evil.example")).starts_with("HTTP/1.1 421"));
    }
}

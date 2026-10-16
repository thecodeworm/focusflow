//! Server-side check of saved YouTube links. The UI parses pasted links
//! (`src/lib/media-url.ts`); this mirrors its rules so a hand-edited or
//! imported settings file cannot smuggle in anything else.

use url::Url;

const YT_HOSTS: [&str; 6] = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
];

#[derive(Debug, PartialEq)]
pub struct YoutubeRef {
    pub video_id: Option<String>,
    pub list_id: Option<String>,
    /// A channel's current live stream (`/channel/UC…/live`).
    pub channel_id: Option<String>,
    /// Start offset in seconds (0 when absent).
    pub start: u32,
}

fn is_id_chars(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn is_video_id(s: &str) -> bool {
    s.len() == 11 && is_id_chars(s)
}

/// "UC" + 22 ID characters.
fn is_channel_id(s: &str) -> bool {
    s.len() == 24 && s.starts_with("UC") && is_id_chars(s)
}

fn is_list_id(s: &str) -> bool {
    (2..=64).contains(&s.len()) && is_id_chars(s)
}

/// YouTube Music's browse pages prefix playlist IDs with "VL"; the embed
/// wants the bare ID. No real playlist ID starts with VL.
fn strip_vl(id: &str) -> &str {
    match id.strip_prefix("VL") {
        Some(rest) if is_list_id(rest) => rest,
        _ => id,
    }
}

/// "90", "90s", "1m30s", "1h2m3s" -> seconds, capped at 24 h. Invalid -> 0.
fn parse_start(t: &str) -> u32 {
    const CAP: u32 = 86_400;
    if let Ok(n) = t.parse::<u32>() {
        return n.min(CAP);
    }
    let mut total: u32 = 0;
    let mut num = String::new();
    let mut seen = false;
    let mut last = 0; // units must appear in h, m, s order
    for c in t.chars() {
        if c.is_ascii_digit() {
            num.push(c);
            continue;
        }
        let (rank, mult) = match c {
            'h' => (1, 3600),
            'm' => (2, 60),
            's' => (3, 1),
            _ => return 0,
        };
        if num.is_empty() || num.len() > 6 || rank <= last {
            return 0;
        }
        total = total.saturating_add(num.parse::<u32>().unwrap_or(0).saturating_mul(mult));
        num.clear();
        seen = true;
        last = rank;
    }
    if !num.is_empty() || !seen {
        return 0;
    }
    total.min(CAP)
}

/// Accepts watch / youtu.be / shorts / live / embed / playlist links,
/// YouTube Music `/browse/VL…` playlist pages, and `/channel/UC…/live` for a
/// channel's current live stream.
pub fn parse_youtube(input: &str) -> Option<YoutubeRef> {
    let url = Url::parse(input).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    let param = |k: &str| url.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());
    let mut list_id = param("list").filter(|l| is_list_id(l)).map(|l| strip_vl(&l).to_owned());
    let start = param("t").or_else(|| param("start")).map_or(0, |t| parse_start(&t));
    let mut parts = url.path_segments()?.filter(|p| !p.is_empty());

    let video_id = if host == "youtu.be" {
        parts.next().map(str::to_owned)
    } else if YT_HOSTS.contains(&host.as_str()) {
        match parts.next()? {
            "watch" => param("v"),
            "playlist" => None,
            "browse" if host == "music.youtube.com" => {
                let id = parts.next()?.strip_prefix("VL").filter(|l| is_list_id(l))?;
                if parts.next().is_some() {
                    return None;
                }
                list_id = Some(id.to_owned());
                None
            }
            "channel" => {
                let id = parts.next()?;
                if !is_channel_id(id) || parts.next()? != "live" || parts.next().is_some() {
                    return None;
                }
                let channel_id = Some(id.to_owned());
                return Some(YoutubeRef { video_id: None, list_id: None, channel_id, start: 0 });
            }
            "live" | "shorts" | "embed" | "v" | "e" => parts.next().map(str::to_owned),
            _ => return None,
        }
    } else {
        return None;
    };

    match video_id {
        Some(v) if !is_video_id(&v) => None,
        None if list_id.is_none() => None,
        video_id => Some(YoutubeRef { video_id, list_id, channel_id: None, start }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "jfKfPfyJRdk";

    fn video(url: &str) -> YoutubeRef {
        parse_youtube(url).unwrap_or_else(|| panic!("should parse: {url}"))
    }

    #[test]
    fn watch_youtu_be_shorts_live_embed() {
        for u in [
            format!("https://www.youtube.com/watch?v={ID}"),
            format!("https://m.youtube.com/watch?v={ID}&feature=share"),
            format!("https://music.youtube.com/watch?v={ID}"),
            format!("https://youtu.be/{ID}"),
            format!("https://www.youtube.com/shorts/{ID}"),
            format!("https://www.youtube.com/live/{ID}?si=abc"),
            format!("https://www.youtube-nocookie.com/embed/{ID}"),
        ] {
            let r = video(&u);
            assert_eq!(r.video_id.as_deref(), Some(ID), "{u}");
            assert_eq!(r.list_id, None);
        }
    }

    #[test]
    fn playlists_and_video_in_playlist() {
        let r = video("https://www.youtube.com/playlist?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo");
        assert_eq!(r.video_id, None);
        assert_eq!(r.list_id.as_deref(), Some("PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo"));
        let r = video(&format!("https://www.youtube.com/watch?v={ID}&list=PL12345678"));
        assert_eq!(r.video_id.as_deref(), Some(ID));
        assert_eq!(r.list_id.as_deref(), Some("PL12345678"));
    }

    #[test]
    fn youtube_music() {
        let r = video("https://music.youtube.com/playlist?list=OLAK5uy_kVsBRsMYqzw9Bp3xPZOkmdm1VhQCGngqY");
        assert_eq!(r.list_id.as_deref(), Some("OLAK5uy_kVsBRsMYqzw9Bp3xPZOkmdm1VhQCGngqY"));
        let r = video("https://music.youtube.com/browse/VLPL12345678");
        assert_eq!((r.video_id, r.list_id.as_deref()), (None, Some("PL12345678")));
        let r = video("https://music.youtube.com/playlist?list=VLPL12345678");
        assert_eq!(r.list_id.as_deref(), Some("PL12345678"));
        let r = video(&format!("https://music.youtube.com/watch?v={ID}&list=RDAMVM{ID}&si=x"));
        assert_eq!(r.video_id.as_deref(), Some(ID));
        assert_eq!(r.list_id, Some(format!("RDAMVM{ID}")));
        for bad in [
            "https://music.youtube.com/browse/MPREb_abcdefghijk",
            "https://music.youtube.com/browse/VL",
            "https://music.youtube.com/browse/VLPL12345678/x",
            "https://www.youtube.com/browse/VLPL12345678",
            "https://music.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow",
        ] {
            assert!(parse_youtube(bad).is_none(), "should reject: {bad}");
        }
    }

    #[test]
    fn timestamps() {
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=90")).start, 90);
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=1m30s")).start, 90);
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=1h2m3s")).start, 3723);
        assert_eq!(video(&format!("https://youtu.be/{ID}?start=15")).start, 15);
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=bogus")).start, 0);
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=3s1m")).start, 0);
        assert_eq!(video(&format!("https://youtu.be/{ID}?t=999999999")).start, 86_400);
    }

    #[test]
    fn channel_live_streams() {
        let ch = "UCSJ4gkVC6NrvII8umztf0Ow";
        let r = parse_youtube(&format!("https://www.youtube.com/channel/{ch}/live")).unwrap();
        assert_eq!(r.channel_id.as_deref(), Some(ch));
        assert_eq!((r.video_id, r.list_id), (None, None));
        for bad in [
            format!("https://www.youtube.com/channel/{ch}"),
            format!("https://www.youtube.com/channel/{ch}/videos"),
            format!("https://www.youtube.com/channel/{ch}/live/x"),
            "https://www.youtube.com/channel/UCshort/live".to_string(),
            "https://www.youtube.com/@lofigirl/live".to_string(),
        ] {
            assert!(parse_youtube(&bad).is_none(), "should reject: {bad}");
        }
    }

    #[test]
    fn rejects_everything_else() {
        for u in [
            format!("http://www.youtube.com/watch?v={ID}"),
            format!("https://evil.example/watch?v={ID}"),
            format!("https://youtube.com.evil.example/watch?v={ID}"),
            format!("https://user:pw@www.youtube.com/watch?v={ID}"),
            "https://www.youtube.com/watch?v=short".to_string(),
            "https://www.youtube.com/watch".to_string(),
            "https://www.youtube.com/@channel".to_string(),
            "https://www.youtube.com/playlist?list=%3Cx%3E".to_string(),
            "https://youtu.be/".to_string(),
            "not a url".to_string(),
        ] {
            assert!(parse_youtube(&u).is_none(), "should reject: {u}");
        }
    }
}

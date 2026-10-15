import { describe, expect, it } from "vitest";
import { defaultItemName, parseMediaUrl, parseStartTime, savedUrl, thumbnailUrl, youtubeErrorMessage } from "./media-url";

const yt = (input: string) => {
  const r = parseMediaUrl(input);
  if (r.kind !== "youtube") throw new Error(`expected youtube, got ${r.kind}: ${"message" in r ? r.message : ""}`);
  return r;
};

describe("YouTube links", () => {
  it("parses watch URLs", () => {
    const r = yt("https://www.youtube.com/watch?v=jfKfPfyJRdk");
    expect(r.videoId).toBe("jfKfPfyJRdk");
    expect(r.listId).toBeNull();
  });
  it("parses youtu.be with a timestamp", () => {
    const r = yt("https://youtu.be/jfKfPfyJRdk?t=1m30s");
    expect(r.videoId).toBe("jfKfPfyJRdk");
    expect(r.start).toBe(90);
  });
  it("parses playlists", () => {
    const r = yt("https://www.youtube.com/playlist?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo");
    expect(r.videoId).toBeNull();
    expect(r.listId).toBe("PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo");
  });
  it("parses video + playlist", () => {
    const r = yt("youtube.com/watch?v=jfKfPfyJRdk&list=PL12345678");
    expect(r.videoId).toBe("jfKfPfyJRdk");
    expect(r.listId).toBe("PL12345678");
  });
  it("parses live, shorts, embed and music links", () => {
    expect(yt("https://www.youtube.com/live/jfKfPfyJRdk?si=abc").videoId).toBe("jfKfPfyJRdk");
    expect(yt("https://youtube.com/shorts/jfKfPfyJRdk").videoId).toBe("jfKfPfyJRdk");
    expect(yt("https://www.youtube-nocookie.com/embed/jfKfPfyJRdk").videoId).toBe("jfKfPfyJRdk");
    expect(yt("https://music.youtube.com/watch?v=jfKfPfyJRdk").videoId).toBe("jfKfPfyJRdk");
    expect(yt("https://m.youtube.com/watch?v=jfKfPfyJRdk").videoId).toBe("jfKfPfyJRdk");
  });
  it("rejects malformed IDs and non-video pages", () => {
    expect(parseMediaUrl("https://www.youtube.com/watch?v=short").kind).toBe("error");
    expect(parseMediaUrl("https://www.youtube.com/watch?v=<script>alert(1)</script>").kind).toBe("error");
    expect(parseMediaUrl("https://www.youtube.com/@lofigirl").kind).toBe("error");
    expect(parseMediaUrl("https://www.youtube.com/playlist?list=").kind).toBe("error");
  });
  it("does not treat look-alike hosts as YouTube", () => {
    const r = parseMediaUrl("https://youtube.com.evil.example/watch?v=jfKfPfyJRdk");
    expect(r.kind).toBe("audio");
  });
  it("produces a canonical link", () => {
    expect(yt("https://youtu.be/jfKfPfyJRdk").canonical).toBe("https://www.youtube.com/watch?v=jfKfPfyJRdk");
  });
});

describe("YouTube live streams", () => {
  const UC = "UCSJ4gkVC6NrvII8umztf0Ow";
  it("parses a channel's live URL without any lookup", () => {
    const r = yt(`https://www.youtube.com/channel/${UC}/live`);
    expect(r.channelId).toBe(UC);
    expect(r.videoId).toBeNull();
    expect(r.listId).toBeNull();
    expect(r.canonical).toBe(`https://www.youtube.com/channel/${UC}/live`);
  });
  it("rejects malformed channel IDs", () => {
    expect(parseMediaUrl("https://www.youtube.com/channel/UCshort/live").kind).toBe("error");
    expect(parseMediaUrl(`https://www.youtube.com/channel/${UC}/videos`).kind).toBe("error");
  });
  it("explains why @handle/live links aren't resolved", () => {
    for (const u of ["https://www.youtube.com/@lofigirl/live", "youtube.com/c/LofiGirl/live", "youtube.com/user/foo/live"]) {
      const r = parseMediaUrl(u);
      expect(r.kind).toBe("error");
      if (r.kind === "error") expect(r.message).toContain("@handle");
    }
  });
  it("keeps video IDs for /live/<id> and leaves channelId null", () => {
    const r = yt("https://youtube.com/live/jfKfPfyJRdk");
    expect(r.videoId).toBe("jfKfPfyJRdk");
    expect(r.channelId).toBeNull();
  });
});

describe("direct audio links", () => {
  it("accepts https audio files", () => {
    const r = parseMediaUrl("https://cdn.example.com/music/rain%20sounds.mp3");
    expect(r).toMatchObject({ kind: "audio", name: "rain sounds.mp3", likelyAudio: true });
  });
  it("flags URLs that may be web pages", () => {
    const r = parseMediaUrl("https://example.com/stream");
    expect(r).toMatchObject({ kind: "audio", likelyAudio: false });
  });
  it("rejects insecure and dangerous schemes", () => {
    expect(parseMediaUrl("http://example.com/a.mp3").kind).toBe("error");
    expect(parseMediaUrl("javascript:alert(1)").kind).toBe("error");
    expect(parseMediaUrl("file:///Users/me/a.mp3").kind).toBe("error");
    expect(parseMediaUrl("data:audio/mp3;base64,AAAA").kind).toBe("error");
  });
  it("rejects credentials and streaming web pages", () => {
    expect(parseMediaUrl("https://user:pw@example.com/a.mp3").kind).toBe("error");
    const r = parseMediaUrl("https://open.spotify.com/track/abc");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.message).toContain("Spotify");
  });
  it("rejects garbage", () => {
    expect(parseMediaUrl("").kind).toBe("error");
    expect(parseMediaUrl("   ").kind).toBe("error");
    expect(parseMediaUrl("not a url at all").kind).toBe("error");
  });
});

describe("helpers", () => {
  it("parses start times", () => {
    expect(parseStartTime("75")).toBe(75);
    expect(parseStartTime("1h2m3s")).toBe(3723);
    expect(parseStartTime("abc")).toBe(0);
    expect(parseStartTime(null)).toBe(0);
  });
  it("explains embed restrictions", () => {
    expect(youtubeErrorMessage(150)).toMatch(/doesn't allow/);
    expect(youtubeErrorMessage(101)).toBe(youtubeErrorMessage(150));
  });
});

describe("saved links", () => {
  it("keeps the timestamp in the saved URL and round-trips it", () => {
    const r = yt("https://youtu.be/jfKfPfyJRdk?t=1m30s");
    const url = savedUrl(r);
    expect(url).toBe("https://www.youtube.com/watch?v=jfKfPfyJRdk&t=90");
    expect(yt(url).start).toBe(90);
  });
  it("saves shorts as a canonical watch URL", () => {
    expect(savedUrl(yt("https://www.youtube.com/shorts/jfKfPfyJRdk"))).toBe("https://www.youtube.com/watch?v=jfKfPfyJRdk");
  });
  it("names and thumbnails", () => {
    expect(defaultItemName(yt("https://youtu.be/jfKfPfyJRdk"))).toBe("YouTube video");
    expect(defaultItemName(yt("https://www.youtube.com/playlist?list=PL12345678"))).toBe("YouTube playlist");
    expect(thumbnailUrl("https://www.youtube.com/watch?v=jfKfPfyJRdk")).toBe("https://i.ytimg.com/vi/jfKfPfyJRdk/mqdefault.jpg");
    expect(thumbnailUrl("https://www.youtube.com/playlist?list=PL12345678")).toBeNull();
    expect(thumbnailUrl("https://example.com/a.mp3")).toBeNull();
  });
});

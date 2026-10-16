// Ringlet YouTube host page. Runs inside an iframe served from 127.0.0.1 so
// that the official IFrame Player API receives a valid HTTP referrer.
// It only relays a small, validated command set from the Ringlet window.
(function () {
  "use strict";
  var ALLOWED = "__ALLOWED_PARENT_ORIGINS__";
  var parentOrigin = null;
  var player = null;
  var apiReady = false;
  var pending = null;
  var pollTimer = null;
  var autoplayTimer = null;
  var desiredLoop = true;
  var lastKey = "";
  var lastWasChannel = false;
  var apiFailed = false;

  var ID_RE = /^[A-Za-z0-9_-]{11}$/;
  var LIST_RE = /^[A-Za-z0-9_-]{2,64}$/;
  var CHANNEL_RE = /^UC[A-Za-z0-9_-]{22}$/;

  function post(msg) {
    if (!parentOrigin) return;
    msg.source = "ringlet-player";
    window.parent.postMessage(msg, parentOrigin);
  }

  function snapshot() {
    if (!player || typeof player.getPlayerState !== "function") return;
    var data = (player.getVideoData && player.getVideoData()) || {};
    var list = (player.getPlaylist && player.getPlaylist()) || null;
    post({
      type: "status",
      state: player.getPlayerState(),
      currentTime: player.getCurrentTime ? player.getCurrentTime() : 0,
      duration: player.getDuration ? player.getDuration() : 0,
      volume: player.getVolume ? player.getVolume() : 100,
      muted: player.isMuted ? player.isMuted() : false,
      title: typeof data.title === "string" ? data.title : "",
      author: typeof data.author === "string" ? data.author : "",
      videoId: typeof data.video_id === "string" ? data.video_id : "",
      // True for live streams (including ones with a DVR window, whose
      // duration is non-zero and keeps growing).
      live: data.isLive === true,
      playlistIndex: player.getPlaylistIndex ? player.getPlaylistIndex() : -1,
      playlistLength: list ? list.length : 0
    });
  }

  function startPolling(on) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    // Progress updates only while playing; one per second is plenty.
    if (on) pollTimer = setInterval(snapshot, 1000);
  }

  function armAutoplayCheck() {
    if (autoplayTimer) clearTimeout(autoplayTimer);
    autoplayTimer = setTimeout(function () {
      if (!player) return;
      var st = player.getPlayerState();
      // -1 unstarted, 5 cued: playback didn't begin, so the platform blocked it.
      if (st === -1 || st === 5) post({ type: "autoplay-blocked" });
    }, 3000);
  }

  function create(req) {
    var vars = {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      enablejsapi: 1,
      origin: window.location.origin,
      start: req.start || 0
    };
    if (req.listId) {
      vars.listType = "playlist";
      vars.list = req.listId;
    }
    // A channel's current live stream is the embed `live_stream?channel=` form.
    if (req.channelId) vars.channel = req.channelId;
    player = new YT.Player("player", {
      width: "100%",
      height: "100%",
      videoId: req.channelId ? "live_stream" : (req.videoId || undefined),
      playerVars: vars,
      events: {
        onReady: function (ev) {
          ev.target.setVolume(req.volume);
          if (req.muted) ev.target.mute();
          ev.target.playVideo();
          armAutoplayCheck();
          post({ type: "ready" });
          snapshot();
        },
        onStateChange: function (ev) {
          var live = !!(player.getVideoData && (player.getVideoData() || {}).isLive);
          // A live stream that ends must not be "looped": seeking to 0 would
          // replay the recording or spin on a dead stream.
          if (ev.data === 0 && desiredLoop && !req.listId && !live) {
            ev.target.seekTo(0, true);
            ev.target.playVideo();
          }
          if (ev.data === 0 && desiredLoop && req.listId && player.getPlaylist) {
            var list = player.getPlaylist() || [];
            if (player.getPlaylistIndex() >= list.length - 1) player.playVideoAt(0);
          }
          if (ev.data === 1 && autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
          startPolling(ev.data === 1);
          snapshot();
        },
        onError: function (ev) {
          post({ type: "error", code: ev.data });
        },
        onAutoplayBlocked: function () {
          post({ type: "autoplay-blocked" });
        }
      }
    });
  }

  function load(req) {
    var key = (req.videoId || "") + "|" + (req.listId || "") + "|" + (req.channelId || "");
    if (player && typeof player.loadVideoById === "function") {
      if (key === lastKey) { player.playVideo(); armAutoplayCheck(); return; }
      lastKey = key;
      if (req.channelId || lastWasChannel || (req.videoId && req.listId)) {
        // loadVideoById can't take a channel, and loadPlaylist can't start at
        // a given video, so rebuild the player for both (as a cold start does).
        lastWasChannel = !!req.channelId;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        player.destroy();
        player = null;
        var holder = document.createElement("div");
        holder.id = "player";
        document.body.insertBefore(holder, document.body.firstChild);
        create(req);
        return;
      }
      if (req.listId) {
        player.loadPlaylist({ listType: "playlist", list: req.listId, index: 0, startSeconds: req.start || 0 });
      } else {
        player.loadVideoById({ videoId: req.videoId, startSeconds: req.start || 0 });
      }
      armAutoplayCheck();
      return;
    }
    lastKey = key;
    lastWasChannel = !!req.channelId;
    create(req);
  }

  function num(v, lo, hi, d) {
    return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;
    if (ALLOWED.indexOf(ev.origin) === -1) return;
    var m = ev.data;
    if (!m || typeof m !== "object" || m.target !== "ringlet-player") return;
    parentOrigin = ev.origin;

    if (m.type === "hello") { post({ type: "hello", apiReady: apiReady, apiFailed: apiFailed }); return; }
    if (m.type === "load") {
      var videoId = typeof m.videoId === "string" && ID_RE.test(m.videoId) ? m.videoId : null;
      var listId = typeof m.listId === "string" && LIST_RE.test(m.listId) ? m.listId : null;
      var channelId = typeof m.channelId === "string" && CHANNEL_RE.test(m.channelId) ? m.channelId : null;
      if (!videoId && !listId && !channelId) { post({ type: "error", code: 2 }); return; }
      desiredLoop = m.loop !== false;
      var req = {
        videoId: videoId, listId: listId, channelId: channelId,
        start: Math.floor(num(m.start, 0, 86400, 0)),
        volume: Math.round(num(m.volume, 0, 100, 70)),
        muted: m.muted === true
      };
      if (apiReady) load(req); else pending = req;
      return;
    }
    if (!player || typeof player.getPlayerState !== "function") return;
    switch (m.type) {
      case "play": player.playVideo(); armAutoplayCheck(); break;
      case "pause": player.pauseVideo(); break;
      case "stop": player.stopVideo(); startPolling(false); break;
      case "seek": player.seekTo(num(m.seconds, 0, 864000, 0), true); break;
      case "volume": player.setVolume(Math.round(num(m.value, 0, 100, 70))); break;
      case "mute": if (m.muted) player.mute(); else player.unMute(); break;
      case "loop": desiredLoop = m.loop === true; break;
      case "next": if (player.nextVideo) player.nextVideo(); break;
      case "previous": if (player.previousVideo) player.previousVideo(); break;
      default: return;
    }
    setTimeout(snapshot, 150);
  });

  window.onYouTubeIframeAPIReady = function () {
    apiReady = true;
    post({ type: "hello", apiReady: true, apiFailed: false });
    if (pending) { var r = pending; pending = null; load(r); }
  };

  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = function () { apiFailed = true; post({ type: "api-failed" }); };
  document.head.appendChild(tag);

})();

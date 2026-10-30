/** Native media adapter. The hero timeline alone decides when this shot runs. */
export function createMacroVideo(video: HTMLVideoElement, schedule: () => void, sourceOutMs = 1500) {
  let phase: "idle" | "starting" | "playing" | "finishing" | "ended" | "fallback" = "idle";
  let visible = false, requested = false, suspended = false, disposed = false;
  let generation = 0, callback = 0, stalledMs = 0, lastMediaTime = 0;
  let finishFrames = 0;
  const cancelFrame = () => {
    if (callback) video.cancelVideoFrameCallback(callback);
    callback = 0;
  };
  const fallback = () => {
    generation++;
    cancelFrame();
    video.pause();
    phase = "fallback";
    visible = false;
    schedule();
  };
  const prepare = () => {
    if (disposed || video.getAttribute("src")) return;
    if (!video.canPlayType('video/mp4; codecs="avc1.64001f"')) { fallback(); return; }
    // No video request on arrival, reduced motion, or direct content entry.
    video.muted = video.defaultMuted = true;
    video.preload = "auto";
    video.src = "/hero/coffee-macro-motion.mp4";
    video.load();
  };
  const requestPlay = () => {
    cancelFrame();
    requested = true;
    const token = generation;
    const reveal = () => {
      callback = 0;
      if (!disposed && token === generation && phase !== "fallback" && phase !== "idle") {
        visible = true;
        schedule();
      }
    };
    // Keep the approved still underneath until a real decoded frame is presented.
    if (typeof video.requestVideoFrameCallback === "function") callback = video.requestVideoFrameCallback(reveal);
    video.play().then(() => {
      if (disposed || token !== generation) return;
      if (suspended) video.pause();
      phase = "playing";
      if (typeof video.requestVideoFrameCallback !== "function") reveal();
      schedule();
    }, () => {
      if (!disposed && token === generation) {
        if (suspended) requested = false;
        else fallback();
      }
    });
  };
  const complete = () => {
    if (disposed || phase !== "finishing") return;
    cancelFrame();
    phase = "ended";
    visible = true;
    schedule();
  };
  const finish = () => {
    if (phase !== "playing" && phase !== "starting") return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) { fallback(); return; }
    phase = "finishing";
    video.pause();
    stalledMs = finishFrames = 0;
    cancelFrame();
    const token = generation;
    if (typeof video.requestVideoFrameCallback === "function") callback = video.requestVideoFrameCallback(() => {
      callback = 0;
      if (token === generation) complete();
    });
    // Retain the last frame inside the selected source range. The original file
    // and its playback speed stay intact; one buffered seek prevents a stale
    // retained frame in WebKit. This is an edit point, not continuous scrubbing.
    try { video.currentTime = Math.max(0, Math.min(video.duration, sourceOutMs / 1000) - .001); }
    catch { fallback(); }
    schedule();
  };
  const seeked = () => { if (phase === "finishing") { finishFrames = 2; schedule(); } };
  const begin = () => {
    generation++;
    cancelFrame();
    video.pause();
    phase = video.error ? "fallback" : "starting";
    visible = requested = suspended = false;
    stalledMs = lastMediaTime = finishFrames = 0;
    prepare();
    // One reset per deliberate forward visit; no backward playback or scrubbing.
    if (video.currentTime) video.currentTime = 0;
    video.playbackRate = video.defaultPlaybackRate = 1;
    video.muted = video.defaultMuted = true;
  };
  const tick = (elapsedMs: number) => {
    if (phase === "starting" || phase === "playing") {
      if (!requested && !suspended && video.readyState >= 2) requestPlay();
      stalledMs = video.currentTime > lastMediaTime + .001 ? 0 : stalledMs + Math.max(0, elapsedMs);
      lastMediaTime = video.currentTime;
      if (!suspended && video.currentTime * 1000 >= sourceOutMs) finish();
      // Loading, rejected autoplay and stalled decodes cannot trap scroll.
      if (stalledMs >= 2000) fallback();
    }
    if (phase === "finishing") {
      stalledMs += Math.max(0, elapsedMs);
      // Paused seeks to the same already-present frame may omit a frame callback.
      // After seeked, two paints also suffice; failed seeks retain bounded fallback.
      if (elapsedMs > 0 && finishFrames > 0 && --finishFrames === 0) complete();
      else if (stalledMs >= 2000) fallback();
    }
    return { phase, visible, time: video.currentTime * 1000 };
  };
  const pause = () => { suspended = true; video.pause(); };
  const resume = () => {
    suspended = false;
    if (phase === "starting" || phase === "playing") requested = false;
  };
  const stop = () => {
    generation++;
    cancelFrame();
    video.pause();
    phase = "idle";
    visible = false;
    requested = false;
    finishFrames = 0;
  };
  video.addEventListener("error", fallback);
  video.addEventListener("ended", finish);
  video.addEventListener("seeked", seeked);
  return {
    prepare, begin, tick, pause, resume, stop,
    dispose() {
      disposed = true;
      stop();
      video.removeEventListener("error", fallback);
      video.removeEventListener("ended", finish);
      video.removeEventListener("seeked", seeked);
      video.removeAttribute("src");
      video.load();
    },
  };
}

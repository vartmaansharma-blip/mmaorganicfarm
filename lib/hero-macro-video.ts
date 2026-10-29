/** Native media adapter. The hero timeline alone decides when this shot runs. */
export function createMacroVideo(video: HTMLVideoElement, schedule: () => void) {
  let phase: "idle" | "starting" | "playing" | "ended" | "fallback" = "idle";
  let visible = false, requested = false, suspended = false, disposed = false;
  let generation = 0, callback = 0, stalledMs = 0, lastMediaTime = 0;
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
  const begin = () => {
    generation++;
    cancelFrame();
    video.pause();
    phase = video.error ? "fallback" : "starting";
    visible = requested = suspended = false;
    stalledMs = lastMediaTime = 0;
    prepare();
    // One reset per deliberate forward visit; never seek while playing/reversing.
    if (video.currentTime) video.currentTime = 0;
    video.playbackRate = video.defaultPlaybackRate = 1;
    video.muted = video.defaultMuted = true;
  };
  const tick = (elapsedMs: number) => {
    if (phase === "starting" || phase === "playing") {
      if (!requested && !suspended && video.readyState >= 2) requestPlay();
      if (video.ended) phase = "ended";
      else {
        stalledMs = video.currentTime > lastMediaTime + .001 ? 0 : stalledMs + Math.max(0, elapsedMs);
        lastMediaTime = video.currentTime;
        // Loading, rejected autoplay and stalled decodes cannot trap scroll.
        if (stalledMs >= 2000) fallback();
      }
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
  };
  video.addEventListener("error", fallback);
  return {
    prepare, begin, tick, pause, resume, stop,
    dispose() {
      disposed = true;
      stop();
      video.removeEventListener("error", fallback);
      video.removeAttribute("src");
      video.load();
    },
  };
}

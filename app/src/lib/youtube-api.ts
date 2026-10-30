/**
 * The YouTube IFrame API, loaded on demand — shared by every click-to-play
 * video facade (the Revalida hero video, the ClinAct sales video). Nothing from
 * YouTube loads until a visitor presses play; then this injects
 * https://www.youtube.com/iframe_api once per page.
 *
 * Browser-only: call it from an effect or an event handler, never at render.
 */

export type YTPlayer = {
  playVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

export type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once per page; rejects after 8 s (blocked/offline). */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("youtube api timeout")), 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("youtube api missing"));
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("youtube api blocked"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    ytApi = null; // let a later click retry
    throw e;
  });
  return ytApi;
}

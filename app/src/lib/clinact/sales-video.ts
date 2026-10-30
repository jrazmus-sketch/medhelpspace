/**
 * The ClinAct presentation video on the sales page (Karina 2026-10-30: a block
 * "Conheça o ClinAct por dentro" between the opening and the four formats).
 *
 * The video lives on YouTube, like the Revalida sales video. Its id is ONE
 * `site_content` row, set from /admin/clinact/pagina — so the block can ship
 * before the video exists and appear the moment someone pastes the link, with
 * no deploy. No row (or anything that is not a YouTube id): the whole block
 * renders nothing, never an empty frame.
 *
 * The cover is the image slot `clinact.video.image` (lib/clinact/sales-images.ts);
 * without one, the video's own YouTube thumbnail stands in.
 *
 * Pure (no server imports) so the page, the admin and the tests share it.
 */

export const SALES_VIDEO_KEY = "clinact.video.youtube";

const ID = /^[A-Za-z0-9_-]{11}$/;

/** True for a bare YouTube video id — what is stored, and all the page renders. */
export function isYouTubeId(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}

/**
 * The video id from whatever an admin pastes: the bare id, a youtu.be link, or a
 * youtube.com watch / embed / shorts / live link. Null when it is none of those.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (isYouTubeId(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/);
      id = m ? m[1] : null;
    }
  }
  return isYouTubeId(id) ? id : null;
}

/** YouTube's own thumbnail — the cover when no image has been uploaded. */
export function youTubeThumbnail(id: string, size: "maxresdefault" | "hqdefault" = "maxresdefault"): string {
  return `https://i.ytimg.com/vi/${id}/${size}.jpg`;
}

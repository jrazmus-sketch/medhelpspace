// Server side of lib/magnet/first-touch.ts: read the first-landing cookie inside a
// server action. Best-effort — a missing or malformed cookie is simply "no first
// touch" and the action falls back to what the funnel page saw.
import { cookies } from "next/headers";
import { FIRST_TOUCH_COOKIE, parseFirstTouch, type FirstTouch } from "./first-touch";

export async function readFirstTouch(): Promise<FirstTouch | null> {
  try {
    const jar = await cookies();
    return parseFirstTouch(jar.get(FIRST_TOUCH_COOKIE)?.value ?? null);
  } catch {
    return null;
  }
}

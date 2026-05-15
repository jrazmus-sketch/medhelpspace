export const VIEWAS_COOKIE = "mhs-viewas";

export type ViewAsMode =
  | { type: "admin" }
  | { type: "unlocked" }
  | { type: "cohort"; slug: string };

export function parseViewAs(value: string | undefined): ViewAsMode {
  if (!value || value === "admin") return { type: "admin" };
  if (value === "unlocked") return { type: "unlocked" };
  if (value.startsWith("cohort:")) return { type: "cohort", slug: value.slice(7) };
  return { type: "admin" };
}

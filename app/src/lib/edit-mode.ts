export const EDIT_MODE_COOKIE = "mhs-edit-mode";

export function parseEditMode(value: string | undefined): boolean {
  return value === "on";
}

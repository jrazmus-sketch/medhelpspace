import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
// Line endings normalised: git may check files out with CRLF on Windows.
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

// The first permission call inside an exported server action.
function gateOf(src: string, fn: string): string {
  const i = src.indexOf(`export async function ${fn}(`);
  assert.ok(i >= 0, `${fn} not found`);
  const m = src.slice(i, i + 600).match(/await (require[A-Za-z]+)\(\)/);
  assert.ok(m, `${fn} has no permission check`);
  return m[1];
}

test("content writes need the content tier, not just 'any admin'", () => {
  const src = read("actions/admin.ts");
  for (const fn of [
    "updatePageMetadata",
    "updateLessons",
    "savePageBody",
    "updateQuizQuestions",
    "updateFlashcards",
    "uploadLessonAudio",
    "createAnnouncement",
    "updateAnnouncement",
    "deleteAnnouncement",
    "createAnnouncementCategory",
    "deleteAnnouncementCategory",
    "updateSiteSetting",
  ]) {
    assert.equal(gateOf(src, fn), "requireContentRole", fn);
  }
  assert.match(src, /const CONTENT_ROLES = \["super_admin", "content_admin"\];/);
});

test("password resets and session revocation are member-access actions", () => {
  const src = read("actions/admin.ts");
  assert.equal(gateOf(src, "sendPasswordReset"), "requireMemberAccessRole");
  assert.equal(gateOf(src, "revokeUserSessions"), "requireMemberAccessRole");
});

test("inline edits are content tier", () => {
  const src = read("actions/inline-edit.ts");
  assert.ok(src.includes('!["super_admin", "content_admin"].includes(profile.role as string)'));
  assert.ok(!src.includes('profile.role === "member") throw'), "rejecting only 'member' lets every tier in");
});

test("the members page redirects content admins and never ships revenue to non-billing tiers", () => {
  const src = read("app/admin/members/page.tsx");
  assert.ok(src.includes('if (!MEMBER_ACCESS_ROLES.includes(currentUserRole)) redirect("/admin")'));
  // The paid-orders query only runs for billing roles.
  assert.match(src, /canSeeBilling\s*\?\s*admin\.from\("orders"\)/);
  // The redirect happens before any member data is read.
  assert.ok(src.indexOf('redirect("/admin")') < src.indexOf('.from("profiles")\n        .select("id, email'));
});

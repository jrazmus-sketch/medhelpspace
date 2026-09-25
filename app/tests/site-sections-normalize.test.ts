import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSectionRows } from "@/lib/site-sections-order";

const KNOWN = ["hero", "gratuitos", "planos"];

test("stores the submitted order as positions 1..n", () => {
  const rows = normalizeSectionRows(KNOWN, [
    { key: "planos", visible: true },
    { key: "hero", visible: false },
    { key: "gratuitos", visible: true },
  ]);
  assert.deepEqual(rows, [
    { key: "planos", visible: true, position: 1 },
    { key: "hero", visible: false, position: 2 },
    { key: "gratuitos", visible: true, position: 3 },
  ]);
});

test("an always-visible section cannot be hidden, whatever the form sends", () => {
  const rows = normalizeSectionRows(
    KNOWN,
    [
      { key: "hero", visible: true },
      { key: "gratuitos", visible: true },
      { key: "planos", visible: false },
    ],
    ["planos"],
  );
  assert.equal(rows?.find((r) => r.key === "planos")?.visible, true);
});

test("a stale or tampered list is refused, never guessed at", () => {
  // missing a key
  assert.equal(normalizeSectionRows(KNOWN, [{ key: "hero", visible: true }, { key: "planos", visible: true }]), null);
  // unknown key
  assert.equal(
    normalizeSectionRows(KNOWN, [
      { key: "hero", visible: true },
      { key: "evil", visible: true },
      { key: "planos", visible: true },
    ]),
    null,
  );
  // duplicate key
  assert.equal(
    normalizeSectionRows(KNOWN, [
      { key: "hero", visible: true },
      { key: "hero", visible: true },
      { key: "planos", visible: true },
    ]),
    null,
  );
});

test("visible must be literally true — a truthy string does not count", () => {
  const rows = normalizeSectionRows(KNOWN, [
    { key: "hero", visible: "false" as unknown as boolean },
    { key: "gratuitos", visible: true },
    { key: "planos", visible: true },
  ]);
  assert.equal(rows?.[0].visible, false);
});

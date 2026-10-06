import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelHubs } from "@/lib/hub-nesting";

// Karina 2026-10-06: Resumos → Outros → Oftalmologia / Otorrino / Urologia. The three
// area hubs are blurb-nav-hubs of the same view + specialty as "Outros Resumos";
// the lists of hubs (Resumos accordion, specialty page, breadcrumb lookup) must show
// only the specialty's own hub.

const outros = { id: 91022, slug: "outros-resumos", parent_id: null };
const areas = [
  { id: 91026, slug: "oftalmologia-resumos", parent_id: 91022 },
  { id: 91027, slug: "otorrinolaringologia-resumos", parent_id: 91022 },
  { id: 91028, slug: "urologia-resumos", parent_id: 91022 },
];

test("area hubs nested in a listed hub are dropped", () => {
  assert.deepEqual(topLevelHubs([...areas, outros]).map((h) => h.slug), ["outros-resumos"]);
});

test("a parent outside the list (the legacy 'resumos' text-lesson) keeps the hub", () => {
  const cardio = { id: 1656, slug: "cardiologia-resumos", parent_id: 1560 };
  assert.deepEqual(topLevelHubs([cardio]).map((h) => h.slug), ["cardiologia-resumos"]);
});

test("ids from postgres.js arrive as strings — still matched", () => {
  const rows = [{ id: "91022", parent_id: null }, { id: "91026", parent_id: "91022" }];
  assert.deepEqual(topLevelHubs(rows).map((h) => h.id), ["91022"]);
});

/**
 * Provenance survives the trip into a stored GTP.
 *
 * The defect this pins: the builder mapped every tag that was not LOOKUP or CALC into
 * "client-fixed", so a value an operator typed by hand was filed identically to one a state
 * board mandated. The detail view then rendered both with the same "Client-mandated" badge and
 * applied the same Owner-only edit rule to both.
 *
 * That is the provenance claim this codebase refuses to make everywhere else — works data is not
 * an IS table — made silently, in the one place a reviewer actually reads.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { GtpSectionSource } from "@/lib/services/types";

import { sectionSourceFor } from "./pdf-document";
import type { FieldTag, ResolvedField } from "./types";

const field = (tag: FieldTag, key: string): ResolvedField => ({
  key,
  label: key,
  value: "x",
  tag,
  source: "is-table",
  trace: "t",
  editable: false,
  tolerance: { value: "N/A", origin: "not-applicable", trace: "no tolerance applies" },
});

test("a hand-typed value is never filed as customer-mandated", () => {
  // The whole point. MANUAL means a person typed it and nothing verifies it; client-fixed means
  // the buyer's own format demands it. Conflating them misattributes responsibility for a value
  // on a document a board stamps.
  assert.equal(sectionSourceFor("MANUAL"), "manual");
  assert.notEqual(sectionSourceFor("MANUAL"), sectionSourceFor("QUIRK"));
});

test("each tag maps to exactly one stored provenance", () => {
  const expected: Record<FieldTag, GtpSectionSource> = {
    LOOKUP: "is-standard",
    CALC: "is-standard",
    CHOICE: "is-standard",
    FIXED: "is-standard",
    QUIRK: "client-fixed",
    MANUAL: "manual",
  };
  for (const [tag, want] of Object.entries(expected) as [FieldTag, GtpSectionSource][]) {
    assert.equal(sectionSourceFor(tag), want, `${tag} mapped wrongly`);
  }
});

test("a document carrying all four provenances keeps them distinguishable", () => {
  // The DoD case: one LOOKUP, one CALC, one QUIRK, one MANUAL in one stored record.
  const fields = [
    field("LOOKUP", "power.insulationThickness"),
    field("CALC", "power.diaOverInsulation"),
    field("QUIRK", "mark.customerLegend"),
    field("MANUAL", "custom.tenderClause"),
  ];
  const stored = fields.map((f) => ({ id: f.key, label: f.label, value: String(f.value), source: sectionSourceFor(f.tag) }));

  assert.equal(stored.find((s) => s.id === "power.insulationThickness")?.source, "is-standard");
  assert.equal(stored.find((s) => s.id === "power.diaOverInsulation")?.source, "is-standard");
  assert.equal(stored.find((s) => s.id === "mark.customerLegend")?.source, "client-fixed");
  assert.equal(stored.find((s) => s.id === "custom.tenderClause")?.source, "manual");

  // Three distinct provenances present — not everything collapsed into two.
  assert.equal(new Set(stored.map((s) => s.source)).size, 3);
});

test("the mapping is total — a new tag cannot slip through untyped", () => {
  // sectionSourceFor switches exhaustively with no default branch, so adding a FieldTag without
  // handling it is a compile error rather than a silent fallback to "is-standard". Adding a
  // sixth tag and omitting it here would fail `npx tsc --noEmit`, which is the intended gate.
  const allTags: FieldTag[] = ["LOOKUP", "CALC", "CHOICE", "QUIRK", "FIXED", "MANUAL"];
  for (const tag of allTags) {
    assert.ok(sectionSourceFor(tag), `${tag} produced no provenance`);
  }
});

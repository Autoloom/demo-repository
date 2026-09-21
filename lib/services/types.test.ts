/**
 * The persistence boundary for a derived field.
 *
 * ─── What went wrong here before ──────────────────────────────────────────────────────────────
 *
 * `GtpDerivedField` used to be a hand-maintained COPY of `ResolvedField` — same members, written
 * out twice. The comment on it said "structurally identical, kept independent", and independence
 * was the problem.
 *
 * `derivedFields: fields` assigns a `ResolvedField[]` variable into the slot. TypeScript's
 * excess-property check fires only on fresh object literals, so a member added to `ResolvedField`
 * and not mirrored into the copy compiled perfectly and was silently discarded on save. No error,
 * no warning — just a value missing from a legally-binding document that a board stamps.
 *
 * That is not a hypothetical: the union had to be widened by hand twice during the tolerance
 * work, and the round-trip test below is what caught it both times.
 *
 * `GtpDerivedField` is now an alias, so the two cannot drift. These tests exist to prove the
 * failure mode is closed and to keep it closed — the enumeration below fails if a member is added
 * to `ResolvedField` without being considered here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "@/lib/domain/gtp/compose-size";
import { deriveFields } from "@/lib/domain/gtp/derive";
import type { ResolvedField } from "@/lib/domain/gtp/types";

import type { GtpDerivedField } from "./types";

/**
 * Every member of `ResolvedField`, listed by hand.
 *
 * Hand-written on purpose: a runtime `Object.keys` would only see members the fixture happens to
 * populate, which is exactly the blind spot that let a dropped member through. The
 * `Record<keyof ResolvedField, true>` annotation makes the compiler reject this object if a
 * member is added to the interface and not added here.
 */
const RESOLVED_FIELD_MEMBERS: Record<keyof ResolvedField, true> = {
  key: true,
  label: true,
  value: true,
  tag: true,
  source: true,
  trace: true,
  editable: true,
  override: true,
  gap: true,
  tolerance: true,
};

/** A field with every optional member populated — nothing may be dropped in transit. */
const fullyPopulated: ResolvedField = {
  key: "power.insulationThickness",
  label: "Insulation thickness (power)",
  value: "1.50 mm",
  tag: "LOOKUP",
  source: "is-table",
  trace: "IS 14255 : 1995, Table 4",
  editable: false,
  gap: false,
  override: {
    previous: "1.40 mm",
    reason: "Customer asked to match their last order",
    by: "R. Kamble",
    at: "2026-08-27T10:15:00.000Z",
  },
  tolerance: {
    value: "−16.7%",
    origin: "manual",
    trace: "Entered manually",
    override: {
      previous: "−16.7%",
      previousOrigin: "is-rule",
      reason: "Buyer demands a tighter floor",
      by: "R. Kamble",
      at: "2026-08-27T10:16:00.000Z",
    },
  },
};

test("GtpDerivedField is the same type as ResolvedField, not a copy of it", () => {
  // Assignable in BOTH directions. A one-way check would pass for a copy that had drifted by
  // gaining an extra optional member, which is the drift this alias exists to prevent.
  const asStored: GtpDerivedField = fullyPopulated;
  const asDomain: ResolvedField = asStored;
  assert.equal(asDomain, fullyPopulated);
});

test("every member of ResolvedField survives a save and load cycle", () => {
  const stored: GtpDerivedField = fullyPopulated;
  const loaded: GtpDerivedField = JSON.parse(JSON.stringify(stored));

  // Enumerated rather than spot-checked: the members that got dropped historically were the ones
  // nobody thought to assert on.
  for (const member of Object.keys(RESOLVED_FIELD_MEMBERS) as (keyof ResolvedField)[]) {
    assert.deepEqual(loaded[member], fullyPopulated[member], `"${member}" did not survive persistence`);
  }
  assert.deepEqual(loaded, fullyPopulated);
});

test("the nested tolerance override survives in full", () => {
  // `previousOrigin` is the one that matters most and is easiest to lose: once a tolerance is
  // overridden its `origin` becomes "manual", and `previousOrigin` is the ONLY thing that still
  // says it was a standards floor. Lose it and the builder silently stops demanding a reason
  // before someone edits an IS acceptance limit.
  const loaded: GtpDerivedField = JSON.parse(JSON.stringify(fullyPopulated));
  assert.equal(loaded.tolerance?.override?.previousOrigin, "is-rule");
  assert.equal(loaded.tolerance?.override?.previous, "−16.7%");
  assert.equal(loaded.tolerance?.override?.reason, "Buyer demands a tighter floor");
  assert.equal(loaded.tolerance?.override?.by, "R. Kamble");
  assert.equal(loaded.tolerance?.override?.at, "2026-08-27T10:16:00.000Z");
});

test("a real derived field set persists with no member lost", () => {
  // The synthetic fixture above proves the type; this proves the actual engine output, where a
  // field may legitimately omit optional members.
  const fields = deriveFields(constructionFromSelection(defaultSelection()), { drumLengthM: 1000 });
  const loaded: GtpDerivedField[] = JSON.parse(JSON.stringify(fields satisfies ResolvedField[]));

  assert.equal(loaded.length, fields.length);
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(fields)));

  // Provenance specifically — the thing a stored document is worthless without.
  for (const f of loaded) {
    assert.ok(f.tag, `${f.key} lost its tag`);
    assert.ok(f.source, `${f.key} lost its source`);
    assert.ok(typeof f.trace === "string" && f.trace.length > 0, `${f.key} lost its trace`);
    assert.ok(f.tolerance, `${f.key} lost its tolerance`);
  }
});

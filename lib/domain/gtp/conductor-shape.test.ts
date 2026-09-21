/**
 * Conductor shape: stated on the GTP, absent from the fictitious chain.
 *
 * The manufacturer's point (21 Sept 2026) is right and worth stating plainly: LT power aluminium
 * is generally sector-shaped and compacted, and a GTP that does not say so is incomplete.
 *
 * But the correction has to land in the right place, and the obvious fix is wrong. IS 10462
 * (Part 1) §0.3 ignores conductor shape and compactness BY DESIGN, so that every manufacturer
 * keying into the sheath and armour tables lands on the same row for the same cable. Making
 * shape move those lookups would select a different sheath thickness from the one the standard
 * prescribes — a real compliance defect dressed up as an accuracy improvement.
 *
 * So these tests pin both halves:
 *   - the GTP states the form (this is the fix the manufacturer asked for), and
 *   - the dimensions do not move (this is what the standard requires).
 *
 * What a sector conductor genuinely changes is the cable's ACTUAL diameter, which §0.4 puts
 * outside this method: "not a replacement for the calculation of normal diameters required for
 * practical purposes, which should be calculated separately." We hold no source for that figure,
 * so it is not computed, and the fictitious rows now carry the §0.4 caveat rather than being
 * read as the finished cable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveLtMass, isMassGap } from "./mass";

const base: LtCableConfig = {
  standard: "IS7098-1",
  csaSqMm: 240,
  coreCount: 3.5,
  material: "AL",
  armoured: true,
  armourForm: "formed-wire",
  armourMethod: "A",
};

test("shape does not move the fictitious chain — IS 10462 §0.3", () => {
  const circular = deriveLtCable({ ...base, shape: "circular" });
  const sector = deriveLtCable({ ...base, shape: "sector" });

  assert.deepEqual(
    sector.steps.map((s) => [s.id, s.value]),
    circular.steps.map((s) => [s.id, s.value]),
    "the fictitious method ignores shape by design; if this diverges, the sheath and armour " +
      "lookups have been moved off the rows the standard prescribes",
  );
});

test("shape does not move the derived mass either", () => {
  // Mass is computed from the chain's diameters, so if the chain is shape-blind the mass must be
  // too. The real sector cable is lighter, but that follows from its REAL diameter, which this
  // method does not produce.
  const c = deriveLtMass({ ...base, shape: "circular" });
  const s = deriveLtMass({ ...base, shape: "sector" });
  assert.ok(!isMassGap(c) && !isMassGap(s));
  if (isMassGap(c) || isMassGap(s)) return;
  assert.equal(s.totalKgPerKm, c.totalKgPerKm);
});

test("the GTP states the conductor form, and aluminium defaults to sector", () => {
  const row = deriveLtFields(base).find((f) => f.key === "lt.conductorForm");
  assert.ok(row, "a GTP must state the form of conductor");
  assert.match(String(row.value), /Shaped \(sector\), compacted/);
  assert.match(row.trace, /IS 8130/);
});

test("copper control cable defaults to circular, not sector", () => {
  // Sector is the LT power aluminium norm, not a universal one — control cable is round.
  const row = deriveLtFields({
    standard: "IS1554-1", csaSqMm: 2.5, coreCount: 27, material: "CU", armoured: true,
  }).find((f) => f.key === "lt.conductorForm");
  assert.match(String(row!.value), /Circular, compacted/);
});

test("an explicit choice overrides the default", () => {
  const row = deriveLtFields({ ...base, shape: "circular" }).find((f) => f.key === "lt.conductorForm");
  assert.match(String(row!.value), /Circular, compacted/);
});

test("every fictitious row warns that it is not the finished cable's diameter", () => {
  // §0.4. Without this a reader takes D_X for the cable going on the drum — worst on sector
  // conductors, where the real cable is appreciably smaller than the fictitious figure.
  const calcRows = deriveLtFields(base).filter((f) => f.key.startsWith("lt.calc."));
  assert.ok(calcRows.length > 0, "the chain must publish its calculated diameters");
  for (const row of calcRows) {
    assert.match(row.trace, /ignores conductor shape and compactness/, `${row.key} must carry the §0.4 caveat`);
  }
});

/**
 * The catalogue, cross-checked against the standards it claims to conform to.
 *
 * A transcribed table is only as good as its verification, and "it typechecks" verifies nothing.
 * So rather than restate the rows (which would only prove I copied my own copy), these tests
 * check the catalogue against INDEPENDENT sources already encoded in this repo: IS 7098-1
 * Table 3 for insulation, Table 2 for reduced neutrals, Table 8 for sheaths, and the internal
 * consistency the brochure itself must satisfy.
 *
 * Where the catalogue and a standard genuinely differ, the divergence is asserted as a
 * divergence — pinned, so it stays visible rather than being quietly "corrected" later.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATALOGUE_DIVERGENCES,
  DAKSHA_CATALOGUE,
  DAKSHA_CONTROL_1_5,
  DAKSHA_CONTROL_2_5,
  DAKSHA_LT_XLPE_35_ALUMINIUM,
  DAKSHA_LT_XLPE_35_COPPER,
  catalogueForArmour,
  findCatalogueRow,
} from "./daksha-2026";
import { reducedNeutralSize, xlpeInsulationThickness } from "@/lib/domain/standards/is7098-1-2025";

test("LT XLPE insulation matches IS 7098 (Part 1) Table 3 at every size", () => {
  for (const row of DAKSHA_LT_XLPE_35_ALUMINIUM.rows) {
    const is = xlpeInsulationThickness({ csaSqMm: row.csaSqMm, coreCount: 3.5, armoured: true });
    assert.equal(
      row.insulationThicknessMm,
      is.nominalMm,
      `${row.csaSqMm} sq mm: catalogue says ${row.insulationThicknessMm}, IS Table 3 says ${is.nominalMm}`,
    );
  }
});

test("every neutral wall matches Table 3 for its own size — except the 50 row, which contradicts itself", () => {
  // The catalogue prints a separate, thinner wall for the reduced neutral, and it should be the
  // Table 3 value for the NEUTRAL's cross-section. This check is what exposed the 50 row: its
  // wall is 0.9 mm, the Table 3 thickness for a 25 sq mm conductor, while its size label says 16
  // (which would take 0.7 mm). Two columns in one row describing different conductors.
  const anomalies: string[] = [];
  for (const row of DAKSHA_LT_XLPE_35_ALUMINIUM.rows) {
    if (row.neutralSqMm === undefined || row.neutralInsulationThicknessMm === undefined) continue;
    const is = xlpeInsulationThickness({ csaSqMm: row.neutralSqMm, coreCount: 3.5, armoured: true });
    if (row.neutralInsulationThicknessMm !== is.nominalMm) {
      anomalies.push(`${row.csaSqMm}/${row.neutralSqMm}: wall ${row.neutralInsulationThicknessMm} vs Table 3 ${is.nominalMm}`);
    }
  }
  // Exactly one, and it is the row already carried in CATALOGUE_DIVERGENCES. A second would mean
  // the transcription is wrong rather than the brochure.
  assert.deepEqual(anomalies, ["50/16: wall 0.9 vs Table 3 0.7"]);

  // And the corroboration: 0.9 mm is what Table 3 gives a 25 sq mm core, which is also what
  // Table 2 pairs with 50. Both independent columns point at 25.
  assert.equal(xlpeInsulationThickness({ csaSqMm: 25, coreCount: 3.5, armoured: true }).nominalMm, 0.9);
});

test("reduced neutral pairings match IS 7098 Table 2 — except the one recorded divergence", () => {
  const mismatches: string[] = [];
  for (const row of DAKSHA_LT_XLPE_35_ALUMINIUM.rows) {
    if (row.neutralSqMm === undefined) continue;
    const is = reducedNeutralSize(row.csaSqMm);
    if (is.neutralSqMm !== row.neutralSqMm) {
      mismatches.push(`${row.csaSqMm}: catalogue ${row.neutralSqMm}, IS ${is.neutralSqMm}`);
    }
  }
  // Exactly one, and it is the one carried in CATALOGUE_DIVERGENCES. If a second appears, the
  // transcription is suspect and this test should fail rather than widen.
  assert.deepEqual(mismatches, ["50: catalogue 16, IS 25"]);
  assert.equal(CATALOGUE_DIVERGENCES.length, 1);
  assert.match(CATALOGUE_DIVERGENCES[0].subject, /50 sq mm/);
});

test("every LT XLPE size uses 4 × 0.80 mm strip — the works applies Table 6 method (a) throughout", () => {
  // This is the evidence behind the client's "4 x 0.8 is very widely used": their own catalogue
  // uses it at every size from 25 to 500, rather than stepping to 6.1 × 1.4 as method (b) would.
  for (const table of [DAKSHA_LT_XLPE_35_ALUMINIUM, DAKSHA_LT_XLPE_35_COPPER]) {
    for (const row of table.rows) {
      assert.ok(row.strip, `${row.csaSqMm} sq mm must offer strip armour`);
      assert.match(row.strip.stripSize, /4 × 0\.80 mm/);
    }
  }
});

test("armouring always makes the cable bigger, never smaller", () => {
  // A structural check the brochure must satisfy however it was transcribed: adding steel and a
  // sheath cannot reduce a diameter. Catches a digit slipped between columns.
  for (const table of DAKSHA_CATALOGUE) {
    for (const row of table.rows) {
      if (row.strip) {
        assert.ok(
          row.strip.overallDiaMm >= row.unarmoured.overallDiaMm,
          `${table.id} ${row.coreCount}C x ${row.csaSqMm}: strip ${row.strip.overallDiaMm} < unarmoured ${row.unarmoured.overallDiaMm}`,
        );
      }
      if (row.roundWire) {
        assert.ok(
          row.roundWire.overallDiaMm > row.unarmoured.overallDiaMm,
          `${table.id} ${row.coreCount}C x ${row.csaSqMm}: round wire ${row.roundWire.overallDiaMm} <= unarmoured`,
        );
      }
      if (row.strip && row.roundWire) {
        // Round wire is the heavier, bulkier construction at the same size.
        assert.ok(
          row.roundWire.overallDiaMm >= row.strip.overallDiaMm,
          `${table.id} ${row.coreCount}C x ${row.csaSqMm}: round wire should not be thinner than strip`,
        );
      }
    }
  }
});

test("diameter and mass rise monotonically with core count on the control tables", () => {
  // Another shape check independent of the values: more cores is always a bigger, heavier cable.
  for (const table of [DAKSHA_CONTROL_1_5, DAKSHA_CONTROL_2_5]) {
    for (let i = 1; i < table.rows.length; i++) {
      const prev = table.rows[i - 1];
      const row = table.rows[i];
      assert.ok(row.coreCount > prev.coreCount, `${table.id} rows must be in core order`);
      assert.ok(
        row.unarmoured.overallDiaMm >= prev.unarmoured.overallDiaMm,
        `${table.id}: ${row.coreCount}C dia ${row.unarmoured.overallDiaMm} < ${prev.coreCount}C ${prev.unarmoured.overallDiaMm}`,
      );
      assert.ok(
        (row.unarmoured.massKgPerKm ?? 0) > (prev.unarmoured.massKgPerKm ?? 0),
        `${table.id}: ${row.coreCount}C mass must exceed ${prev.coreCount}C`,
      );
    }
  }
});

test("strip armour is absent exactly where the cable is too thin for it", () => {
  // IS 1554-1 §13.2 / IS 7098-1 §14.2: at or below 13 mm calculated diameter under the armour,
  // round wire only. The brochure prints "-" for strip on the small control sizes, and the
  // cut-off should look like that rule rather than an arbitrary gap.
  for (const table of [DAKSHA_CONTROL_1_5, DAKSHA_CONTROL_2_5]) {
    const withStrip = table.rows.filter((r) => r.strip);
    const without = table.rows.filter((r) => !r.strip);
    assert.ok(without.length > 0 && withStrip.length > 0, `${table.id} should have both`);
    // Every strip-less row is smaller than every row that has strip: one clean threshold.
    const biggestWithout = Math.max(...without.map((r) => r.unarmoured.overallDiaMm));
    const smallestWith = Math.min(...withStrip.map((r) => r.unarmoured.overallDiaMm));
    assert.ok(
      biggestWithout <= smallestWith,
      `${table.id}: strip availability should follow one diameter threshold, got ${biggestWithout} vs ${smallestWith}`,
    );
  }
});

test("the copper power table stops at 400 and the aluminium one runs to 500", () => {
  // A real asymmetry in the brochure, not an omission on transcription.
  assert.equal(Math.max(...DAKSHA_LT_XLPE_35_ALUMINIUM.rows.map((r) => r.csaSqMm)), 500);
  assert.equal(Math.max(...DAKSHA_LT_XLPE_35_COPPER.rows.map((r) => r.csaSqMm)), 400);
});

test("copper and aluminium share dimensions but differ in resistance", () => {
  // Same geometry, different metal: the construction is identical, the electricals are not.
  for (const al of DAKSHA_LT_XLPE_35_ALUMINIUM.rows) {
    const cu = DAKSHA_LT_XLPE_35_COPPER.rows.find((r) => r.csaSqMm === al.csaSqMm);
    if (!cu) continue;
    assert.equal(cu.unarmoured.overallDiaMm, al.unarmoured.overallDiaMm);
    assert.equal(cu.strip?.overallDiaMm, al.strip?.overallDiaMm);
    assert.ok(
      (cu.maxDcResistanceOhmPerKm ?? 1) < (al.maxDcResistanceOhmPerKm ?? 0),
      `${al.csaSqMm}: copper must have lower resistance than aluminium`,
    );
  }
});

test("lookup finds a row by family, material, size and cores", () => {
  const hit = findCatalogueRow({ family: "XLPE_POWER", material: "AL", csaSqMm: 240, coreCount: 3.5 });
  assert.ok(hit, "3.5C x 240 aluminium must be in the catalogue");
  assert.equal(hit.row.neutralSqMm, 120);
  assert.equal(catalogueForArmour(hit.row, "strip")?.overallDiaMm, 52.0);
  assert.match(hit.ref, /Daksha Cable Brochure2\.pdf, page 6/);
});

test("lookup returns null rather than a near-miss for a cable the works does not publish", () => {
  // The brochure covers 3½ core XLPE and 1.5/2.5 control. Anything else must fall back to the
  // derived chain, not silently borrow a neighbouring row.
  assert.equal(findCatalogueRow({ family: "XLPE_POWER", material: "AL", csaSqMm: 240, coreCount: 4 }), null);
  assert.equal(findCatalogueRow({ family: "XLPE_POWER", material: "AL", csaSqMm: 260, coreCount: 3.5 }), null);
  assert.equal(findCatalogueRow({ family: "PVC_CONTROL", material: "CU", csaSqMm: 4, coreCount: 7 }), null);
});

test("control cable publishes mass; LT XLPE does not", () => {
  // Stated because it changes which figure the GTP trusts: for control the catalogue supersedes
  // the derived mass outright, for power only the diameter does.
  const control = findCatalogueRow({ family: "PVC_CONTROL", material: "CU", csaSqMm: 2.5, coreCount: 27 });
  assert.ok(control?.row.roundWire?.massKgPerKm, "control rows carry kg/km");
  const power = findCatalogueRow({ family: "XLPE_POWER", material: "AL", csaSqMm: 240, coreCount: 3.5 });
  assert.equal(power?.row.strip?.massKgPerKm, undefined, "the power tables publish no mass");
});

test("27 core x 2.5 sq mm — the size the client asked for — is in the catalogue", () => {
  const hit = findCatalogueRow({ family: "PVC_CONTROL", material: "CU", csaSqMm: 2.5, coreCount: 27 });
  assert.ok(hit);
  assert.equal(hit.row.unarmoured.overallDiaMm, 29.0);
  assert.equal(catalogueForArmour(hit.row, "strip")?.overallDiaMm, 29.5);
  assert.equal(catalogueForArmour(hit.row, "round-wire")?.massKgPerKm, 2015);
});

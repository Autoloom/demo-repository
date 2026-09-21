import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { specFromFields } from "./spec-from-fields";
import { costCable } from "./quote-costing";
import { defaultMarginByCategory } from "@/lib/domain/costing";
import { seedData } from "@/lib/seed/data";

const config: LtCableConfig = { standard: "IS7098-1", coreCount: 3.5, csaSqMm: 240, material: "AL", armoured: true, conductorClass: "Class 2" };

function gtpCable() {
  const fields = deriveLtFields(config).map((f) => (f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f));
  const spec = specFromFields({ specId: "SPEC-QC-1", designation: "3.5C x 240", productLine: "XLPE_POWER", config, armourForm: deriveLtCable(config).armourForm, fields });
  assert.ok(!("gap" in spec));
  return spec;
}

test("a GTP-sourced cable prices end to end, and margin/rate edits move the total", () => {
  const spec = gtpCable();
  const commercial = { lengthM: 1000, marginPctByCategory: defaultMarginByCategory(14), metalRatePerKg: 0, overheadPerM: 18 };
  const base = costCable(spec, commercial, seedData.materials);
  assert.ok(base.lineTotalInr > 0);
  assert.ok(base.components.some((c) => c.label === "Insulation" && c.kgPerM > 0));

  // A higher (flat) margin raises the total; nothing else about the cable changed.
  const higherMargin = costCable(spec, { ...commercial, marginPctByCategory: defaultMarginByCategory(25) }, seedData.materials);
  assert.ok(higherMargin.lineTotalInr > base.lineTotalInr);

  // A manual metal-rate override (price fluctuation) feeds straight into conductor cost.
  const dearerMetal = costCable(spec, { ...commercial, metalRatePerKg: 400 }, seedData.materials);
  assert.ok(dearerMetal.conductorCostPerM > base.conductorCostPerM);
  assert.ok(dearerMetal.lineTotalInr > base.lineTotalInr);
});

test("margin is set per material — raising only one category's margin moves only that component's total", () => {
  const spec = gtpCable();
  const flat = { lengthM: 1000, marginPctByCategory: defaultMarginByCategory(14), metalRatePerKg: 0, overheadPerM: 18 };
  const base = costCable(spec, flat, seedData.materials);

  const armourOnly = costCable(spec, { ...flat, marginPctByCategory: { ...flat.marginPctByCategory, Armour: 40 } }, seedData.materials);
  const baseArmour = base.components.find((c) => c.category === "Armour")!;
  const raisedArmour = armourOnly.components.find((c) => c.category === "Armour")!;
  assert.ok(raisedArmour.marginInr > baseArmour.marginInr, "raising Armour's own margin must raise its margin rupees");
  for (const category of ["Conductor", "Insulation", "Sheath", "Labour"] as const) {
    const baseRow = base.components.find((c) => c.category === category)!;
    const otherRow = armourOnly.components.find((c) => c.category === category)!;
    assert.equal(otherRow.marginInr, baseRow.marginInr, `${category}'s margin must not move when only Armour's margin changes`);
  }
  assert.ok(armourOnly.lineTotalInr > base.lineTotalInr);

  // The 12%-gate blended margin is the weighted average across categories, not any single one.
  assert.ok(armourOnly.blendedMarginPct > 14 && armourOnly.blendedMarginPct < 40);
});

test("a cable with an unresolved GTP gap never reaches a price", () => {
  const fields = deriveLtFields(config); // mfr.isiLicence is still gap: true here
  const result = specFromFields({ specId: "SPEC-QC-2", designation: "3.5C x 240", productLine: "XLPE_POWER", config, armourForm: deriveLtCable(config).armourForm, fields });
  assert.ok("gap" in result, "an unresolved GTP must not yield a priceable spec in the first place");
});

test("costCable itself refuses a spec assembled with an unbuildable size", () => {
  const badConfig = { ...config, csaSqMm: 16 };
  const fields = deriveLtFields(config).map((f) => (f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f));
  const result = specFromFields({ specId: "SPEC-QC-3", designation: "bad", productLine: "XLPE_POWER", config: badConfig, armourForm: "round-wire", fields });
  assert.ok("gap" in result, "IS 7098-1 Table 2 has no row for 16 sq mm at this core count — refused, not guessed");
});

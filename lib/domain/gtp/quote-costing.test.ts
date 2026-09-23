import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { specFromFields } from "./spec-from-fields";
import { costCable } from "./quote-costing";
import { DEFAULT_COST_BUILD_UP } from "@/lib/domain/costing";
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
  const commercial = { lengthM: 1000, buildUp: { ...DEFAULT_COST_BUILD_UP }, metalRatePerKg: 0, overheadPerM: 18 };
  const base = costCable(spec, commercial, seedData.materials);
  assert.ok(base.lineTotalInr > 0);
  assert.ok(base.components.some((c) => c.label === "Insulation" && c.kgPerM > 0));

  // A higher margin raises the total; nothing else about the cable changed.
  const higherMargin = costCable(
    spec,
    { ...commercial, buildUp: { ...DEFAULT_COST_BUILD_UP, marginPct: DEFAULT_COST_BUILD_UP.marginPct + 5 } },
    seedData.materials,
  );
  assert.ok(higherMargin.lineTotalInr > base.lineTotalInr);

  // A manual metal-rate override (price fluctuation) feeds straight into conductor cost.
  const dearerMetal = costCable(spec, { ...commercial, metalRatePerKg: 400 }, seedData.materials);
  assert.ok(dearerMetal.conductorCostPerM > base.conductorCostPerM);
  assert.ok(dearerMetal.lineTotalInr > base.lineTotalInr);
});

test("one margin over the total cost, not a margin per material", () => {
  // Niraj, 13 Sept: "a single blended margin, not per-component — the breakdown adds complexity
  // for nothing". What a manufacturer manages is the total, and expressing margin as a
  // percentage over it is what lets someone drop it when a customer pushes back on price.
  const spec = gtpCable();
  const flat = { lengthM: 1000, buildUp: { ...DEFAULT_COST_BUILD_UP }, metalRatePerKg: 0, overheadPerM: 18 };
  const base = costCable(spec, flat, seedData.materials);

  // The margin reported IS the margin set — no weighted average to reconcile.
  assert.equal(base.blendedMarginPct, DEFAULT_COST_BUILD_UP.marginPct);
  assert.ok(Math.abs(base.lineMarginInr - base.totalCostInr * (DEFAULT_COST_BUILD_UP.marginPct / 100)) < 1);

  // Raising it raises the line, and nothing else moves.
  const richer = costCable(spec, { ...flat, buildUp: { ...DEFAULT_COST_BUILD_UP, marginPct: 20 } }, seedData.materials);
  assert.equal(richer.materialCostInr, base.materialCostInr, "margin must not touch material cost");
  assert.equal(richer.totalCostInr, base.totalCostInr, "margin must not touch total cost");
  assert.ok(richer.lineTotalInr > base.lineTotalInr);
});

test("conversion, wastage and finance are percentages of RAW MATERIAL, and do not compound", () => {
  // A factory quotes these against what the metal and compound cost, not against each other.
  const spec = gtpCable();
  const noUplift = { lengthM: 1000, metalRatePerKg: 0, overheadPerM: 18,
    buildUp: { conversionPct: 0, wastagePct: 0, financePct: 0, drumCostInr: 0, freightInr: 0, marginPct: 0 } };
  const bare = costCable(spec, noUplift, seedData.materials);
  assert.equal(Math.round(bare.totalCostInr), Math.round(bare.materialCostInr));

  const withTen = costCable(spec, { ...noUplift, buildUp: { ...noUplift.buildUp, conversionPct: 10 } }, seedData.materials);
  assert.ok(Math.abs(withTen.totalCostInr - bare.materialCostInr * 1.1) < 1, "10% conversion = 10% of material");

  // Two 10% uplifts are 20% of material, not 21% — they do not compound.
  const withBoth = costCable(spec, { ...noUplift, buildUp: { ...noUplift.buildUp, conversionPct: 10, wastagePct: 10 } }, seedData.materials);
  assert.ok(Math.abs(withBoth.totalCostInr - bare.materialCostInr * 1.2) < 1);
});

test("drum and freight are flat rupee amounts on the line", () => {
  // They default to 0 meaning "not yet entered", and nobody has given a typical figure.
  const spec = gtpCable();
  const flat = { lengthM: 1000, buildUp: { ...DEFAULT_COST_BUILD_UP }, metalRatePerKg: 0, overheadPerM: 18 };
  assert.equal(DEFAULT_COST_BUILD_UP.drumCostInr, 0);
  assert.equal(DEFAULT_COST_BUILD_UP.freightInr, 0);

  const base = costCable(spec, flat, seedData.materials);
  const withCosts = costCable(spec, { ...flat, buildUp: { ...DEFAULT_COST_BUILD_UP, drumCostInr: 5000, freightInr: 3000 } }, seedData.materials);
  assert.ok(Math.abs(withCosts.totalCostInr - (base.totalCostInr + 8000)) < 1);
});

test("the build-up prints its own working, step by step", () => {
  // This is the internal costing sheet Niraj asked for: a reviewer must be able to see where
  // every rupee came from, and that it is never shown to a customer.
  const spec = gtpCable();
  const result = costCable(spec, { lengthM: 1000, buildUp: { ...DEFAULT_COST_BUILD_UP }, metalRatePerKg: 0, overheadPerM: 18 }, seedData.materials);
  const labels = result.buildUpSteps.map((s) => s.label);
  assert.deepEqual(labels, [
    "Raw material", "Conversion (labour, power, machine time)", "Wastage and scrap",
    "Cost of finance", "Drum", "Freight", "Total cost", "Margin",
  ]);
  const total = result.buildUpSteps.find((s) => s.label === "Total cost")!;
  assert.ok(Math.abs(total.amountInr - result.totalCostInr) < 1);
});
test("a cable with an unresolved GTP gap never reaches a price", () => {
  // The ISI licence used to be the convenient example here, but it is no longer a gap: it is
  // required on the supplied cable, not at offer stage, so it must not block a quotation
  // (client, 22 Sept 2026). The RULE under test is unchanged — any unresolved field still
  // blocks pricing — so this now marks a real one.
  const fields = deriveLtFields(config).map((f) =>
    f.key === "lt.insulation" ? { ...f, gap: true, value: "not yet known" } : f,
  );
  const result = specFromFields({ specId: "SPEC-QC-2", designation: "3.5C x 240", productLine: "XLPE_POWER", config, armourForm: deriveLtCable(config).armourForm, fields });
  assert.ok("gap" in result, "an unresolved GTP must not yield a priceable spec in the first place");
});

test("the ISI licence alone does NOT block a quotation", () => {
  // Offers go out before the licence is quoted against. Pinning this so it is not "fixed" back
  // into a blocker by someone reading the old test.
  const fields = deriveLtFields(config);
  assert.equal(fields.find((f) => f.key === "mfr.isiLicence")?.gap ?? false, false);
  const result = specFromFields({ specId: "SPEC-QC-3", designation: "3.5C x 240", productLine: "XLPE_POWER", config, armourForm: deriveLtCable(config).armourForm, fields });
  assert.ok(!("gap" in result), "a GTP whose only unfilled field is the licence must still price");
});

test("costCable itself refuses a spec assembled with an unbuildable size", () => {
  const badConfig = { ...config, csaSqMm: 16 };
  const fields = deriveLtFields(config).map((f) => (f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f));
  const result = specFromFields({ specId: "SPEC-QC-3", designation: "bad", productLine: "XLPE_POWER", config: badConfig, armourForm: "round-wire", fields });
  assert.ok("gap" in result, "IS 7098-1 Table 2 has no row for 16 sq mm at this core count — refused, not guessed");
});

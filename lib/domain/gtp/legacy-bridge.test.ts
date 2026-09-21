/**
 * The quote prices what the GTP derives.
 *
 * This is the test that keeps the two documents honest. Before this work the quote estimated
 * cable mass from tunable coefficients while the GTP derived it from IS tables, and on a real
 * cable they disagreed by ~35% — on the metal that dominates the price. Nothing reconciled them
 * because the two systems never met.
 *
 * If a future change makes these disagree again, that is the substrate being wrong, not a test
 * being fussy.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { computeLine, defaultMarginByCategory } from "@/lib/domain/costing";
import type { CableSpec } from "@/lib/services/types";

import { deriveLtFields } from "./derive-lt-fields";
import { builderInputsFromSpec, derivedLineMassFromLegacySpec, isBridgeGap, ltConfigFromLegacySpec, productLineFromSpec } from "./legacy-bridge";

const legacy = (over: Partial<CableSpec> = {}) =>
  ({
    family: "LT XLPE Power",
    insulation: "XLPE",
    cores: "4C",
    conductorSizeSqMm: 16,
    conductorMaterial: "Aluminium",
    armour: "GI round wire (GSW)",
    ...over,
  }) as unknown as CableSpec;

test("a legacy spec maps onto the engine that governs it", () => {
  const xlpe = ltConfigFromLegacySpec(legacy());
  assert.ok(!isBridgeGap(xlpe));
  assert.equal((xlpe as { standard: string }).standard, "IS7098-1");

  // Control cable and LT PVC are both IS 1554-1 — one standard covers both.
  for (const family of ["LT PVC Power", "Control Cable"] as const) {
    const pvc = ltConfigFromLegacySpec(legacy({ family, insulation: "PVC (Type A)" }));
    assert.ok(!isBridgeGap(pvc), `${family} should map`);
    assert.equal((pvc as { standard: string }).standard, "IS1554-1");
  }
});

test("3.5 core survives as a float, not truncated to 3", () => {
  // It is a discriminator, and parseInt on it silently drops the reduced neutral.
  const c = ltConfigFromLegacySpec(legacy({ cores: "3.5C" }));
  assert.ok(!isBridgeGap(c));
  assert.equal((c as { coreCount: number }).coreCount, 3.5);
});

test("an unmappable conductor is a gap, never priced as aluminium", () => {
  // "Aluminium Alloy" is not aluminium: pricing it as such would be wrong by the density
  // difference, and wrong quietly. The reason names the material so the operator can act.
  const r = ltConfigFromLegacySpec(legacy({ conductorMaterial: "ACSR" }));
  assert.ok(isBridgeGap(r));
  assert.match((r as { reason: string }).reason, /ACSR/);

  // Same for a family with no encoded standard at all.
  const noStandard = ltConfigFromLegacySpec(legacy({ family: "Submersible Cable", insulation: "EPR" }));
  assert.ok(isBridgeGap(noStandard));
});

test("the quote's mass equals the GTP's, layer for layer", () => {
  // The cross-document guarantee. Both must read the same derivation, so a quotation and a GTP
  // generated from one cable can never state different masses.
  const spec = legacy({ conductorSizeSqMm: 300, cores: "3.5C" });
  const bridged = derivedLineMassFromLegacySpec(spec);
  assert.ok(!isBridgeGap(bridged));

  const gtpMass = deriveLtFields({
    standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true,
  }).find((f) => f.key === "fin.totalMass");

  // The GTP prints a total; the quote splits it by layer to price each at its own rate. The
  // bridge's own workings line is the GTP's, so they cannot describe different cables.
  assert.equal((bridged as { workings: string }).workings, gtpMass?.trace);
});

test("a derived mass beats no mass: the coefficients are gone", () => {
  // With derivedMass supplied, insulation/armour/sheath carry real weight. Without it they are
  // ZERO — not an estimate. A cable this system cannot derive shows a visibly incomplete price
  // rather than a plausible total nobody can trace to a clause.
  const spec = legacy();
  const mass = derivedLineMassFromLegacySpec(spec);
  assert.ok(!isBridgeGap(mass));

  const rates = { conductorPerKg: 250, insulationPerKg: 150, armourPerKg: 80, sheathPerKg: 140, labourPerM: 18 };
  const withMass = computeLine({ spec, lengthM: 1000, marginPctByCategory: defaultMarginByCategory(15), rates, derivedMass: mass as never });
  const without = computeLine({ spec, lengthM: 1000, marginPctByCategory: defaultMarginByCategory(15), rates });

  const nonConductor = (r: typeof withMass) =>
    r.components.filter((c) => ["Insulation", "Armour", "Sheath"].includes(c.label)).reduce((s, c) => s + c.kgPerM, 0);

  assert.ok(nonConductor(withMass) > 0, "derived mass must reach the priced components");
  assert.equal(nonConductor(without), 0, "no derived mass must mean no invented weight");
  assert.ok(withMass.baseCostPerM > without.baseCostPerM);
});

test("conductor mass carries the lay-up factor, explicitly", () => {
  // The old aluminium coefficient was 0.00325 against a true density of 0.00270 — a 20% stranding
  // allowance baked invisibly into a density. It is now an explicit factor shared with the GTP
  // engines. 16 sq mm × 4 cores × 2.70 g/cm³ = 0.1728 kg/m bare, × 1.03 laid up.
  const r = computeLine({
    spec: legacy({ armour: "Unarmoured" }),
    lengthM: 1000,
    marginPctByCategory: defaultMarginByCategory(0),
    rates: { conductorPerKg: 250, insulationPerKg: 150, armourPerKg: 80, sheathPerKg: 140, labourPerM: 0 },
  });
  assert.ok(Math.abs(r.totalConductorKgPerM - 0.1728 * 1.03) < 1e-6, `got ${r.totalConductorKgPerM}`);
});


test("a non-LT cable is never routed to the LT chain by its insulation", () => {
  // The regression: an insulation-based fallback treated "XLPE implies IS 7098-1" as safe. It is
  // not. An aerial bunched cable is XLPE insulated and governed by IS 14255; a solar cable is
  // cross-linked and governed by IS 17293. Both were being priced against the LT power chain —
  // producing a number, and a wrong one, which is worse than producing none.
  for (const [family, insulation] of [
    ["Aerial Bunched Cable", "XLPE"],
    ["Solar DC Cable", "XLPO (solar/UV)"],
    ["House Wiring", "PVC (Type A)"],
  ] as const) {
    const r = ltConfigFromLegacySpec(legacy({ family, insulation } as Partial<CableSpec>));
    assert.ok(isBridgeGap(r), `${family} must not be priced as an LT power cable`);
  }
});


// ── WP-3: one cable, both documents ───────────────────────────────────────────────────────────

test("a quoted cable reopens in the GTP builder as the same cable", () => {
  // The feature: build a cable once. The quote stores a CableSpec; the GTP builder reconstructs
  // its own inputs from it. If this drifts, an operator quotes one cable and GTPs another —
  // silently, because both screens would look plausible.
  const spec = legacy({ conductorSizeSqMm: 300, cores: "3.5C", family: "LT XLPE Power" });
  const inputs = builderInputsFromSpec(spec);
  assert.ok(!isBridgeGap(inputs));

  const got = inputs as Exclude<typeof inputs, { gap: true }>;
  assert.equal(got.productLine, "XLPE_POWER");
  assert.equal(got.ltConfig?.csaSqMm, 300);
  assert.equal(got.ltConfig?.coreCount, 3.5, "3.5 core must survive as a float");
  assert.equal(got.ltConfig?.armoured, true);
  assert.equal(got.conductorMaterial, "AL");
});

test("the reopened cable derives the same mass the quote priced", () => {
  // The round trip has to close on the NUMBER, not just the inputs. A spec that reopens as a
  // different cable would still produce a plausible GTP — this is what catches that.
  const spec = legacy({ conductorSizeSqMm: 95, cores: "4C" });

  const quotedMass = derivedLineMassFromLegacySpec(spec);
  assert.ok(!isBridgeGap(quotedMass));

  const inputs = builderInputsFromSpec(spec);
  assert.ok(!isBridgeGap(inputs));
  const cfg = (inputs as Exclude<typeof inputs, { gap: true }>).ltConfig;

  const gtpMass = deriveLtFields({
    standard: "IS7098-1",
    csaSqMm: cfg!.csaSqMm,
    coreCount: cfg!.coreCount,
    material: "AL",
    armoured: cfg!.armoured,
  }).find((f) => f.key === "fin.totalMass");

  assert.equal((quotedMass as { workings: string }).workings, gtpMass?.trace);
});

test("each family routes to the engine that governs it", () => {
  assert.equal(productLineFromSpec({ family: "Aerial Bunched Cable" } as never), "AB_CABLE");
  assert.equal(productLineFromSpec({ family: "LT XLPE Power" } as never), "XLPE_POWER");
  assert.equal(productLineFromSpec({ family: "Control Cable" } as never), "PVC_CONTROL");
  assert.equal(productLineFromSpec({ family: "Solar DC Cable" } as never), "SOLAR_DC");
  // No engine, and no guess.
  assert.equal(productLineFromSpec({ family: "House Wiring" } as never), undefined);
});

test("an AB spec without its bundle sizes is refused, not half-loaded", () => {
  // A flat conductor size cannot express phase + messenger + street-light. Opening the builder
  // with a partially reconstructed AB cable would show a cable nobody specified.
  const r = builderInputsFromSpec(legacy({ family: "Aerial Bunched Cable", aerialBunched: undefined }));
  assert.ok(isBridgeGap(r));
  assert.match((r as { reason: string }).reason, /phase\/messenger/);
});

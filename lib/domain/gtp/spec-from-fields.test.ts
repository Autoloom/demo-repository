import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { deriveLtCable, type LtCableConfig } from "./derive-lt";
import { deriveLtFields } from "./derive-lt-fields";
import { specFromFields } from "./spec-from-fields";
import { adapter } from "@/lib/adapters/mock-adapter";
import { seedData } from "@/lib/seed/data";
import { specsService, gtpService } from "@/lib/services";
import type { CableStore } from "@/lib/services/types";

const config: LtCableConfig = { standard: "IS7098-1", coreCount: 3.5, csaSqMm: 240, material: "AL", armoured: true, conductorClass: "Class 2" };
function fixture() {
  const fields = deriveLtFields(config).map((f) => f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f);
  return { specId: "SPEC-INTEGRATION", designation: "3.5C x 240", productLine: "XLPE_POWER" as const, config, armourForm: deriveLtCable(config).armourForm, fields };
}

test("derived armour form is structural, including unarmoured and forced round wire", () => {
  assert.equal(deriveLtCable(config).armourForm, "round-wire");
  assert.equal(deriveLtCable({ ...config, armoured: false }).armourForm, null);
  assert.equal(deriveLtCable({ ...config, csaSqMm: 1.5, coreCount: 2, material: "CU", armourForm: "formed-wire" }).armourForm, "round-wire");
});
test("mapper carries derived round armour, Table 2 neutral, Class 2 input and physical particulars", () => {
  const spec = specFromFields(fixture());
  assert.ok(!("gap" in spec));
  assert.equal(spec.armour, "GI round wire (GSW)"); assert.equal(spec.neutralSizeSqMm, 120);
  assert.equal(spec.cores, "3.5C"); assert.equal(spec.insulation, "XLPE");
  assert.equal(spec.conductorClass, "Class 2 (stranded)"); assert.equal(spec.flameClass, "Standard");
  assert.equal(spec.voltageGrade, "650/1100 V (1.1 kV)");
  assert.ok(spec.approxOuterDiaMm! > 0); assert.ok(spec.approxWeightKgPerKm! > 0);
  assert.ok(spec.technical?.conductorResistanceOhmPerKm);
});
test("no spec for 3.5C x 16 even if supplied fields claim to be clean", () => {
  const result = specFromFields({ ...fixture(), config: { ...config, csaSqMm: 16 } });
  assert.ok("gap" in result); assert.match(result.reason, /Table 2/);
});
test("any gap blocks the spec", () => {
  // The manufacturer licence was the example here and is no longer a gap — it is required on the
  // supplied cable, not at offer stage (client, 22 Sept 2026). The rule itself is unchanged.
  const input = fixture(); input.fields[0].gap = true;
  assert.ok("gap" in specFromFields(input));
});
test("mapper refuses missing dimensions, stale overrides and unsupported product lines", () => {
  const input = fixture();
  assert.ok("gap" in specFromFields({ ...input, fields: input.fields.filter((f) => f.key !== "lt.insulation") }));
  assert.ok("gap" in specFromFields({ ...input, fields: input.fields.map((f) => f.key === "lt.insulation" ? { ...f, value: "1.50 mm" } : f) }));
  assert.ok("gap" in specFromFields({ ...input, productLine: "AB_CABLE" }));
});
test("PVC control integrates with PVC materials and its own standard", () => {
  const cfg: LtCableConfig = { ...config, standard: "IS1554-1", coreCount: 7, csaSqMm: 2.5, material: "CU" };
  const fields = deriveLtFields(cfg).map((f) => ({ ...f, gap: false }));
  const result = specFromFields({ ...fixture(), config: cfg, productLine: "PVC_CONTROL", fields, armourForm: deriveLtCable(cfg).armourForm });
  assert.ok(!("gap" in result)); assert.equal(result.insulation, "PVC (Type A)"); assert.equal(result.family, "Control Cable");
});
test("cable is addressable before generating and a saved GTP resolves to that same cable", async () => {
  let store = structuredClone(seedData);
  mock.method(adapter, "read", async () => structuredClone(store));
  mock.method(adapter, "write", async (next: CableStore) => { store = structuredClone(next); return store; });
  try {
    const spec = specFromFields(fixture()); assert.ok(!("gap" in spec));
    await specsService.upsert(spec);
    assert.deepEqual(await specsService.get(spec.id), spec);
    const gtp = await gtpService.save({ ...store.gtps[0], id: "GTP-INTEGRATION", specId: spec.id, derivedFields: fixture().fields }, { id: "test", name: "Test", role: "Owner" });
    assert.equal((await specsService.get(gtp.specId))?.id, spec.id);
    assert.equal(store.specs.filter((s) => s.id === spec.id).length, 1);
  } finally { mock.restoreAll(); }
});

test("formed-wire mapping and mass use the resolved form instead of round-wire geometry", () => {
  const cfg: LtCableConfig = { ...config, armourForm: "formed-wire" };
  const chain = deriveLtCable(cfg);
  assert.equal(chain.armourForm, "formed-wire");
  const fields = deriveLtFields(cfg).map((f) => f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f);
  const result = specFromFields({ ...fixture(), config: cfg, fields, armourForm: chain.armourForm });
  assert.ok(!("gap" in result)); assert.equal(result.armour, "GI strip (GSS)");
  assert.match(fields.find((f) => f.key === "fin.totalMass")!.trace, /Armour/);
});

/**
 * The sequential handoff: derive a cable, then price it, without re-entering anything.
 *
 * These pin the three breaks that made the flow dead-end in the browser even though every unit
 * below it passed. All three were identity/timing faults in the wiring, not arithmetic:
 *
 *  1. the GTP page compared the saved cable by OBJECT REFERENCE, so any unrelated edit rebuilt
 *     `fields`, produced a fresh candidate object, and dropped the "Create quote" link;
 *  2. generating raced the background save, stamping the GTP with an empty specId;
 *  3. the review page's Quotation link carried only orderId, dropping the derived cable.
 */
test("an unrelated edit does not invalidate the saved cable's identity", () => {
  const first = specFromFields(fixture());
  const second = specFromFields(fixture());
  assert.ok(!("gap" in first) && !("gap" in second));
  // Distinct objects — a reference check treats these as different cables and goes stale.
  assert.notEqual(first, second);
  // Equal by value, which is what the handoff must key on.
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("a real construction change DOES invalidate the saved cable's identity", () => {
  const base = specFromFields(fixture());
  // Re-derive for the new size: the mapper refuses fields that disagree with the build-up chain,
  // so a size change must bring its own resolved fields, exactly as the GTP page does.
  const movedConfig: LtCableConfig = { ...config, csaSqMm: 185 };
  const movedFields = deriveLtFields(movedConfig).map((f) => f.key === "mfr.isiLicence" ? { ...f, value: "TEST-LICENCE", gap: false } : f);
  const moved = specFromFields({ ...fixture(), config: movedConfig, fields: movedFields, armourForm: deriveLtCable(movedConfig).armourForm });
  assert.ok(!("gap" in base) && !("gap" in moved));
  assert.notEqual(JSON.stringify(base), JSON.stringify(moved));
});

test("GTP to quote in one pass: the priced line carries the DERIVED cable, not presets", async () => {
  let store = structuredClone(seedData);
  mock.method(adapter, "read", async () => structuredClone(store));
  mock.method(adapter, "write", async (next: CableStore) => { store = structuredClone(next); return store; });
  try {
    const { quoteBuild } = await import("./quote-costing");

    // 1 · the GTP generator derives and saves the cable
    const spec = specFromFields(fixture());
    assert.ok(!("gap" in spec));
    const saved = await specsService.upsert(spec);
    assert.ok(saved.id, "the cable must be addressable before a GTP references it");

    // 2 · the generated GTP carries a REAL spec id, never ""
    const gtp = await gtpService.save(
      { ...store.gtps[0], id: "GTP-FLOW", specId: saved.id, derivedFields: fixture().fields },
      { id: "test", name: "Test", role: "Owner" },
    );
    assert.notEqual(gtp.specId, "", "specId: \"\" means no quote can ever resolve the cable");

    // 3 · the quote builder resolves that id back to the cable and prices what was derived
    const loaded = await specsService.get(gtp.specId);
    assert.ok(loaded?.gtpSource, "the quote seeds from the stored GTP construction");
    assert.equal(loaded.armour, "GI round wire (GSW)", "the STANDARD's armour form survives the hop");
    assert.equal(loaded.neutralSizeSqMm, 120, "Table 2 neutral survives the hop");

    const { build } = quoteBuild(loaded);
    assert.equal(build.specId, loaded.id);
    assert.ok(build.massAtDeclaredKgPerKm > 0);
    // Nominal build: declared and built agree until an operator moves a layer.
    assert.equal(build.massAtBuiltKgPerKm, build.massAtDeclaredKgPerKm);
  } finally {
    mock.restoreAll();
  }
});

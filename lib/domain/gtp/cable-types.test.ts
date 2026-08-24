/**
 * Cable-type registry tests (WP-B / WP-S4).
 *
 * These guard the ARCHITECTURAL gate, not domain values: adding a cable type must stay a data
 * task. If someone reintroduces per-type branching in the engine, or ships a type whose chain
 * can't actually run, these should fail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CABLE_TYPES, availableCableTypes, blockedSteps, findCableType } from "@/lib/domain/gtp/cable-types";

test("all four in-scope cable types are registered, in build order", () => {
  assert.deepEqual(
    CABLE_TYPES.map((t) => t.id),
    ["AB_CABLE", "XLPE_POWER", "PVC_CONTROL", "SOLAR_DC"],
    "D5 order: Aerial Bunched → LT power → control → solar",
  );
});

test("a type is only 'available' when no step in its chain is blocked", () => {
  // The invariant that stops us shipping a type that cannot actually derive a value.
  for (const type of CABLE_TYPES) {
    const blocked = blockedSteps(type);
    if (type.available) {
      const fatal = blocked.filter((s) => !s.id.startsWith("rating.") && !s.id.startsWith("drum") && s.id !== "messenger.alloy");
      assert.equal(fatal.length, 0, `${type.label} is available but has blocked core steps: ${fatal.map((s) => s.id).join(", ")}`);
    } else {
      assert.ok(type.blockedReason, `${type.label} is unavailable and must say why`);
    }
  }
});

test("three of four types are derivable; only solar remains", () => {
  assert.deepEqual(availableCableTypes().map((t) => t.id), ["AB_CABLE", "XLPE_POWER", "PVC_CONTROL"]);
});

test("the calculated-diameter chain is no longer blocked — IS 10462-1 is encoded", () => {
  // Was: these steps were blocked because the fictitious calculation method wasn't held.
  // The standard is now encoded (is10462-1-1983.ts), so nothing in the chain may claim otherwise.
  for (const id of ["XLPE_POWER", "PVC_CONTROL"] as const) {
    const type = findCableType(id);
    assert.ok(type);
    const stillBlocked = blockedSteps(type).filter((s) => s.standardId === "IS 10462-1");
    assert.deepEqual(stillBlocked, [], `${type?.label}: no step may be blocked on IS 10462-1 now`);
  }
});

test("LT power and control are now fully unblocked", () => {
  // Was: blocked first on a missing standard, then on unencoded tables. Both are cleared —
  // IS 10462-1, IS 8130, IS 7098-1 and IS 1554-1 are all encoded and the chain runs.
  for (const id of ["XLPE_POWER", "PVC_CONTROL"] as const) {
    const type = findCableType(id);
    assert.ok(type?.available, `${id} should be derivable`);
    assert.deepEqual(blockedSteps(type), [], `${type.label} must have no blocked steps`);
    assert.equal(type.blockedReason, undefined);
  }
});

test("an available type carries no leftover blocked-state copy", () => {
  // Guards against a type being switched on while its "coming soon" text is left behind,
  // which would render a contradiction on the builder card.
  for (const type of CABLE_TYPES.filter((t) => t.available)) {
    assert.equal(type.blockedReason, undefined, `${type.label} is available but still has blockedReason`);
    assert.equal(type.blockedDetail, undefined, `${type.label} is available but still has blockedDetail`);
    assert.equal(type.remainingWork, undefined, `${type.label} is available but still has remainingWork`);
  }
});

test("the fictitious steps are chained, each keyed by the previous", () => {
  // IS 10462-1 §0.7 requires staged rounding, which only makes sense if the steps run in order.
  // If someone flattens this into independent lookups, the ordering guarantee is silently lost.
  const chain = findCableType("XLPE_POWER")?.derivationChain ?? [];
  const idx = (id: string) => chain.findIndex((s) => s.id === id);
  assert.ok(idx("calc.diaOverCore") < idx("calc.diaOverLaidUp"));
  assert.ok(idx("calc.diaOverLaidUp") < idx("innerSheath"));
  assert.ok(idx("innerSheath") < idx("calc.diaUnderArmour"));
  assert.ok(idx("calc.diaUnderArmour") < idx("armour"));
  assert.ok(idx("armour") < idx("calc.diaUnderSheath"));
  assert.ok(idx("calc.diaUnderSheath") < idx("outerSheath"));
});

test("LT power and control share a derivation chain — one schema, two datasets", () => {
  // build-plan-v1 §0.3: IS 1554-1 and IS 7098-1 are structurally identical. If this ever
  // diverges by copy-paste, the shared-schema lever is lost.
  const power = findCableType("XLPE_POWER");
  const control = findCableType("PVC_CONTROL");
  assert.deepEqual(
    power?.derivationChain.map((s) => s.id),
    control?.derivationChain.map((s) => s.id),
  );
});

test("solar is the non-BIS type — the registry must not assume one standards body", () => {
  assert.equal(findCableType("SOLAR_DC")?.body, "IEC");
  assert.equal(findCableType("AB_CABLE")?.body, "BIS");
});

test("every type declares a config schema and validation rules", () => {
  for (const type of CABLE_TYPES) {
    assert.ok(type.configSchema.length > 0, `${type.label} needs a config schema`);
    assert.ok(type.derivationChain.length > 0, `${type.label} needs a derivation chain`);
    assert.ok(type.validationRules.length > 0, `${type.label} needs validation rules`);
    assert.ok(type.primaryStandard.edition, `${type.label} must pin its primary standard's edition`);
  }
});

test("LT power exposes conductor shape — sector cores change diameter and mass", () => {
  const shape = findCableType("XLPE_POWER")?.configSchema.find((f) => f.key === "shape");
  assert.ok(shape, "conductor shape must be first-class, not bolted on later (WP-B)");
  assert.equal(shape.kind, "choice");
});

test("AB phase sizes stop at 95 — IS 14255 Table 3 has no larger row", () => {
  const phase = findCableType("AB_CABLE")?.configSchema.find((f) => f.key === "phaseSizeSqMm");
  assert.ok(phase && phase.kind === "choice");
  assert.deepEqual(phase.options, [16, 25, 35, 50, 70, 95]);
});

test("AB cable fixes its conductor material; LT power and control leave it open", () => {
  // IS 14255 is an aluminium-conductor specification throughout, so offering a Cu/Al toggle on
  // AB cable would present a choice the standard does not permit. LT power and control DO offer
  // both, so they must not declare a fixed material.
  const ab = findCableType("AB_CABLE");
  assert.equal(ab?.fixedConductorMaterial?.material, "AL");
  assert.match(ab?.fixedConductorMaterial?.ref ?? "", /14255/);
  for (const id of ["XLPE_POWER", "PVC_CONTROL"] as const) {
    assert.equal(findCableType(id)?.fixedConductorMaterial, undefined,
      `${id} supports both materials — it must not pin one`);
  }
  // Solar is copper by standard too: IEC 62930 and EN 50618 both specify tinned annealed copper.
  assert.equal(findCableType("SOLAR_DC")?.fixedConductorMaterial?.material, "CU");
});

test("blocked reasons are operator-facing: short, and free of internal vocabulary", () => {
  // These render on cards in the builder, read by whoever is deciding what to quote. An earlier
  // version leaked engineering notes ("data entry, not new engine work", clause numbers, our
  // work-queue framing) into that surface. The detail belongs in blockedDetail instead.
  for (const type of CABLE_TYPES.filter((t) => !t.available)) {
    const reason = type.blockedReason ?? "";
    assert.ok(reason.length <= 120, `${type.label}: blockedReason is ${reason.length} chars — too long for a card`);
    assert.equal(reason.split(". ").filter(Boolean).length, 1, `${type.label}: keep it to one sentence`);
    for (const jargon of [/data entry/i, /engine work/i, /encoded/i, /Table \d/, /§/, /PDF/i, /corpus/i]) {
      assert.doesNotMatch(reason, jargon, `${type.label}: "${reason}" uses internal vocabulary`);
    }
    assert.ok(type.remainingWork, `${type.label}: "coming soon" should say roughly how much is left`);
  }
});

test("the engineering detail is kept, just moved off the builder card", () => {
  for (const type of CABLE_TYPES.filter((t) => !t.available)) {
    assert.ok(type.blockedDetail && type.blockedDetail.length > type.blockedReason!.length,
      `${type.label}: the full explanation must survive in blockedDetail`);
  }
});

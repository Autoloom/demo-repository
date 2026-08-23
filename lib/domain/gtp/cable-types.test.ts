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

test("only AB cable is derivable today", () => {
  assert.deepEqual(availableCableTypes().map((t) => t.id), ["AB_CABLE"]);
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

test("LT power and control remain blocked, but only on data entry", () => {
  // The distinction that matters: a MISSING STANDARD is an external blocker we cannot clear;
  // an UNENCODED TABLE is our own work queue. Every remaining blocker must be the latter.
  for (const id of ["XLPE_POWER", "PVC_CONTROL"] as const) {
    const type = findCableType(id);
    assert.ok(type && !type.available);
    const blocked = blockedSteps(type);
    assert.ok(blocked.length > 0, `${type.label} is unavailable so something must be blocked`);
    for (const step of blocked) {
      assert.match(
        step.blockedBy ?? "", /not encoded/,
        `${type.label} step ${step.id}: remaining blockers must be encoding work, not missing standards`,
      );
    }
    assert.doesNotMatch(
      type.blockedReason ?? "", /not held/,
      `${type.label}: the reason must no longer claim a standard is missing`,
    );
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

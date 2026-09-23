import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveFields } from "./derive";
import { parseSizeString } from "./parse-size";

/** The approved WBSEDCL cable: 3 x 70 phase + 1 x 50 messenger + 1 x 16 street light. */
const parsed = parseSizeString("3Cx70+1Cx50+1Cx16");
assert.ok(parsed.ok, "the sample size string must parse");
const construction = parsed.construction;

function numeric(value: string | number): number {
  if (typeof value === "number") return value;
  const m = value.match(/-?[\d.]+/);
  assert.ok(m, `expected a number in "${value}"`);
  return Number(m[0]);
}

function bundle(messengerConstruction: "bare" | "covered") {
  const fields = deriveFields(construction, { messengerConstruction, customerName: "Test" });
  const dia = fields.find((f) => f.key === "fin.overallDia");
  const mass = fields.find((f) => f.key === "fin.totalMass");
  assert.ok(dia && mass, "the bundle must produce a diameter and a mass");
  assert.ok(!dia.gap && !mass.gap, "neither may be a gap on a fully-sourced cable");
  return { diaMm: numeric(dia.value), massKgPerKm: numeric(mass.value) };
}

test("a bare messenger gives a lighter, thinner cable than a covered one", () => {
  // The manufacturer's Sept 2026 request: offering bare must actually change dimensions and
  // weight, not just print a different word. Before this was modelled the bundle was computed
  // as if the messenger were always bare, so BOTH answers were the bare one.
  const bare = bundle("bare");
  const covered = bundle("covered");
  assert.ok(
    bare.massKgPerKm < covered.massKgPerKm,
    `bare ${bare.massKgPerKm} should be lighter than covered ${covered.massKgPerKm} kg/km`,
  );
  assert.ok(
    bare.diaMm <= covered.diaMm,
    `bare ${bare.diaMm} should not exceed covered ${covered.diaMm} mm`,
  );
});

test("the covered messenger's extra mass is its insulation wall, not a fudge factor", () => {
  // A 50 sq mm messenger takes the IS 14255 Table 4 wall for its size. The difference between
  // the two constructions should be that annulus and nothing else — a few percent of the cable,
  // not a rounding artefact and not a large jump.
  const bare = bundle("bare");
  const covered = bundle("covered");
  const deltaPct = ((covered.massKgPerKm - bare.massKgPerKm) / bare.massKgPerKm) * 100;
  assert.ok(deltaPct > 0.5, `covered should be measurably heavier, got +${deltaPct.toFixed(2)}%`);
  assert.ok(deltaPct < 15, `one insulation wall cannot be +${deltaPct.toFixed(2)}% of the cable`);
});

test("the construction is stated on the GTP either way", () => {
  for (const c of ["bare", "covered"] as const) {
    const row = deriveFields(construction, { messengerConstruction: c, customerName: "Test" })
      .find((f) => f.key === "messenger.construction");
    assert.ok(row, "messenger construction must be printed — the two are different cables");
    assert.match(String(row.value), c === "bare" ? /Bare/ : /Covered/);
  }
});

test("the phase cores are labelled phase, not power", () => {
  // Client correction, Sept 2026: "Replace Power by Phase (Conductor)". The field KEYS stay
  // `power.*` on purpose — stored GTPs and the audit log reference them — but nothing a reader
  // sees may still say "power".
  const fields = deriveFields(construction, { customerName: "Test" });
  const labels = fields.map((f) => f.label);
  assert.equal(
    labels.filter((l) => /\bpower\b/i.test(l)).length,
    0,
    `no printed label may say "power": ${labels.filter((l) => /\bpower\b/i.test(l)).join(", ")}`,
  );
  assert.ok(labels.some((l) => /phase conductor/i.test(l)), "phase conductor rows must be present");
});

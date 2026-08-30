import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveSolarFields } from "./derive-solar-fields";

const solar = (over = {}) =>
  deriveSolarFields({ csaSqMm: 4, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 40, ...over });
const value = (f: ReturnType<typeof solar>, k: string) => f.find((x) => x.key === k)?.value;

test("solar produces a schedule unlike any other cable type", () => {
  const keys = new Set(solar().map((f) => f.key));
  const ab = new Set(deriveFields(constructionFromSelection(defaultSelection()), {}).map((f) => f.key));
  const lt = new Set(
    deriveLtFields({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true }).map((f) => f.key),
  );
  // Solar-only concepts.
  for (const k of ["solar.conductorClass", "solar.currentRating", "solar.bendingRadius", "solar.overallDia"]) {
    assert.ok(keys.has(k), `solar should carry ${k}`);
    assert.ok(!ab.has(k) && !lt.has(k), `${k} must not leak to other types`);
  }
  // Other types' concepts must not appear here.
  for (const k of ["messenger.size", "lt.innerSheath", "lt.armour", "fin.sag"]) {
    assert.ok(!keys.has(k), `solar must not carry ${k}`);
  }
});

test("conductor class is derived from the connection, not chosen", () => {
  assert.equal(value(solar({ directlyConnectedToModules: true }), "solar.conductorClass"), "Class 5");
  assert.equal(value(solar({ csaSqMm: 25, directlyConnectedToModules: false }), "solar.conductorClass"), "Class 2");
});

test("the two classes give different overall diameters at the same size", () => {
  const c5 = value(solar({ csaSqMm: 25, directlyConnectedToModules: true }), "solar.overallDia");
  const c2 = value(solar({ csaSqMm: 25, directlyConnectedToModules: false }), "solar.overallDia");
  assert.equal(c5, "12.2 mm");
  assert.equal(c2, "11.8 mm");
});

test("current rating is de-rated for ambient, and the trace shows the working", () => {
  const hot = solar({ ambientC: 60 });
  assert.equal(value(hot, "solar.currentRating"), "40.6 A");
  const trace = hot.find((f) => f.key === "solar.currentRating")?.trace ?? "";
  assert.match(trace, /52 A at 40 °C × 0\.78 for 60 °C/);
  // At the base ambient there is no de-rate.
  assert.equal(value(solar({ ambientC: 40 }), "solar.currentRating"), "52 A");
});

test("the sheath tolerance uses 0.15, the insulation 0.1", () => {
  // IS 17293 §6.3 vs §5.3 — a distinction that changes the acceptance limit. At 400 sq mm both
  // nominals are 2.00 mm, so the two floors differ ONLY by the coefficient. That is what makes
  // this the test that stops the two rules being "simplified" into one.
  const f = solar({ csaSqMm: 400 });
  const tol = (k: string) => f.find((x) => x.key === k)?.tolerance;

  assert.equal(value(f, "solar.insulationThickness"), "2.00 mm");
  assert.equal(tol("solar.insulationThickness")?.value, "−15.0%");
  assert.equal(value(f, "solar.sheathThickness"), "2.00 mm");
  assert.equal(tol("solar.sheathThickness")?.value, "−20.0%");
  // The absolute floors stay recoverable in the trace — an inspector measures millimetres.
  assert.match(tol("solar.insulationThickness")?.trace ?? "", /1\.70 mm min at any point/);
  assert.match(tol("solar.sheathThickness")?.trace ?? "", /1\.60 mm min at any point/);

  // Both are standards limits and both must cite the clause they came from.
  assert.equal(tol("solar.insulationThickness")?.origin, "is-rule");
  assert.match(tol("solar.insulationThickness")?.trace ?? "", /§5\.3/);
  assert.equal(tol("solar.sheathThickness")?.origin, "is-rule");
  assert.match(tol("solar.sheathThickness")?.trace ?? "", /§6\.3/);
});

test("the tolerance rows were absorbed into the column, not duplicated", () => {
  // These keys used to be standalone rows. If they come back, a GTP would print each floor twice.
  const keys = new Set(solar().map((f) => f.key));
  assert.ok(!keys.has("solar.insulationToleranceFloor"));
  assert.ok(!keys.has("solar.sheathToleranceFloor"));
});

test("the overall diameter is flagged as indicative, not guaranteed", () => {
  // Both IS 17293 tables footnote this. A GTP that presents it as a guarantee misrepresents it.
  const trace = solar().find((f) => f.key === "solar.overallDia")?.trace ?? "";
  assert.match(trace, /indicative value for information only/i);
});

test("the 120 °C rating is shown as time-limited on the document", () => {
  assert.match(String(value(solar(), "cable.maxTempExcursion")), /20,000 h max/);
  assert.equal(value(solar(), "cable.maxTempContinuous"), "90 °C");
});

test("system voltage is stated separately from cable rating", () => {
  // The cable is rated 1500 V; the system must not exceed 1800 V. Two different numbers.
  assert.match(String(value(solar(), "cable.ratedVoltage")), /1500 V d\.c\./);
  assert.equal(value(solar(), "cable.maxSystemVoltage"), "1800 V d.c.");
});

test("both mandatory markings appear — PV and the halogen-free legend", () => {
  assert.equal(value(solar(), "mark.code"), "PV");
  assert.equal(value(solar(), "mark.legend"), "HALOGEN FREE LOW SMOKE");
  assert.match(String(value(solar(), "drum.atc")), /ATC/);
});

test("a size the chosen class does not cover throws", () => {
  // Class 2 has no row below 16 sq mm.
  assert.throws(() => solar({ csaSqMm: 1.5, directlyConnectedToModules: false }));
});

test("every solar field carries provenance", () => {
  for (const f of solar()) assert.ok(f.trace.length > 0, `${f.key} has no trace`);
});

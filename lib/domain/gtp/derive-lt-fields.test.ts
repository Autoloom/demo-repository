import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import { deriveLtFields } from "./derive-lt-fields";

const ab = () => deriveFields(constructionFromSelection(defaultSelection()), {});
const power = () => deriveLtFields({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
const control = () => deriveLtFields({ standard: "IS1554-1", csaSqMm: 2.5, coreCount: 7, material: "CU", armoured: true });
const keys = (f: { key: string }[]) => f.map((x) => x.key);

test("selecting a different cable type produces a DIFFERENT schedule", () => {
  // The defect this guards: the builder used to run the AB engine whatever type was picked,
  // so every cable produced phase/messenger/street-light fields.
  const abKeys = new Set(keys(ab()));
  const ltKeys = new Set(keys(power()));

  // AB-only concepts must not appear on an LT cable.
  for (const k of ["power.strands", "messenger.size", "streetLight.size", "fin.sag"]) {
    assert.ok(!ltKeys.has(k), `LT power must not carry the AB field ${k}`);
  }
  // LT-only concepts must not appear on an AB cable.
  for (const k of ["lt.innerSheath", "lt.armour", "lt.outerSheath", "lt.calc.diaUnderArmour"]) {
    assert.ok(!abKeys.has(k), `AB cable must not carry the LT field ${k}`);
  }
});

test("only genuinely universal fields are shared between types", () => {
  const shared = keys(ab()).filter((k) => new Set(keys(power())).has(k));
  // Manufacturer identity and rated voltage are the same on any LT cable; nothing else is.
  assert.deepEqual(shared.sort(), ["cable.ratedVoltage", "mfr.isiLicence", "mfr.name"]);
});

test("XLPE and PVC share the derivation chain but not every field", () => {
  const xlpe = deriveLtFields({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
  const pvc = deriveLtFields({ standard: "IS1554-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });

  // The CHAIN is identical — same steps, same order — because it is one engine.
  const chain = (f: typeof xlpe) => keys(f).filter((k) => k.startsWith("lt."));
  assert.deepEqual(chain(xlpe), chain(pvc), "one build-up chain, two datasets");

  // PVC adds one field XLPE has no equivalent for: the mandatory ELECTRIC legend (§17.2).
  const extra = keys(pvc).filter((k) => !new Set(keys(xlpe)).has(k));
  assert.deepEqual(extra, ["mark.legend"]);

  const value = (f: typeof xlpe, k: string) => f.find((x) => x.key === k)?.value;
  assert.notEqual(value(xlpe, "lt.insulation"), value(pvc, "lt.insulation"), "PVC is thicker");
  assert.equal(value(xlpe, "cable.maxTempContinuous"), "90 °C");
  assert.equal(value(pvc, "cable.maxTempContinuous"), "70 °C");
  assert.match(String(value(xlpe, "cable.standard")), /IS 7098/);
  assert.match(String(value(pvc, "cable.standard")), /IS 1554/);
});

test("every LT field carries provenance, and calculated ones name their key", () => {
  for (const f of power()) {
    assert.ok(f.trace.length > 0, `${f.key} has no trace`);
  }
  // The audit property: sheath thicknesses must say which diameter selected them.
  for (const k of ["lt.innerSheath", "lt.armour", "lt.outerSheath"]) {
    const f = power().find((x) => x.key === k);
    assert.match(f?.trace ?? "", /keyed by calculated diameter/, `${k} must show its lookup key`);
  }
});

test("3½ core adds reduced-neutral fields that a 7-core control cable does not have", () => {
  const p = new Set(keys(power()));
  const c = new Set(keys(control()));
  assert.ok(p.has("lt.neutral.reduced"));
  assert.ok(!c.has("lt.neutral.reduced"), "a 7-core cable has no reduced neutral");
});

test("PVC control cables carry the mandatory ELECTRIC legend; XLPE does not", () => {
  // IS 1554-1 §17.2 — distinguishes these from telephone cable. Not optional.
  assert.equal(control().find((f) => f.key === "mark.legend")?.value, "ELECTRIC");
  assert.equal(power().find((f) => f.key === "mark.legend"), undefined);
});

test("unarmoured cables show an armour field saying so, not a blank", () => {
  const plain = deriveLtFields({ standard: "IS7098-1", csaSqMm: 95, coreCount: 4, material: "AL", armoured: false });
  assert.equal(plain.find((f) => f.key === "lt.armour")?.value, "Unarmoured");
  assert.equal(plain.find((f) => f.key === "lt.armourCoverage"), undefined);
});

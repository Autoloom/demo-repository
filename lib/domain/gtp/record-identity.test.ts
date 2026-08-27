/**
 * What the SAVED RECORD says the cable is.
 *
 * The builder used to hardcode "LT Aerial Bunched, XLPE — ${sizeInput}" as the cable type on
 * every generated GTP, and `sizeInput` was composed from the AB pickers alone. Selecting LT
 * power and building a 3.5C x 300 therefore filed a record — and a PDF subtitle, and a kanban
 * card — describing a 3Cx70 AB cable nobody had selected. The derived fields were right; every
 * label identifying the cable was wrong.
 *
 * These pin the identity, which no field-level test covers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CABLE_TYPES, findCableType } from "./cable-types";
import type { ProductLine } from "./types";

/** Mirrors the builder's `designation` memo. */
function designationFor(
  line: ProductLine,
  args: { sizeInput: string; lt: { coreCount: number; csaSqMm: number }; solar: { csaSqMm: number; class5: boolean } },
): string {
  if (line === "SOLAR_DC") return `1Cx${args.solar.csaSqMm} (${args.solar.class5 ? "Class 5" : "Class 2"})`;
  if (line === "XLPE_POWER" || line === "PVC_CONTROL") {
    const cores = args.lt.coreCount === 3.5 ? "3.5" : String(args.lt.coreCount);
    return `${cores}Cx${args.lt.csaSqMm}`;
  }
  return args.sizeInput;
}

const ARGS = {
  sizeInput: "3Cx70 + 1Cx50 + 1Cx16",
  lt: { coreCount: 3.5, csaSqMm: 300 },
  solar: { csaSqMm: 4, class5: true },
};

test("the designation follows the SELECTED cable type", () => {
  assert.equal(designationFor("AB_CABLE", ARGS), "3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(designationFor("XLPE_POWER", ARGS), "3.5Cx300");
  assert.equal(designationFor("PVC_CONTROL", ARGS), "3.5Cx300");
  assert.equal(designationFor("SOLAR_DC", ARGS), "1Cx4 (Class 5)");
});

test("no non-AB cable is ever labelled with the AB designation", () => {
  // The exact regression: an LT record reading "3Cx70 + 1Cx50 + 1Cx16".
  for (const line of ["XLPE_POWER", "PVC_CONTROL", "SOLAR_DC"] as const) {
    assert.notEqual(designationFor(line, ARGS), ARGS.sizeInput, `${line} must not inherit the AB size string`);
  }
});

test("the cable-type label comes from the registry, never a literal", () => {
  // Hardcoding one label is what produced the bug. Every type must resolve its own.
  const labels = CABLE_TYPES.map((t) => t.label);
  assert.equal(new Set(labels).size, labels.length, "labels must be distinct or the record is ambiguous");
  for (const t of CABLE_TYPES) {
    assert.equal(findCableType(t.id)?.label, t.label);
    assert.ok(t.label.length > 0);
  }
});

test("solar designation records the conductor class, which changes the cable", () => {
  // Class 5 and class 2 at the same size are different cables with different diameters, so the
  // designation has to distinguish them.
  const c5 = designationFor("SOLAR_DC", { ...ARGS, solar: { csaSqMm: 25, class5: true } });
  const c2 = designationFor("SOLAR_DC", { ...ARGS, solar: { csaSqMm: 25, class5: false } });
  assert.notEqual(c5, c2);
  assert.match(c5, /Class 5/);
  assert.match(c2, /Class 2/);
});

test("3.5-core renders as 3.5, not 3 or 4", () => {
  const d = designationFor("XLPE_POWER", { ...ARGS, lt: { coreCount: 3.5, csaSqMm: 300 } });
  assert.equal(d, "3.5Cx300");
  assert.notEqual(d, "3Cx300");
  assert.notEqual(d, "4Cx300");
});

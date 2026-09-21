/**
 * Golden-file test (PRD P0-1, CI-enforced ground truth).
 *
 * Reproduces every VERIFIED LOOKUP/CALC field of the approved KRYFS PKG-30 GTP
 * (WBSEDCL, cable 3Cx70 + 1Cx50 + 1Cx16) from spec §0.5. If the encoded IS tables can't
 * reproduce these, the engine's foundation is wrong — everything above it rests on this.
 *
 * Run: `npm test` (node --import tsx --test) — resolves the `@/` alias and TS extensions.
 *
 * NOTE: only fields spec §0.5 pins down are asserted. GAP-marked table rows are covered by
 * the parser/structure tests, not exact-value asserts, until the real PDFs land.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveFields } from "@/lib/domain/gtp/derive";
import { parseSizeString } from "@/lib/domain/gtp/parse-size";
import { validateGtp } from "@/lib/domain/gtp/validate";
import { buildGtpPdfDocument } from "@/lib/domain/gtp/pdf-document";
import { CUSTOMER_PROFILES } from "@/lib/domain/gtp/profiles";
import { createPdfBytes } from "@/lib/domain/pdf";
import type { ResolvedField } from "@/lib/domain/gtp/types";
import {
  insulationToleranceFloorMm,
  IS14255_1995_MESSENGER_PAIRING,
  IS14255_1995_PHASE,
  IS14255_1995_RULES,
  findPhaseRow,
} from "@/lib/domain/standards/is14255-1995";

const WBSEDCL_QUIRKS = {
  tolerancePhrasing: "min" as const,
  sagPercent: 1.5,
  layRatioFactor: 0.995,
  customerName: "WBSEDCL",
};

function fieldValue(fields: ResolvedField[], key: string): string | number | undefined {
  return fields.find((f) => f.key === key)?.value;
}

test("parser reads the WBSEDCL PKG-30 size string with forgiving notation", () => {
  for (const input of ["3Cx70 + 1Cx50 + 1Cx16", "3C X 70 + 1C X 50 + 1C X 16 sqmm", "3cx70+1cx50+1cx16"]) {
    const result = parseSizeString(input);
    assert.equal(result.ok, true, `should parse "${input}"`);
    if (!result.ok) return;
    const roles = result.construction.groups.map((g) => `${g.role}:${g.count}x${g.sizeSqMm}`);
    assert.deepEqual(roles, ["power:3x70", "messenger:1x50", "street-light:1x16"], input);
  }
});

test("golden file — power core (70 sq mm) reproduces approved KRYFS values", () => {
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS);

  // §0.5: 19 strands @ 2.17 mm min, compacted dia 9.44, insulation 1.50 (Min),
  //        dia over insulation 12.44, 154 A @ 40°C, max DC resistance 0.443, ~196 kg/km/core.
  assert.equal(fieldValue(fields, "power.strands"), 19);
  assert.equal(fieldValue(fields, "power.strandDia"), "2.17 mm");
  assert.equal(fieldValue(fields, "power.compactedDia"), "9.44 mm");
  // Values are bare dimensions; the permitted departure lives in the tolerance column.
  assert.equal(fieldValue(fields, "power.insulationThickness"), "1.50 mm");
  assert.equal(fieldValue(fields, "power.diaOverInsulation"), "12.44 mm"); // CALC: 9.44 + 2×1.50
  assert.equal(fieldValue(fields, "power.currentRating"), "154 A @ 40°C");
  assert.equal(fieldValue(fields, "power.maxDcResistance"), "0.443 ohm/km");
  assert.equal(fieldValue(fields, "power.massPerKm"), "196 kg/km");

  const tol = (k: string) => fields.find((f) => f.key === k)?.tolerance;
  // One-sided: IS 14255 §7.3 sets a floor and no upper limit, so this is −16.7%, never ±16.7%.
  assert.equal(tol("power.insulationThickness")?.value, "−16.7%");
  assert.match(tol("power.insulationThickness")?.trace ?? "", /1\.25 mm min at any point/);
  assert.equal(tol("power.massPerKm")?.value, "±3%");
  // The mass spread is ours, not the standard's. Conflating the two would let an inspector
  // reject a drum against a limit IS 14255 never sets.
  assert.equal(tol("power.massPerKm")?.origin, "works-estimate");
});

test("golden file — messenger (50 sq mm) reproduces approved KRYFS values", () => {
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS);

  // §0.5: 7 strands, compacted dia 7.98, breaking load 14 kN, 0.689 ohm/km, 128 A, 23.0×10⁻⁶/°C.
  assert.equal(fieldValue(fields, "messenger.strands"), 7);
  assert.equal(fieldValue(fields, "messenger.compactedDia"), "7.98 mm");
  assert.equal(fieldValue(fields, "messenger.breakingLoad"), "14 kN");
  assert.equal(fieldValue(fields, "messenger.resistance"), "0.689 ohm/km");
  assert.equal(fieldValue(fields, "messenger.currentRating"), "128 A");
  assert.equal(fieldValue(fields, "messenger.expansion"), "23.0×10⁻⁶/°C");
});

test("QUIRK — WBSEDCL sag is 1.5%, not the 3% default", () => {
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS);
  const sag = fields.find((f) => f.key === "fin.sag");
  assert.equal(sag?.value, "1.5%");
  assert.equal(sag?.tag, "QUIRK");
});

test("validation catches the KRYFS non-monotonic de-rating bug (the demo)", () => {
  // §0.5: 1.22 → 1.25 → 1.16 → 1.09 → 1.10 → 0.9 — two rises (1.22→1.25 and 1.09→1.10).
  const result = validateGtp([], { deratingFactors: [1.22, 1.25, 1.16, 1.09, 1.1, 0.9] });
  const derating = result.issues.filter((i) => i.rule === "derating.non-monotonic");
  assert.equal(derating.length, 2, "should flag both transcription errors");
  assert.equal(result.passesHardGate, false, "errors must block Generate");
});

test("validation — clean de-rating ladder passes", () => {
  const result = validateGtp([], { deratingFactors: [1.22, 1.16, 1.09, 1.0, 0.9] });
  assert.equal(result.issues.filter((i) => i.rule === "derating.non-monotonic").length, 0);
});

test("validation — CALC build-up is independently re-checked", () => {
  const good: ResolvedField[] = [
    { key: "power.compactedDia", label: "", value: "9.44 mm", tag: "LOOKUP", source: "is-table", trace: "", editable: false },
    { key: "power.insulationThickness", label: "", value: "1.50 mm (Min)", tag: "QUIRK", source: "profile", trace: "", editable: false },
    { key: "power.diaOverInsulation", label: "", value: "12.44 mm", tag: "CALC", source: "calc", trace: "", editable: false },
  ];
  assert.equal(validateGtp(good).issues.filter((i) => i.rule === "buildup.dia-mismatch").length, 0);

  const tampered = good.map((f) => (f.key === "power.diaOverInsulation" ? { ...f, value: "13.00 mm" } : f));
  const issues = validateGtp(tampered).issues.filter((i) => i.rule === "buildup.dia-mismatch");
  assert.equal(issues.length, 1, "a wrong dia-over-insulation must be caught");
});

test("parser reads DHBVN bare-size notation (last size = messenger, middle = street light)", () => {
  // DHBVN CSC-69 Annexure-II: "first part = phase, middle = street lighting, last = messenger".
  const result = parseSizeString("3C x 25 + 16 + 25 mm²");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const roles = result.construction.groups.map((g) => `${g.role}:${g.count}x${g.sizeSqMm}`);
  assert.deepEqual(roles, ["power:3x25", "messenger:1x25", "street-light:1x16"]);
});

test("parser reads DHBVN two-part notation (no street light)", () => {
  const result = parseSizeString("3C x 50 + 35 mm²");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const roles = result.construction.groups.map((g) => `${g.role}:${g.count}x${g.sizeSqMm}`);
  assert.deepEqual(roles, ["power:3x50", "messenger:1x35"]);
});

test("IS 14255 Table 3 — messenger pairing, exactly as printed in the standard", () => {
  // Verified against IS 14255:1995 p.3. The table has SIX rows and ends at 95 sq mm.
  const expected: [number, number, number, number][] = [
    // phase, messenger, min breaking load kN, max DC resistance ohm/km
    [16, 25, 7.0, 1.38],
    [25, 25, 7.0, 1.38],
    [35, 25, 7.0, 1.38],
    [50, 35, 9.8, 0.986],
    [70, 50, 14.0, 0.689],
    [95, 70, 19.7, 0.492],
  ];
  assert.equal(IS14255_1995_MESSENGER_PAIRING.length, expected.length, "row count must match the printed table");
  for (const [phase, messenger, kN, ohmPerKm] of expected) {
    const row = IS14255_1995_MESSENGER_PAIRING.find((r) => r.phaseSqMm === phase);
    assert.ok(row, `pairing row missing for ${phase}`);
    assert.equal(row.messengerSqMm, messenger, `messenger size for ${phase}`);
    assert.equal(row.minBreakingLoadKN, kN, `breaking load for ${phase}`);
    assert.equal(row.maxDcResistanceOhmPerKm, ohmPerKm, `resistance for ${phase}`);
  }
});

test("IS 14255 Table 3 — the fabricated 120 sq mm row must NOT come back", () => {
  // Regression guard. A previous encoding carried 120→70 @ 0.253 ohm/km, 20.6 kN, sourced from
  // the DHBVN spec's reproduction rather than IS 14255. The standard's table ends at 95, and
  // 0.253 is the 120 sq mm PHASE resistance mis-transcribed into the messenger column.
  assert.equal(
    IS14255_1995_MESSENGER_PAIRING.find((r) => r.phaseSqMm === 120),
    undefined,
    "IS 14255 Table 3 has no 120 sq mm row — do not re-add it from a buyer document",
  );
  const seventy = IS14255_1995_MESSENGER_PAIRING.find((r) => r.messengerSqMm === 70);
  assert.equal(seventy?.maxDcResistanceOhmPerKm, 0.492, "the 70 sq mm messenger is 0.492, never 0.253");
});

test("IS 14255 Table 4 — insulation thickness, exactly as printed", () => {
  // Verified against IS 14255:1995 p.4. Six rows, ending at 95 sq mm.
  const expected: [number, number][] = [
    [16, 1.2],
    [25, 1.2],
    [35, 1.2],
    [50, 1.5],
    [70, 1.5],
    [95, 1.5],
  ];
  assert.equal(IS14255_1995_PHASE.length, expected.length, "row count must match the printed table");
  for (const [size, thickness] of expected) {
    const row = findPhaseRow(size);
    assert.ok(row, `phase row missing for ${size}`);
    assert.equal(row.insulationThicknessMinMm, thickness, `insulation thickness for ${size}`);
  }
  assert.equal(findPhaseRow(120), undefined, "IS 14255 Table 4 has no 120 sq mm row");
});

test("IS 14255 clause rules — the '35 times' lay ratio survived OCR corruption", () => {
  // Text extraction renders §9.1 as "3.5 times"; the page reads 35. Guard the correct value.
  assert.equal(IS14255_1995_RULES.maxLayRatio, 35);
  assert.equal(IS14255_1995_RULES.layDirection, "right hand");
  assert.equal(IS14255_1995_RULES.streetLightCsaSqMm, 16, "§6.4 fixes the street-light core at 16 sq mm");
  assert.equal(IS14255_1995_RULES.messengerMinStrands, 7, "§6.2 requires a minimum of 7 strands");
});

test("IS 14255 §7.3 — insulation tolerance floor is ti − (0.1 + 0.1·ti)", () => {
  // 1.5 mm nominal → floor 1.5 − (0.1 + 0.15) = 1.25 mm
  assert.ok(Math.abs(insulationToleranceFloorMm(1.5) - 1.25) < 1e-9);
  // 1.2 mm nominal → floor 1.2 − (0.1 + 0.12) = 0.98 mm
  assert.ok(Math.abs(insulationToleranceFloorMm(1.2) - 0.98) < 1e-9);
});

test("DHBVN profile differs from WBSEDCL — proves the quirk layer separates customers", () => {
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const wb = deriveFields(parsed.construction, WBSEDCL_QUIRKS);
  const dh = deriveFields(parsed.construction, { tolerancePhrasing: "plusminus", sagPercent: 3, customerName: "UHBVN / DHBVN" });

  // Sag is a genuine profile difference and remains the proof that the quirk layer works.
  assert.equal(fieldValue(wb, "fin.sag"), "1.5%");
  assert.equal(fieldValue(dh, "fin.sag"), "3%");

  // Insulation deliberately does NOT differ any more. It used to, but only because DHBVN's
  // "±5%" was invented — IS 14255 §7.3 states a floor, and one standard cannot give two answers
  // for the same cable. A customer's phrasing is not a licence to change the number.
  assert.equal(fieldValue(wb, "power.insulationThickness"), "1.50 mm");
  assert.equal(fieldValue(dh, "power.insulationThickness"), "1.50 mm");
  const tolOf = (f: typeof wb) => f.find((x) => x.key === "power.insulationThickness")?.tolerance;
  assert.equal(tolOf(wb)?.value, "−16.7%");
  assert.equal(tolOf(dh)?.value, "−16.7%");

  // Nor may phrasing rewrite provenance: the value is an IS table lookup for both.
  for (const f of [wb, dh]) {
    const insulation = f.find((x) => x.key === "power.insulationThickness");
    assert.equal(insulation?.tag, "LOOKUP");
    assert.equal(insulation?.source, "is-table");
  }
  // WBSEDCL's convention survives where it belongs — in the trace, not in the number.
  assert.match(tolOf(wb)?.trace ?? "", /\(Min\)/);
  assert.doesNotMatch(tolOf(dh)?.trace ?? "", /\(Min\)/);
});

test("golden file — computed bundle dia & mass land within tolerance of the approved KRYFS GTP", () => {
  // §0.5 states the finished cable as ~35 mm overall and ~966 kg/km ±5%. Our figures are derived
  // from densities + geometry, NOT fitted to these, so agreement is real corroboration. The bands
  // below are deliberately loose (estimates, per "approx." in the schedules) but tight enough to
  // catch a constant being fat-fingered.
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS);

  const dia = Number(String(fieldValue(fields, "fin.overallDia")).match(/[\d.]+/)?.[0]);
  const mass = Number(String(fieldValue(fields, "fin.totalMass")).match(/[\d.]+/)?.[0]);

  assert.ok(dia > 31 && dia < 39, `overall dia ${dia} mm should be near the approved ~35 mm`);
  assert.ok(mass > 900 && mass < 1030, `mass ${mass} kg/km should be near the approved ~966 kg/km`);
});

test("neither bundle CALC is a blocking gap for an encoded cable", () => {
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS);
  for (const key of ["fin.overallDia", "fin.totalMass"]) {
    assert.equal(fields.find((f) => f.key === key)?.gap, undefined, `${key} should no longer be a gap`);
  }
});

test("drum plan — exact multiples pass, part-drums warn", () => {
  // An order legitimately spans many drums, so this is not an equality check: what needs a
  // human is a remainder, i.e. a short last drum.
  const rule = (ordered: number, drum: number) =>
    validateGtp([], { orderedLengthM: ordered, drumLengthM: drum }).issues.filter((i) =>
      i.rule.startsWith("drum."),
    );

  assert.equal(rule(1000, 1000).length, 0, "one full drum is fine");
  assert.equal(rule(5000, 1000).length, 0, "five full drums is fine");

  const partial = rule(2500, 1000);
  assert.equal(partial.length, 1, "a remainder must be flagged");
  assert.equal(partial[0].severity, "warning", "a short last drum is possible, not impossible");
  assert.match(partial[0].message, /500 m/, "the message should name the shortfall");
});

test("drum plan — zero or negative lengths are an error, not a warning", () => {
  const issues = validateGtp([], { orderedLengthM: 1000, drumLengthM: 0 }).issues;
  assert.equal(issues.filter((i) => i.rule === "drum.length-invalid").length, 1);
  assert.equal(issues.find((i) => i.rule === "drum.length-invalid")?.severity, "error");
});

test("parser — unsupported size returns a suggestion state, never throws", () => {
  // 400 sq mm used to be unsupported; encoding the real IS 8130 Table 2 made it a valid
  // conductor size. 1200 sq mm is a Milliken segmental size whose wire count the standard
  // explicitly leaves unspecified (Table 2, footnote 3), so it stays outside the offerable set.
  const result = parseSizeString("3Cx1200");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /don't have IS table data/i);
  assert.ok(result.suggestions.length > 0);
});

test("parser — gibberish returns a friendly suggestion state", () => {
  const result = parseSizeString("hello world");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.suggestions.length > 0);
});

// ── Sprint 0 §3.4 / D10 — internal notes must never reach the customer ────────

test("D10 — internal override reasons never appear in the rendered PDF text", () => {
  // Override reasons are internal operational context. If one leaked onto a GTP sent to a
  // discom it would expose our reasoning to the buyer. Validated live in the demo; guarded here.
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const SECRET = "INTERNAL-ONLY-customer-asked-for-this-verbally";
  const fields = deriveFields(parsed.construction, WBSEDCL_QUIRKS).map((f) =>
    f.key === "power.insulationThickness"
      ? { ...f, value: "1.60 mm (Min)", override: { previous: f.value, reason: SECRET, by: "op", at: "2026-01-01" } }
      : f,
  );

  const doc = buildGtpPdfDocument(fields, {
    gtpId: "GTP-D10", version: 1, status: "Draft",
    customerName: "WBSEDCL", state: "West Bengal",
    designation: "3Cx70 + 1Cx50 + 1Cx16",
  });

  const rendered = new TextDecoder().decode(createPdfBytes(doc));
  assert.equal(rendered.includes(SECRET), false, "the override reason must not be in the PDF");

  // And prove the test would actually catch a leak: the value itself IS present.
  const allText = JSON.stringify(doc);
  assert.ok(allText.includes("1.60 mm (Min)"), "the overridden value should still print");
});

test("D8 — supplier names never reach the rendered PDF", () => {
  // Suppliers are chosen per purchase on price; disclosing sourcing on a GTP is commercially
  // sensitive. No supplier is asked for in the flow, and none may appear in output.
  const parsed = parseSizeString("3Cx70 + 1Cx50 + 1Cx16");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const doc = buildGtpPdfDocument(deriveFields(parsed.construction, WBSEDCL_QUIRKS), {
    gtpId: "GTP-D8", version: 1, status: "Draft",
    customerName: "WBSEDCL", state: "West Bengal",
    designation: "3Cx70 + 1Cx50 + 1Cx16",
  });
  const text = JSON.stringify(doc);

  for (const supplier of ["NALCO", "HINDALCO", "BALCO", "VEDANTA", "KLJ", "Kalpana"]) {
    assert.equal(text.includes(supplier), false, `${supplier} must not appear on the GTP`);
  }
  assert.equal(/supplier/i.test(text), false, "no supplier row, not even an empty one");
});

test("§3.2 — curing options are Steam and Water only; no compound brand names", () => {
  for (const profile of CUSTOMER_PROFILES) {
    assert.deepEqual(
      profile.choices.curingMethods,
      ["Steam", "Water"],
      `${profile.name}: Steam (default) and Water only`,
    );
  }
});

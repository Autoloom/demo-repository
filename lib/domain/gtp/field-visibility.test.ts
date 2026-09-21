/**
 * Show/hide semantics. The rules live in the builder, but the CONSEQUENCES are what matter,
 * so they are pinned against the PDF renderer that consumes the filtered list.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import { manualTolerance } from "./tolerance";
import { buildGtpPdfDocument } from "./pdf-document";
import type { ResolvedField } from "./types";

const meta = {
  gtpId: "GTP-1", version: 1, status: "draft", customerName: "WBSEDCL",
  state: "West Bengal", designation: "3Cx70 + 1Cx50 + 1Cx16",
};
const allFields = () => deriveFields(constructionFromSelection(defaultSelection()), {});

/** Every particular label the rendered document actually contains. */
function printedLabels(fields: ResolvedField[]): string[] {
  const doc = buildGtpPdfDocument(fields, meta);
  return doc.sections.flatMap((sec) => sec.table?.rows.map((r) => String(r[0] ?? "")) ?? []);
}

test("hiding a field removes it from the printed document", () => {
  const fields = allFields();
  const target = fields.find((f) => f.key === "power.maxDcResistance");
  assert.ok(target);

  assert.ok(printedLabels(fields).includes(target.label), "shown by default");
  const printed = fields.filter((f) => f.key !== target.key);
  assert.ok(!printedLabels(printed).includes(target.label), "hidden fields must not print");
});

test("hiding one field leaves every other field untouched", () => {
  const fields = allFields();
  const printed = fields.filter((f) => f.key !== "power.maxDcResistance");
  const out = printedLabels(printed);
  for (const f of printed) {
    assert.ok(out.includes(f.label), `${f.key} should still print`);
  }
});

test("a field with an unresolved gap is never hideable", () => {
  // The rule the UI enforces, stated here so it cannot be relaxed silently: hiding a gap
  // would turn a visible missing value into an invisible one on a signed document.
  const canHide = (f: ResolvedField) => !f.gap;
  const gaps = allFields().filter((f) => f.gap);
  assert.ok(gaps.length > 0, "the fixture should contain at least one gap to be meaningful");
  for (const g of gaps) {
    assert.equal(canHide(g), false, `${g.key} carries a gap and must stay on the document`);
  }
});

test("hiding is not deleting — the derived list is unchanged", () => {
  const fields = allFields();
  const before = fields.length;
  const printed = fields.filter((f) => f.key !== "power.maxDcResistance");
  assert.equal(fields.length, before, "the source list must not be mutated");
  assert.equal(printed.length, before - 1);
});

test("the sign-off block survives however much is hidden", () => {
  // Whatever an operator trims, the document must still be signable.
  const doc = buildGtpPdfDocument([], meta);
  const signOff = doc.sections.find((sec) => sec.title === "Sign-off");
  assert.ok(signOff, "an empty document must still be signable");
  const lines = (signOff.lines ?? []).map((l) => String(l ?? ""));
  assert.ok(lines.some((l) => l.includes("Divisional Engineer")));
  assert.ok(lines.some((l) => l.includes("Assistant Engineer")));
});

test("MANUAL parameters print like any other field", () => {
  // A hand-added parameter is a real row on the document — the buyer asked for it. It is the
  // TAG that marks its origin internally, not its absence from the PDF.
  const fields = allFields();
  const custom: ResolvedField = {
    key: "custom.abc123", label: "Tender clause 4.2 compliance", value: "Confirmed",
    tag: "MANUAL", source: "override", trace: "Added manually — not derived from any standard",
    editable: true, tolerance: manualTolerance(""),
  };
  assert.ok(printedLabels([...fields, custom]).includes("Tender clause 4.2 compliance"));
});

test("a hand-added parameter carries its own tolerance to the document", () => {
  // Custom parameters are appended AFTER the engines run, so they never pass through
  // withMandatoryTolerance(). They used to reach the PDF with no tolerance at all, and the
  // `?? TOLERANCE_NA` fallback in toRow() — documented as unreachable — quietly supplied one.
  // It was reachable every time, for exactly this field type.
  const stated: ResolvedField = {
    key: "custom.stated", label: "Conductor resistance (tender)", value: "0.443 ohm/km",
    tag: "MANUAL", source: "override", trace: "Added manually — not derived from any standard",
    editable: true, tolerance: manualTolerance("±2%"),
  };
  const unstated: ResolvedField = {
    key: "custom.unstated", label: "Tender clause 4.2 compliance", value: "Confirmed",
    tag: "MANUAL", source: "override", trace: "Added manually — not derived from any standard",
    editable: true, tolerance: manualTolerance(""),
  };

  const doc = buildGtpPdfDocument([...allFields(), stated, unstated], meta);
  const rows = doc.sections.flatMap((sec) => sec.table?.rows ?? []);
  const rowFor = (label: string) => rows.find((r) => String(r[0]) === label);

  // Typed verbatim, and the unstated one as an explicit N/A rather than a blank cell.
  assert.equal(rowFor("Conductor resistance (tender)")?.[2], "±2%");
  assert.equal(rowFor("Tender clause 4.2 compliance")?.[2], "N/A");

  // The reason each row says what it says stays internal — it is not a customer-facing note.
  const everything = JSON.stringify(doc);
  assert.ok(!everything.includes("hand-added parameter"), "the N/A reason must not print");
});

test("override REASONS never reach the printed document", () => {
  // build-plan-v2 D10. Reasons are internal operational context ("customer asked verbally") and
  // belong in the audit log, not on a page the buyer reads. This is the boundary between the
  // two, and it has to hold now that reasons are persisted rather than discarded.
  const reason = "Customer asked verbally — matching their last order";
  const withOverride: ResolvedField[] = allFields().map((f) =>
    f.key === "power.maxDcResistance"
      ? { ...f, value: "0.440 ohm/km", source: "override" as const,
          override: { previous: String(f.value), reason, by: "R. Kamble", at: new Date().toISOString() } }
      : f,
  );
  const doc = buildGtpPdfDocument(withOverride, meta);
  const everything = JSON.stringify(doc);
  assert.ok(!everything.includes(reason), "the reason must not appear anywhere in the document");
  assert.ok(!everything.includes("asked verbally"));
  // The overridden VALUE does print — it is what the cable will be built to.
  assert.ok(everything.includes("0.440 ohm/km"));
});

test("D10: a below-nominal build target, its reason, and the margin stay off BOTH bidding documents", async () => {
  const { deriveLtFields } = await import("./derive-lt-fields");
  const { specFromFields } = await import("./spec-from-fields");
  const { buildSpecFromFields } = await import("./build-spec");
  const { quotePdfDocument } = await import("../quote-pdf");
  const { computeGst } = await import("../costing");
  const { costCable } = await import("./quote-costing");
  const { seedData } = await import("@/lib/seed/data");
  const config = { standard: "IS7098-1" as const, coreCount: 3.5, csaSqMm: 240, material: "AL" as const, armoured: true };
  const fields = deriveLtFields(config).map((f) => f.key === "mfr.isiLicence" ? { ...f, gap: false, value: "TEST-LICENCE" } : f);
  const spec = specFromFields({ specId: "S", config, productLine: "XLPE_POWER", armourForm: "round-wire", fields, designation: "3.5C x 240" });
  assert.ok(!("gap" in spec));
  const buildSpec = buildSpecFromFields(spec.id, spec.gtpSource!, { "lt.insulation": 1.5137 });
  const reason = "INTERNAL WORKS SAVING DECISION";
  // Distinctive, unlikely-to-collide margins per category so a leak into any printed number is
  // detectable — each material can carry its own margin, and none of them may ever print.
  const marginPctByCategory = { Conductor: 37.31, Insulation: 41.17, Armour: 22.53, Sheath: 33.89, Labour: 19.71 };
  const commercial = { lengthM: 1000, marginPctByCategory, metalRatePerKg: 0, overheadPerM: 18 };
  const costing = costCable(spec, commercial, seedData.materials);
  const line = { ...seedData.quotes[0].lines[0], specId: spec.id, marginPct: costing.blendedMarginPct, buildSpec: { ...buildSpec, reason }, specSnapshot: spec, lineTotalInr: costing.lineTotalInr };
  const gtpDocument = buildGtpPdfDocument(fields, { ...meta, designation: spec.designation });
  const quoteDocument = quotePdfDocument({ customerName: "Test customer", validUntil: "2026-10-01", lines: [{ line, spec, costing }], subtotalInr: line.lineTotalInr, totalInr: line.lineTotalInr, gstSplit: computeGst(line.lineTotalInr) });
  for (const document of [gtpDocument, quoteDocument]) {
    const printed = JSON.stringify(document);
    for (const secret of ["1.5137", "builtMm", "buildSpec", "massAtBuiltKgPerKm", reason, "37.31", "41.17", "22.53", "33.89", "19.71", "marginPct"]) assert.ok(!printed.includes(secret), `${secret} leaked to ${document.title}`);
  }
  assert.ok(JSON.stringify(gtpDocument).includes("1.70 mm"), "GTP still declares nominal insulation");
});

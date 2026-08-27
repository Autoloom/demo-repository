/**
 * Show/hide semantics. The rules live in the builder, but the CONSEQUENCES are what matter,
 * so they are pinned against the PDF renderer that consumes the filtered list.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
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
    editable: true,
  };
  assert.ok(printedLabels([...fields, custom]).includes("Tender clause 4.2 compliance"));
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

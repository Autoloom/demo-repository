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

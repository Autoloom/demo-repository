/**
 * Structural guards on the printed GTP.
 *
 * The tests here are cheap and mostly check shape rather than content, because the failure they
 * guard against is not a wrong number — it is a malformed document. `pdf.ts` indexes `widths` by
 * column index, so a table whose headers and widths disagree produced coordinates that were
 * literally the string "undefined". Three separate call sites in pdf-document.ts build tables,
 * and each one is an opportunity for them to drift apart. Walking the finished document and
 * asserting the invariant catches all three at once, including any added later.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { constructionFromSelection, defaultSelection } from "./compose-size";
import { deriveFields } from "./derive";
import { deriveLtFields } from "./derive-lt-fields";
import { deriveSolarFields } from "./derive-solar-fields";
import { buildGtpPdfDocument } from "./pdf-document";
import type { GtpPdfMeta } from "./pdf-document";
import type { ResolvedField } from "./types";

const meta: GtpPdfMeta = {
  gtpId: "GTP-0001",
  version: 1,
  status: "Draft",
  customerName: "WBSEDCL",
  state: "West Bengal",
  designation: "3Cx70 + 1Cx50 + 1Cx16",
  orderQuantities: { totalLengthM: 5000, drumLengthM: 1000, drumCount: 5 },
};

const ab = () => deriveFields(constructionFromSelection(defaultSelection()), {});
const lt = () =>
  deriveLtFields({ standard: "IS7098-1", csaSqMm: 300, coreCount: 3.5, material: "AL", armoured: true });
const solar = () =>
  deriveSolarFields({ csaSqMm: 4, directlyConnectedToModules: true, installationMethod: "free-in-air", ambientC: 40 });

const tables = (fields: ResolvedField[]) =>
  buildGtpPdfDocument(fields, meta).sections.flatMap((s) => (s.table ? [s.table] : []));

test("every table declares as many widths as headers, summing to the page budget", () => {
  // 514 is the width every table in this repo uses. A table that disagrees either overflows the
  // page or leaves a ragged right edge, and one with too few widths corrupts the content stream.
  for (const fields of [ab(), lt(), solar()]) {
    for (const table of tables(fields)) {
      assert.equal(
        table.widths?.length,
        table.headers.length,
        `"${table.headers.join("|")}" has ${table.widths?.length} widths for ${table.headers.length} headers`,
      );
      assert.equal(table.widths?.reduce((a, b) => a + b, 0), 514);
    }
  }
});

test("every row carries exactly one cell per header", () => {
  // Catches hardcoded rows — the "Quantity & drums" block builds its cells by hand and does not
  // go through the field mapper, so it cannot be kept in step automatically.
  for (const fields of [ab(), lt(), solar()]) {
    for (const table of tables(fields)) {
      for (const row of table.rows) {
        assert.equal(
          row.length,
          table.headers.length,
          `row "${String(row[0])}" has ${row.length} cells, expected ${table.headers.length}`,
        );
      }
    }
  }
});

test("a field with no tolerance prints an empty cell, never the word undefined", () => {
  const doc = JSON.stringify(buildGtpPdfDocument(ab(), meta));
  assert.ok(!doc.includes("undefined"), "an absent tolerance leaked into the document");
  assert.ok(!doc.includes("null"));
});

test("the tolerance prints beside its value, on the same row", () => {
  // The whole point of the column: a reader should not have to pair a nominal with a limit
  // listed elsewhere in the table.
  const rows = tables(ab()).flatMap((t) => t.rows);
  const insulation = rows.find((r) => String(r[0]).startsWith("Insulation thickness"));
  assert.ok(insulation, "the insulation row is missing");
  assert.match(String(insulation?.[1]), /^\d+\.\d{2} mm$/);
  assert.equal(insulation?.[2], "−16.7%");
});

test("every printed row states a tolerance — a number or N/A, never a blank", () => {
  // Tolerance is a mandatory input. An empty cell on a stamped document is ambiguous between
  // "does not apply" and "nobody filled this in", and an inspector cannot tell which.
  for (const fields of [ab(), lt(), solar()]) {
    for (const table of tables(fields)) {
      for (const row of table.rows) {
        assert.notEqual(String(row[2]).trim(), "", `"${String(row[0])}" printed an empty tolerance`);
      }
    }
  }
});

test("LT and solar fields reach the document with their tolerances intact", () => {
  // These two types carry no SECTION_PLAN prefix, so they render entirely through the
  // "Other particulars" table. If that table were left at two columns, the tolerance column
  // would be invisible for half the product range while looking fine on AB.
  for (const [name, fields] of [["LT", lt()], ["solar", solar()]] as const) {
    const printed = tables(fields).flatMap((t) => t.rows.map((r) => String(r[2])));
    assert.ok(
      printed.some((cell) => cell.includes("%")),
      `${name} printed no numeric tolerance at all`,
    );
  }
});

test("a tolerance override REASON never reaches the printed document", () => {
  // build-plan-v2 D10, extended to the new column. The tolerance VALUE is what the cable is
  // judged against and must print; why an operator changed it is internal context.
  const reason = "Buyer accepted a wider floor on the phone";
  const fields = ab().map((f) =>
    f.key === "power.insulationThickness"
      ? {
          ...f,
          tolerance: {
            value: "min 1.20 mm",
            origin: "manual" as const,
            trace: "Entered manually",
            override: {
              previous: "min 1.25 mm",
              previousOrigin: "is-rule" as const,
              reason,
              by: "R. Kamble",
              at: new Date().toISOString(),
            },
          },
        }
      : f,
  );

  const everything = JSON.stringify(buildGtpPdfDocument(fields, meta));
  assert.ok(!everything.includes(reason), "the reason must not appear anywhere in the document");
  assert.ok(!everything.includes("on the phone"));
  assert.ok(!everything.includes("R. Kamble"));
  // The edited tolerance itself does print — it is what the cable will be built to.
  assert.ok(everything.includes("min 1.20 mm"));
});

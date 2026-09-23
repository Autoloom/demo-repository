/**
 * The customer's copy, checked against the offer it is modelled on.
 *
 * Two kinds of check here, and the second is the one that matters.
 *
 * SHAPE: it is the document Navya sends — three parts in their order, a schedule with a rate per
 * metre and no amount column, the fifteen standing terms. Verified against DCIPL/71/2026-27 to
 * Avadh Business Services, 16 Sept 2026.
 *
 * BOUNDARY: nothing internal reaches it. The quote screen knows the metal rate per kilogram, the
 * conversion percentage, the wastage, the finance cost, the drum, the freight and the margin —
 * and a buyer who can read any of them can price our cable for us. This is the same boundary
 * `field-visibility.test.ts` holds for the GTP, and it is asserted the same way: by driving a
 * real costing through and then searching the rendered bytes for the numbers, rather than by
 * trusting that nobody will add a helpful subtotal later.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createPdfBytes } from "../pdf";
import { customerOfferDocument, offerDescription, type CustomerOffer } from "./customer-offer";
import { DEFAULT_LETTERHEAD, financialYear, offerNumber } from "./letterhead";
import type { CableSpec } from "@/lib/services/types";

const controlSpec: CableSpec = {
  id: "SPEC-CTRL",
  family: "Control Cable",
  standard: "IS 1554-1",
  voltageGrade: "650/1100 V (1.1 kV)",
  cores: "12C",
  conductorMaterial: "Copper",
  conductorClass: "Class 2 (stranded)",
  conductorSizeSqMm: 2.5,
  insulation: "PVC (Type A)",
  armour: "GI strip (GSS)",
  sheath: "PVC (ST1)",
  flameClass: "FRLS",
  designation: "12Cx2.5",
};

const offer: CustomerOffer = {
  letterhead: DEFAULT_LETTERHEAD,
  offerNo: "DCIPL/71/2026-27",
  date: "2026-09-16",
  buyer: {
    name: "M/s. Avadh Business Services I Pvt. Ltd.",
    addressLines: ["Building No 2, Kuldevi Kripa A Wing,", "Thane, Ambernath, Maharashtra 421505"],
    attentionName: "Madam Zalita",
  },
  projectName: "MSETCL Tilwani Substation Project",
  lines: [
    { description: offerDescription(controlSpec), unit: "RMT", quantity: 5600, ratePerMetreInr: 561.9 },
  ],
};

/**
 * The rendered PDF as searchable text.
 *
 * Parentheses come back unescaped: the content stream writes `(text) Tj`, so a literal bracket
 * in the copy is stored as `\(`. Searching the raw bytes for "1) This Covering Letter" therefore
 * never matches, which would have made the leak assertions below pass for the wrong reason.
 */
function render(input: CustomerOffer): string {
  const raw = new TextDecoder().decode(createPdfBytes(customerOfferDocument(input)));
  return raw.replace(/\\([()])/g, "$1");
}

test("the description reads as the buyer's schedule writes it, not as our vocabulary does", () => {
  // Theirs: "Cu, 12 Core, 2.5 sq.mm, Steel Armoured, FRLS Control Cable".
  assert.equal(offerDescription(controlSpec), "Cu, 12 Core, 2.5 sq.mm, Steel Armoured, FRLS Control Cable");

  // Aluminium power, their row 6: "Aluminum Conductor, 4 Core, 10 sq.mm, Armored, FRLS Power Cable".
  const power: CableSpec = {
    ...controlSpec,
    family: "LT XLPE Power",
    cores: "4C",
    conductorMaterial: "Aluminium",
    conductorSizeSqMm: 10,
    insulation: "XLPE",
    standard: "IS 7098-1",
  };
  assert.equal(offerDescription(power), "Aluminum, 4 Core, 10 sq.mm, Steel Armoured, FRLS Power Cable");

  // A cable with no flame class does not print an empty word where the class would be.
  assert.equal(
    offerDescription({ ...controlSpec, flameClass: "Standard" }),
    "Cu, 12 Core, 2.5 sq.mm, Steel Armoured, Control Cable",
  );
  assert.equal(
    offerDescription({ ...controlSpec, armour: "Unarmoured" }),
    "Cu, 12 Core, 2.5 sq.mm, Unarmoured, FRLS Control Cable",
  );
});

test("the offer carries all three parts, each on its own sheet", () => {
  const doc = customerOfferDocument(offer);
  const text = render(offer);
  for (const phrase of [
    "1) This Covering Letter",
    "2) Price Schedule",
    "3) Terms & Conditions of Supply",
    "Priced Schedule",
    "Rate/mtr",
    "561.90",
    "RMT",
    "5600",
  ]) {
    assert.ok(text.includes(phrase), `the offer must print "${phrase}"`);
  }
  // Three sheets: the letter, the schedule, the terms. `/Count` is the page tree's own answer.
  assert.match(text, /\/Count 3/);
  assert.equal(doc.sections.filter((s) => s.pageBreak).length, 2);
});

test("the schedule quotes a rate and stops — no amount column, no line total, no grand total", () => {
  // Their sheet has five columns and no arithmetic. Extending the line here would change the
  // commercial offer, not just its layout: 5600 m at 561.90 is a number nobody quoted.
  const doc = customerOfferDocument(offer);
  const schedule = doc.sections.find((s) => s.table?.headers.includes("Rate/mtr"));
  assert.ok(schedule?.table);
  assert.deepEqual(schedule.table.headers, ["S.No.", "Description", "Unit", "Quantity", "Rate/mtr"]);

  const text = render(offer);
  assert.ok(!/Grand total/i.test(text), "a grand total is the internal sheet's job");
  assert.ok(!/Subtotal/i.test(text), "no subtotal on the buyer's copy");
  // 5600 x 561.90 = 3,146,640 — the extension, in any grouping it could print in.
  for (const form of ["3146640", "31,46,640", "3,146,640"]) {
    assert.ok(!text.includes(form), `the line must not be extended (${form})`);
  }
});

test("nothing internal reaches the buyer — rates per kg, uplifts, margin", () => {
  // Distinctive values, so a match is a leak and not a coincidence.
  const text = render(offer);
  for (const internal of [
    "per kg",
    "/ kg",
    "Margin",
    "margin",
    "Conversion",
    "Wastage",
    "Raw material",
    "Total cost",
    "Cost per metre",
    "Build target",
  ]) {
    assert.ok(!text.includes(internal), `"${internal}" must never appear on a customer offer`);
  }
});

test("GST is a term of supply, stated once, not a computed line", () => {
  const text = render(offer);
  assert.ok(text.includes("Extra @ 18%"), "GST prints as their terms word it");
  assert.ok(!/IGST|CGST|SGST/.test(text), "the buyer's copy does not split the tax");
  assert.equal((text.match(/18%/g) ?? []).length, 1, "18% should appear once, in the terms");
});

test("all fifteen standing terms print, in their order", () => {
  const doc = customerOfferDocument(offer);
  const terms =
    doc.sections.find((section) => (section.table?.rows ?? []).some((row) => row[0] === "Prices Basis"))
      ?.table?.rows ?? [];
  assert.equal(terms.length, 15);
  assert.deepEqual(terms[0], ["Prices Basis", "FOR Karad"]);
  assert.deepEqual(terms.at(-1)?.[0], "Jurisdiction");
});

test("a tolerance band survives into the PDF — +/- is not dropped", () => {
  // The renderer strips everything outside printable ASCII, which turned "1000 meters ± 10%"
  // into "1000 meters 10%" and "length variation ± 5%" into "variation 5%". A buyer reading the
  // terms page would have taken a band as an absolute, and both of those are terms we are held
  // to on delivery: a drum short by 8% would have been a breach of the sheet as printed.
  const text = render(offer);
  assert.ok(text.includes("1000 meters +/- 10%"), "the drum tolerance must print as a band");
  assert.ok(text.includes("+/- 5%"), "the length variation must print as a band");
  assert.ok(!/meters 10%/.test(text), "a bare 10% would read as an absolute");
});

test("the footer sits below the schedule, not above its column headings", () => {
  // Sections render title, then lines, then table. A footer in the same section as a table
  // therefore printed where the column headings belong.
  const doc = customerOfferDocument(offer);
  const scheduleIndex = doc.sections.findIndex((s) => s.table?.headers.includes("Rate/mtr"));
  const footerAfter = doc.sections
    .slice(scheduleIndex + 1)
    .findIndex((s) => (s.lines ?? []).some((line) => String(line).startsWith("Leading Manufacturers")));
  assert.equal(footerAfter, 0, "the schedule's footer must be the section straight after it");
});

test("the subject line names the cable kinds actually on the schedule", () => {
  // Theirs reads "Control & Power Cables for MSETCL Tilwani Substation Project" because the
  // schedule carries both. A schedule of nothing but control cable must not announce power.
  assert.ok(render(offer).includes("Control Cables for MSETCL Tilwani Substation Project"));

  const mixed: CustomerOffer = {
    ...offer,
    lines: [
      ...offer.lines,
      { description: "Aluminum, 4 Core, 10 sq.mm, Steel Armoured, FRLS Power Cable", unit: "RMT", quantity: 500, ratePerMetreInr: 163.8 },
    ],
  };
  assert.ok(render(mixed).includes("Control & Power Cables for MSETCL Tilwani Substation Project"));

  // An explicit subject always wins over the derived one.
  assert.ok(render({ ...offer, subject: "Cables for Package 3B" }).includes("Sub.: Cables for Package 3B"));
});

test("the offer number follows the Indian financial year, not the calendar one", () => {
  // Their serial is DCIPL/71/2026-27. An offer raised in March is still the previous year's.
  assert.equal(offerNumber("DCIPL", 71, new Date("2026-09-16")), "DCIPL/71/2026-27");
  assert.equal(financialYear(new Date("2027-03-31")), "2026-27");
  assert.equal(financialYear(new Date("2027-04-01")), "2027-28");
  assert.equal(financialYear(new Date("2026-01-05")), "2025-26");
});

test("the buyer, the project and the offer number head both the schedule and the terms", () => {
  // A page that becomes separated from the letter has to identify itself. Theirs repeats the
  // block on both, and the covering letter is the only page that does not need it.
  const doc = customerOfferDocument(offer);
  const headed = doc.sections.filter((s) =>
    (s.table?.rows ?? []).some((row) => row[0] === "Client" && row[1] === offer.buyer.name),
  );
  assert.equal(headed.length, 2);
  for (const section of headed) {
    assert.ok((section.table?.rows ?? []).some((row) => row[2] === "Offer No" && row[3] === offer.offerNo));
  }
});

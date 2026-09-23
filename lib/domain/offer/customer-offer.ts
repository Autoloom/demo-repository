/**
 * The offer that goes to the buyer.
 *
 * ── Why this is a second document and not a flag on the first ─────────────────
 * `quote-pdf.ts` prints an internal costing sheet: a per-material rate in rupees per kilogram,
 * a cost per metre, a line total. Navya was explicit on 22 Sept that this is NOT what a customer
 * receives — the one they send carries a description, a quantity and a rate per running metre,
 * and nothing else. Handing a buyer the component breakdown tells them the metal content of the
 * cable and what we paid for it, which is the whole of the negotiation.
 *
 * So the two documents differ in kind, not in styling, and they are kept apart in code for the
 * same reason `field-visibility.test.ts` keeps margin off the GTP: the boundary has to be
 * somewhere a test can stand on.
 *
 * ── The shape is theirs ───────────────────────────────────────────────────────
 * Three parts, in the order their own covering letter announces them: the covering letter, the
 * priced schedule, the terms and conditions of supply. Transcribed from DCIPL/71/2026-27 to
 * Avadh Business Services, 16 Sept 2026.
 *
 * Two things that document does NOT do, and neither does this:
 *   • It does not extend the line. There is a quantity and a rate per metre, and no amount
 *     column, no line total and no grand total. That is a commercial choice — the buyer is being
 *     quoted a rate, not billed — and adding the arithmetic would change the offer.
 *   • It does not compute the tax. GST appears once, in the terms, as "Extra @ 18%".
 */
import type { PdfDocument, PdfSection } from "../pdf";
import type { Letterhead } from "./letterhead";
import type { CableSpec } from "@/lib/services/types";

/** One priced row on the schedule. */
export interface OfferLine {
  /** As the buyer reads it, e.g. "Cu, 12 Core, 2.5 sq.mm, Steel Armoured, FRLS Control Cable". */
  description: string;
  /** Running metres — RMT on their sheet. */
  unit: string;
  quantity: number;
  /** Rate per metre, to the paisa. Their own rates run to 561.90, not 562. */
  ratePerMetreInr: number;
}

export interface OfferBuyer {
  name: string;
  /** Postal address, one line per line printed. */
  addressLines: string[];
  /** "Kind Attn" — the person the offer is addressed to. */
  attentionName?: string;
  attentionPhone?: string;
}

export interface CustomerOffer {
  letterhead: Letterhead;
  offerNo: string;
  /** ISO date. Printed dd/mm/yyyy in the letter and dd-mm-yyyy in the schedule, as theirs is. */
  date: string;
  buyer: OfferBuyer;
  /** The job, e.g. "MSETCL Tilwani Substation Project". Names the END client, not the buyer. */
  projectName: string;
  /** Subject line. Defaulted from the project and the cable kinds when nobody writes one. */
  subject?: string;
  lines: OfferLine[];
}

/**
 * The cable, in the words a buyer's schedule uses.
 *
 * Their descriptions read "Cu, 12 Core, 2.5 sq.mm, Steel Armoured, FRLS Control Cable" — the
 * conductor metal abbreviated, the armour named by its material rather than its standard code,
 * and the flame class stated before the family. Our own vocabulary ("GI strip (GSS)",
 * "Control Cable", "Aluminium") is correct and is what the GTP prints; it is not what a
 * purchase officer matches against their enquiry. Both are right for their own document.
 */
export function offerDescription(spec: CableSpec): string {
  const metal = spec.conductorMaterial === "Copper" ? "Cu" : "Aluminum";
  const cores = spec.cores.replace(/C$/, "");
  const armour =
    spec.armour === "Unarmoured"
      ? "Unarmoured"
      : spec.armour.startsWith("Aluminium")
        ? "Aluminium Armoured"
        : "Steel Armoured";
  const flame = spec.flameClass === "Standard" ? undefined : spec.flameClass;
  const kind =
    spec.family === "Control Cable"
      ? "Control Cable"
      : spec.family === "Aerial Bunched Cable"
        ? "Aerial Bunched Cable"
        : spec.family === "Solar DC Cable"
          ? "Solar DC Cable"
          : "Power Cable";

  // An aerial bunched cable is not one size. Its designation — "3Cx70 + 1Cx50 + 1Cx16" — names
  // the phases, the messenger and the street-light core, and "3 Core, 70 sq.mm" describes only
  // the phases, quoting a bundle as though two of its conductors were not in it.
  const size =
    spec.family === "Aerial Bunched Cable" ? spec.designation : `${cores} Core, ${spec.conductorSizeSqMm} sq.mm`;

  return [metal, size, armour, [flame, kind].filter(Boolean).join(" ")].join(", ");
}

/** dd/mm/yyyy — the format on their covering letter. */
function dmy(iso: string, separator = "/"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [pad(date.getDate()), pad(date.getMonth() + 1), date.getFullYear()].join(separator);
}

/** Their rates print to two decimals: 120.00, 561.90, 744.60. */
function rate(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Subject line, from the project, when nobody has written one.
 *
 * Theirs reads "Control & Power Cables for MSETCL Tilwani Substation Project" — the kinds of
 * cable on the schedule, then the job. Derived rather than templated so a schedule of nothing
 * but control cable does not announce power cables it does not contain.
 */
function defaultSubject(offer: CustomerOffer): string {
  const kinds = new Set<string>();
  for (const line of offer.lines) {
    if (/Control Cable/i.test(line.description)) kinds.add("Control");
    else if (/Aerial Bunched/i.test(line.description)) kinds.add("Aerial Bunched");
    else if (/Solar/i.test(line.description)) kinds.add("Solar");
    else kinds.add("Power");
  }
  const list = [...kinds];
  const joined =
    list.length <= 1 ? (list[0] ?? "Cables") : `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
  return `${joined} Cables for ${offer.projectName}`;
}

/** The header block repeated above the schedule and the terms: client, project, offer no, date. */
function headerTable(offer: CustomerOffer) {
  return {
    headers: ["", "", "", ""],
    widths: [58, 217, 58, 178],
    rows: [
      ["Client", offer.buyer.name, "Offer No", offer.offerNo],
      ["Project", offer.projectName, "Date", dmy(offer.date, "-")],
    ],
  };
}

/**
 * The footer their every page carries — as its own section.
 *
 * A section renders title, then lines, then table. Putting the footer in the same section as a
 * table therefore printed it ABOVE the table: the schedule's footer landed where its column
 * headings should be. Sections are cheap; pages are what matter here.
 */
function footerSection(letterhead: Letterhead): PdfSection {
  return { lines: ["", ...letterhead.footerLines] };
}

/** The signature block, above the footer on the letter and the terms page. */
function signatureSection(letterhead: Letterhead): PdfSection {
  return {
    lines: ["", `For ${letterhead.companyName}`, "", "", letterhead.signatoryName, letterhead.signatoryPhone],
  };
}

export function customerOfferDocument(offer: CustomerOffer): PdfDocument {
  const { letterhead } = offer;

  return {
    title: letterhead.companyName,
    subtitle: letterhead.addressLines.join(" "),
    meta: [`Tel: ${letterhead.phone}`, `E-mail: ${letterhead.emails.join("  |  ")}`],
    sections: [
      // ── 1. Covering letter ───────────────────────────────────────────────────
      {
        // Offer number left, date right, on one line — as theirs is. A table rather than padded
        // text because `wrapText` normalises runs of spaces to one, so alignment by padding
        // collapses to a single space in the rendered stream.
        table: {
          headers: ["", ""],
          widths: [300, 211],
          rows: [[offer.offerNo, `Date - ${dmy(offer.date)}`]],
        },
      },
      {
        lines: [
          "",
          "To,",
          offer.buyer.name,
          ...offer.buyer.addressLines,
          "",
          ...(offer.buyer.attentionName
            ? [
                `Kind Attn: - ${offer.buyer.attentionName}`,
                ...(offer.buyer.attentionPhone ? [`Contact No - ${offer.buyer.attentionPhone}`] : []),
                "",
              ]
            : []),
          `Sub.: ${offer.subject?.trim() || defaultSubject(offer)}`,
          "",
          "Dear Sir,",
          "",
          "With reference to your subject enquiry, we are pleased to give our offer as per following annexure:",
          "",
          "     1) This Covering Letter",
          "     2) Price Schedule",
          "     3) Terms & Conditions of Supply",
          "",
          "We hope that the above is in line with your requirements.",
          "",
          "Thanking you.",
        ],
      },
      signatureSection(letterhead),
      footerSection(letterhead),
      // ── 2. Priced schedule ───────────────────────────────────────────────────
      { pageBreak: true, table: headerTable(offer) },
      { title: "Priced Schedule" },
      {
        table: {
          headers: ["S.No.", "Description", "Unit", "Quantity", "Rate/mtr"],
          widths: [40, 266, 45, 70, 90],
          rows: offer.lines.map((line, index) => [
            `${index + 1}.`,
            line.description,
            line.unit,
            String(line.quantity),
            rate(line.ratePerMetreInr),
          ]),
        },
      },
      // No amount column and no total, exactly as their schedule prints. See the note at the
      // head of this file — the buyer is being quoted a rate, not billed.
      footerSection(letterhead),
      // ── 3. Terms & conditions of supply ──────────────────────────────────────
      { pageBreak: true, table: headerTable(offer) },
      { title: "Terms & Conditions of Supply" },
      {
        table: {
          headers: ["", ""],
          widths: [180, 331],
          rows: letterhead.terms.map((term) => [term.label, term.value]),
        },
      },
      signatureSection(letterhead),
      footerSection(letterhead),
    ],
  };
}

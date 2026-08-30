/**
 * Render a derived GTP into a printable document (PRD P0-7).
 *
 * Groups the flat field map into the sections buyer schedules use (DHBVN Appendix-I ordering:
 * maker → phase conductor → messenger → insulation → finished cable → drum → compliance), because
 * engineers approve documents that look like what they always approve.
 *
 * Deterministic: same fields in, same document out. Pure — no DOM, no service calls, so it can be
 * unit-tested and later reused server-side.
 */
import type { PdfDocument } from "@/lib/domain/pdf";

import { TOLERANCE_NA } from "./types";
import type { ResolvedField } from "./types";

/** Section order and which field-key prefixes belong to each. */
const SECTION_PLAN: { title: string; match: (key: string) => boolean }[] = [
  { title: "Manufacturer", match: (k) => k.startsWith("mfr.") },
  { title: "Cable", match: (k) => k.startsWith("cable.") },
  { title: "Phase conductor", match: (k) => k.startsWith("power.") },
  { title: "Messenger (neutral conductor)", match: (k) => k.startsWith("messenger.") },
  { title: "Street-light conductor", match: (k) => k.startsWith("streetLight.") },
  { title: "Finished cable", match: (k) => k.startsWith("fin.") },
  { title: "Drum", match: (k) => k.startsWith("drum.") },
  { title: "Marking", match: (k) => k.startsWith("mark.") },
  { title: "Compliance", match: (k) => k.startsWith("cert.") },
];

export interface GtpPdfMeta {
  gtpId: string;
  version: number;
  status: string;
  customerName: string;
  state: string;
  designation: string;
  standardsPin?: { standardId: string; edition: string }[];
  /** Stamps already recorded. Roles without one print as blank signature lines. */
  signOffs?: { role: string; name: string; stampedAt: string }[];
  /** Order-specific quantities (DHBVN Appendix-I items 8/9: standard length, length per drum). */
  orderQuantities?: { totalLengthM: number; drumLengthM: number; drumCount: number };
  /** Buyer's PO / tender reference. */
  poReference?: string;
}

/** The two stamps a GTP needs before production can start. */
const REQUIRED_STAMPS = ["Divisional Engineer", "Assistant Engineer"] as const;

/**
 * Shared table geometry — one definition for every table in the document.
 *
 * These are a pair on purpose. `pdf.ts` indexes `widths` by column, so headers and widths that
 * disagree used to produce a malformed content stream rather than a visible error. They are also
 * duplicated across three call sites below, which is exactly how they would drift. Defining them
 * once means adding a column is one edit, and a test asserts the lengths match and sum to 514.
 */
const TABLE_HEADERS = ["Particular", "Value", "Tolerance"];
/** Sums to 514, the width every table in this repo uses (page 595 − 2 × 42 margin, plus gutter). */
const TABLE_WIDTHS = [248, 176, 90];

/**
 * One printed row.
 *
 * The tolerance cell is never blank: a parameter with no meaningful tolerance prints "N/A", so a
 * reader can tell "this was considered and does not apply" from "this was left unfilled". The
 * `?? TOLERANCE_NA` fallback should be unreachable — engines guarantee a tolerance on every
 * field — but a stored record predating the column would otherwise print an empty cell.
 *
 * Only `tolerance.value` is read. The reason an operator gave for changing a tolerance lives in
 * `tolerance.override.reason` and must never print (build-plan-v2 D10).
 */
function toRow(f: ResolvedField): string[] {
  return [f.label, String(f.value), f.tolerance?.value ?? TOLERANCE_NA];
}

/**
 * Build the printable document.
 *
 * The tables print particular + value only. Two things are deliberately withheld from the
 * customer-facing document:
 *   • the internal tag (LOOKUP/CALC/QUIRK/FIXED) — working-out for the operator, not something
 *     a discom's schedule asks for;
 *   • internal override reasons (build-plan-v2 D10) — operational context that must never be
 *     disclosed to the buyer. Both stay fully visible inside the app.
 */
export function buildGtpPdfDocument(fields: ResolvedField[], meta: GtpPdfMeta): PdfDocument {
  const used = new Set<string>();

  const sections: PdfDocument["sections"] = SECTION_PLAN.map(({ title, match }) => {
    const rows = fields
      .filter((f) => match(f.key))
      .map((f) => {
        used.add(f.key);
        return toRow(f);
      });
    return rows.length > 0
      ? { title, table: { headers: TABLE_HEADERS, widths: TABLE_WIDTHS, rows } }
      : null;
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  // Anything the plan didn't claim still has to appear — a buyer schedule rejects blank cells,
  // and silently dropping a derived field would be worse than an ugly heading.
  const leftovers = fields.filter((f) => !used.has(f.key));
  if (leftovers.length > 0) {
    sections.push({
      title: "Other particulars",
      table: {
        headers: TABLE_HEADERS,
        widths: TABLE_WIDTHS,
        // SECTION_PLAN carries no `lt.` or `solar.` prefix, so every field of those two cable
        // types lands here. This table is the tolerance column's main home, not an edge case.
        rows: leftovers.map(toRow),
      },
    });
  }

  // Order quantities (Appendix-I 8/9). Kept separate from the construction sections because they
  // describe this order, not the cable — the same cable ships in different quantities.
  if (meta.orderQuantities) {
    const q = meta.orderQuantities;
    const remainder = q.drumLengthM > 0 ? q.totalLengthM % q.drumLengthM : 0;
    sections.push({
      title: "Quantity & drums",
      table: {
        headers: TABLE_HEADERS,
        widths: TABLE_WIDTHS,
        // Padded to three cells explicitly, and N/A rather than blank — the same mandatory-entry
        // rule the field rows follow. These quantities describe the ORDER, so no tolerance
        // applies here; the cable's own drum-length band is on the `drum.length` field in the
        // Drum section.
        rows: [
          ["Total length ordered", `${q.totalLengthM} m`, TOLERANCE_NA],
          ["Standard length per drum", `${q.drumLengthM} m`, TOLERANCE_NA],
          [
            "Number of drums",
            remainder > 0 ? `${q.drumCount} (last drum ${remainder} m)` : `${q.drumCount}`,
            TOLERANCE_NA,
          ],
        ],
      },
    });
  }

  // Sign-off block. This is the point of the document — it exists to be stamped — so unsigned
  // roles print as blank ruled lines for a wet signature rather than being omitted.
  sections.push({
    title: "Sign-off",
    lines: REQUIRED_STAMPS.flatMap((role) => {
      const stamp = meta.signOffs?.find((s) => s.role === role);
      return stamp
        ? [`${role}: ${stamp.name} — stamped ${stamp.stampedAt.slice(0, 10)}`, ""]
        : [`${role}: ______________________________`, "Name / signature / date / office stamp", ""];
    }),
  });

  // Standards provenance — which editions this document was derived from. This belongs on the
  // customer-facing GTP: it tells the approving engineer what the values were computed against.
  //
  // ⚠️ INTERNAL NOTES ARE DELIBERATELY EXCLUDED (build-plan-v2 D10). An earlier version of this
  // function printed every override with its reason, on the theory that showing the working made
  // the document trustworthy. That is wrong for a *customer-facing* document: override reasons
  // are internal operational context ("customer asked verbally", "matching their last order") and
  // disclosing them to the buyer exposes our reasoning. Overrides remain fully visible inside the
  // app and on the stored record; they never reach the PDF. Guarded by a regression test.
  if (meta.standardsPin?.length) {
    sections.push({
      title: "Standards",
      lines: [
        `Derived from: ${meta.standardsPin.map((p) => `${p.standardId}:${p.edition}`).join(" · ")}`,
      ],
    });
  }

  return {
    title: `Guaranteed Technical Particulars — ${meta.customerName}`,
    subtitle: meta.designation,
    meta: [
      ...(meta.poReference ? [`Order / PO: ${meta.poReference}`] : []),
      `GTP: ${meta.gtpId} v${meta.version}`,
      `Status: ${meta.status}`,
      `Destination state: ${meta.state}`,
    ],
    sections,
  };
}

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
}

/** The two stamps a GTP needs before production can start. */
const REQUIRED_STAMPS = ["Divisional Engineer", "Assistant Engineer"] as const;

/**
 * Build the printable document.
 *
 * The tables print particular + value only — the internal tag (LOOKUP/CALC/QUIRK/FIXED) is
 * working-out for the operator, not something a discom's schedule asks for. Provenance still
 * reaches the reader via the derivation record at the end, which names the standards pin and
 * every override with its reason.
 */
export function buildGtpPdfDocument(fields: ResolvedField[], meta: GtpPdfMeta): PdfDocument {
  const used = new Set<string>();

  const sections: PdfDocument["sections"] = SECTION_PLAN.map(({ title, match }) => {
    const rows = fields
      .filter((f) => match(f.key))
      .map((f) => {
        used.add(f.key);
        return [f.label, String(f.value)];
      });
    return rows.length > 0
      ? { title, table: { headers: ["Particular", "Value"], widths: [260, 254], rows } }
      : null;
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  // Anything the plan didn't claim still has to appear — a buyer schedule rejects blank cells,
  // and silently dropping a derived field would be worse than an ugly heading.
  const leftovers = fields.filter((f) => !used.has(f.key));
  if (leftovers.length > 0) {
    sections.push({
      title: "Other particulars",
      table: {
        headers: ["Particular", "Value"],
        widths: [260, 254],
        rows: leftovers.map((f) => [f.label, String(f.value)]),
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

  // The provenance appendix is what makes the document trustworthy rather than a black box.
  sections.push({
    title: "Derivation record",
    lines: [
      ...(meta.standardsPin?.length
        ? [`Standards: ${meta.standardsPin.map((p) => `${p.standardId}:${p.edition}`).join(" · ")}`]
        : []),
      ...fields
        .filter((f) => f.override)
        .map((f) => `OVERRIDE — ${f.label}: "${f.override!.previous}" → "${f.value}". Reason: ${f.override!.reason}`),
      ...(fields.some((f) => f.override) ? [] : ["No manual overrides — every value derived from the standards above."]),
    ],
  });

  return {
    title: `Guaranteed Technical Particulars — ${meta.customerName}`,
    subtitle: meta.designation,
    meta: [
      `GTP: ${meta.gtpId} v${meta.version}`,
      `Status: ${meta.status}`,
      `Destination state: ${meta.state}`,
    ],
    sections,
  };
}

/**
 * Product-line registry — what the GTP engine can build today, and what it can't yet.
 *
 * One source of truth so the UI can never claim support the data doesn't back. A line becomes
 * `available` only when its IS tables are encoded AND a golden file proves the engine reproduces
 * a real approved GTP for it — the same bar AB cable had to clear.
 *
 * Adding a line is meant to be a DATA task (corpus plan §1): encode its standards modules, add a
 * role handler in derive.ts, flip `status` here. The engine's cascade, provenance, validation,
 * templates and UI are already line-agnostic.
 */
import type { ProductLine } from "./types";

export type ProductLineStatus = "available" | "planned";

export interface ProductLineInfo {
  id: ProductLine;
  name: string;
  /** Plain-language description for the picker — no jargon. */
  description: string;
  status: ProductLineStatus;
  /** The standards a GTP for this line is derived from. */
  standards: string[];
  /** For planned lines: what specifically is still missing, so the gap is honest and actionable. */
  blockedBy?: string;
}

export const PRODUCT_LINES: ProductLineInfo[] = [
  {
    id: "AB_CABLE",
    name: "Aerial Bunched (AB) cable",
    description: "Insulated cores twisted around a messenger wire, strung between poles. LT, XLPE.",
    status: "available",
    standards: ["IS 14255:1995", "IS 8130:2013", "IS 398 Pt-4", "IS 10418:1982"],
  },
  {
    id: "XLPE_POWER",
    name: "LT XLPE power cable",
    description: "Armoured underground power cable, e.g. 3.5C x 300 sq mm A2XFY.",
    status: "planned",
    standards: ["IS 7098-1:1988", "IS 8130"],
    blockedBy:
      "IS 7098-1 tables aren't encoded yet. We hold the standard and one filled golden file " +
      "(AVOCAB 3.5Cx300), so this is a data-entry task rather than new engine work.",
  },
  {
    id: "PVC_CONTROL",
    name: "PVC control cable",
    description: "Multi-core control cable, copper conductors, PVC insulated.",
    status: "planned",
    standards: ["IS 1554-1:1988", "IS 5831:1984", "IS 8130"],
    blockedBy:
      "IS 1554-1 and IS 5831 tables aren't encoded yet, and we don't hold an approved control-cable " +
      "GTP to test against.",
  },
];

export function findProductLine(id: ProductLine): ProductLineInfo | undefined {
  return PRODUCT_LINES.find((line) => line.id === id);
}

/** Lines a GTP can actually be built for today. */
export function availableProductLines(): ProductLineInfo[] {
  return PRODUCT_LINES.filter((line) => line.status === "available");
}

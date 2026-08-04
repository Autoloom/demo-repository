/**
 * Cable builder output documents — interfaces only for the two we can't yet build.
 *
 * The builder is meant to emit three documents. Only ONE has a confirmed real
 * template, so only one is implemented:
 *
 *   1. GTP     → IMPLEMENTED. buildGtpSections() in lib/domain/gtp-document.ts,
 *                modelled on a genuine approved WBSEDCL/RDSS GTP.
 *   2. Sticker → STUB. No sample obtained. Drum-marking content is known from GTP
 *                item 17, but the sticker's own layout, size, and mandatory fields
 *                are not.
 *   3. "Quote" → STUB, and the name itself is unconfirmed — the third output is
 *                *assumed* to be a quote. Do not build quote logic against that guess.
 *
 * This mirrors the `parse_gtp_pdf` convention already agreed for the MCP server:
 * define the interface so callers can be written and reviewed, but throw rather than
 * return invented output. A stub that returns plausible-looking data is worse than no
 * stub at all — it gets demoed, believed, and shipped.
 */

import type { GtpDocument } from "@/lib/domain/gtp-document";

// ─────────────────────────────────────────────────────────────────────────────
// 2. Drum sticker
// ─────────────────────────────────────────────────────────────────────────────

export interface StickerInput {
  gtp: GtpDocument;
  drumNo: string;
  actualLengthM: number;
  grossWeightKg: number;
  netWeightKg: number;
  yearOfManufacture: number;
}

export interface StickerDocument {
  drumNo: string;
  lines: { label: string; value: string }[];
  /** Physical label size, once a real sticker has been measured. */
  widthMm: number;
  heightMm: number;
}

export class NotImplementedError extends Error {
  constructor(what: string, blockedOn: string) {
    super(`${what} is not implemented — blocked on: ${blockedOn}`);
    this.name = "NotImplementedError";
  }
}

/**
 * Build the drum sticker.
 *
 * BLOCKED ON: a photograph or print file of a real Navya drum sticker. GTP item 17
 * lists the drum-marking *content* (manufacturer, TKC name & PKG no., trade mark,
 * drum no, size, voltage grade, length, gross/net weight, ISI mark, RDSS/WBSEDCL,
 * golden-brown flange) but says nothing about label dimensions, layout, barcode, or
 * which fields are pre-printed vs per-drum. Guessing those produces a sticker the
 * factory can't actually use.
 */
export function buildSticker(input: StickerInput): StickerDocument {
  throw new NotImplementedError(
    `Drum sticker generation (drum ${input.drumNo}, ${input.gtp.spec.size})`,
    "a real sticker sample (dimensions + layout + which fields are per-drum). Content list is known from GTP item 17; the label itself is not.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Third output document (assumed to be a quote — UNCONFIRMED)
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerQuoteInput {
  gtp: GtpDocument;
  customerId: string;
  lengthM: number;
  marginPct: number;
}

export interface CustomerQuoteDocument {
  reference: string;
  lines: { description: string; lengthM: number; ratePerM: number; amountInr: number }[];
  subtotalInr: number;
  gstInr: number;
  totalInr: number;
  validUntil: string;
}

/**
 * Build the customer-facing quote document.
 *
 * BLOCKED ON: confirmation that the third output is a quote at all. It may be an MQP
 * (Manufacturing Quality Plan — GTP item 20 requires one alongside the GTP), a test
 * certificate, or a packing list. All three are named in the source document as
 * required deliverables, and any of them is at least as likely as a quote.
 *
 * Note the costing engine (computeAbcLine / computeLine) already produces the numbers
 * a quote would need — so this stub is about the DOCUMENT, not the arithmetic.
 */
export function buildCustomerQuote(input: CustomerQuoteInput): CustomerQuoteDocument {
  throw new NotImplementedError(
    `Third output document generation (customer ${input.customerId}, ${input.lengthM} m)`,
    "confirming what the third document actually is. 'Quote' is an assumption; MQP, test certificate, and packing list are all named as required deliverables in the source GTP.",
  );
}

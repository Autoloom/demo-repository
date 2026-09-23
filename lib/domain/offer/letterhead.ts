/**
 * The works' own identity on a customer-facing offer — letterhead, signatory, offer numbering
 * and the standing terms of supply.
 *
 * ── Why this is data and not a constant ───────────────────────────────────────
 * Everything here is transcribed from the offer Navya actually sends (DCIPL/71/2026-27 to
 * Avadh Business Services, 16 Sept 2026) rather than invented, because the customer document is
 * the one place the app has no licence to improvise: a buyer compares this against the last
 * offer they were sent, and a tagline or a payment term that has quietly changed reads as a
 * different company. But it is also the part most likely to need changing without a developer —
 * a new phone number, a different signatory, a validity of 7 days rather than 5 — so the
 * defaults are seeded and then owned by whoever is sending the offer.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────────
 * No GSTIN, PAN, bank details or HSN. The real offer carries none of them, and a costing sheet
 * is not the place to start publishing tax identifiers the works has not asked us to print.
 * Same posture as the GTP: state what the source document states.
 *
 * Persistence is localStorage, the same posture as GTP templates. The shape is the contract;
 * moving it behind the service layer later touches only load/save here.
 */

import { downloadPdf, type PdfColor, type PdfDocument, type PdfImage, type PdfLetterhead } from "../pdf";
import { DEFAULT_LOGO_DATA_URL } from "./default-logo";

/** One line of the standing terms table. Free text on both sides — these are commercial words. */
export interface OfferTerm {
  label: string;
  value: string;
}

export interface Letterhead {
  /** Legal name, as it appears at the head of the sheet and above the signature. */
  companyName: string;
  /** Postal address, one line per line printed. */
  addressLines: string[];
  phone: string;
  emails: string[];
  /**
   * The footer that repeats on every page of their offers. It is a product list, not a slogan,
   * and buyers read it — it is how a control-cable enquiry turns into an ACSR enquiry.
   */
  footerLines: string[];
  signatoryName: string;
  signatoryPhone: string;
  /**
   * Offer number prefix. Their serial is `DCIPL/71/2026-27` — house prefix, a running number,
   * and the Indian financial year. The year is computed; only the prefix is a preference.
   */
  offerPrefix: string;
  /** Standing terms of supply, in the order they print. */
  terms: OfferTerm[];
  /**
   * The logo, as a JPEG data URL. Absent or empty means no logo — the letterhead still prints
   * the name, which is how a works without one would send it.
   *
   * JPEG because that is what the PDF writer embeds; an uploaded PNG is flattened onto white on
   * the way in (see `imageFileToJpegDataUrl`), since a JPEG has no transparency.
   */
  logoDataUrl?: string;
  /** The company name's colour on the letterhead, as #rrggbb. */
  nameColor?: string;
  /** The footer's colour, as #rrggbb. */
  footerColor?: string;
}

/**
 * Seeded from the Avadh offer. Every string here appears on that document.
 *
 * The terms are its fifteen rows in its order. Two carry a number the quote itself knows better
 * — GST and the drum length — and are still stated here, because on their sheet they are terms
 * of supply rather than computed figures, and a buyer expects to read them in the terms table.
 */
export const DEFAULT_LETTERHEAD: Letterhead = {
  companyName: "Daksha Cable Industries Pvt Ltd.",
  addressLines: [
    "143-A, Government Industrial Estate, Charkop,",
    "Kandivali (West), Mumbai - 400 067.",
  ],
  phone: "+022 - 20898677",
  emails: ["navyacables123@gmail.com", "dakshacables@yahoo.com"],
  footerLines: [
    "Leading Manufacturers of ACSR & AAC Conductors, LT Aerial Bunched Cables,",
    "Service Cable, XLPE/PVC Control & Power Armoured / Unarmoured Cables",
  ],
  logoDataUrl: DEFAULT_LOGO_DATA_URL,
  // Sampled from their own offer: the orange of the name and the navy of the footer.
  nameColor: "#EC7C30",
  footerColor: "#1F4E79",
  signatoryName: "Laxmikant Shete",
  signatoryPhone: "9619918554",
  offerPrefix: "DCIPL",
  terms: [
    { label: "Prices Basis", value: "FOR Karad" },
    { label: "Prices Type", value: "FIRM Valid for 5 days" },
    { label: "GST", value: "Extra @ 18%" },
    { label: "Delivery Period", value: "As per your requirement with lead time of 2 weeks" },
    { label: "Cable Drum/Packing details", value: "1000 meters ± 10%" },
    {
      label: "Any Other taxes & Levies",
      value:
        "Any increase in Government Duties or Levies of Any New Taxes or Duties shall will be borne by you.",
    },
    { label: "Payment Terms", value: "Advance 25% and balance against Performa Invoice" },
    { label: "Packing & Forwarding", value: "Nil" },
    { label: "Freight", value: "Nil" },
    { label: "Insurance", value: "To your account" },
    { label: "Contractual Delivery Date", value: "As per your Requirement." },
    {
      label: "Warranty",
      value:
        "18 Months from the date of dispatch or 12 months from the date of installation, whichever is earlier.",
    },
    {
      label: "Quantity Variation",
      value: "Cable shall be supplied as per normal delivery with length variation ± 5% for the entire order.",
    },
    {
      label: "Force Majeure",
      value:
        "In the event either party is unable to perform its obligations under the terms of this Agreement " +
        "because of acts of God, Strikes, death, accidents, riots, lockouts, Lockdowns done by government, " +
        "we shall not be liable for any damages resulting from such failure to perform or otherwise from such causes.",
    },
    { label: "Jurisdiction", value: "Subject to “Mumbai” Jurisdiction" },
  ],
};

const STORAGE_KEY = "cableos2:v1:offer-letterhead";
const SERIAL_KEY = "cableos2:v1:offer-serial";

/**
 * The Indian financial year an offer falls in, as their serial prints it: April to March.
 *
 * An offer raised on 16 September 2026 is "2026-27"; the same offer raised on 3 March 2027 is
 * still "2026-27". Getting this wrong restarts the numbering three weeks early and files the
 * offer under a year the accounts do not have.
 */
export function financialYear(date: Date): string {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** `DCIPL/71/2026-27` — prefix, running number, financial year. */
export function offerNumber(prefix: string, serial: number, date: Date): string {
  return `${prefix}/${serial}/${financialYear(date)}`;
}

/** Never throws — a corrupt or absent store yields the seeded letterhead. */
export function loadLetterhead(): Letterhead {
  if (typeof window === "undefined") return DEFAULT_LETTERHEAD;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LETTERHEAD;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_LETTERHEAD;
    // Merged rather than replaced, so a letterhead saved before a field existed still prints it.
    return { ...DEFAULT_LETTERHEAD, ...(parsed as Partial<Letterhead>) };
  } catch {
    return DEFAULT_LETTERHEAD;
  }
}

/**
 * Returns false when the browser refused to store it — usually a logo too large for its storage
 * quota. The caller says so, because "Saved" followed by the old letterhead on the next offer
 * is exactly the silent failure a branding setting cannot have.
 */
export function saveLetterhead(letterhead: Letterhead): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(letterhead));
    return true;
  } catch {
    return false;
  }
}

/**
 * The serial the NEXT offer would take, without consuming it.
 *
 * Separate from `consumeOfferSerial` on purpose: the number has to be visible on screen while
 * someone is still deciding whether to send the offer, and a preview must not burn a number.
 * Gaps in a numbered series are the thing accounts notice.
 */
export function peekOfferSerial(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(SERIAL_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

/** Take the next serial and advance the counter. Called when an offer is actually issued. */
export function consumeOfferSerial(): number {
  const serial = peekOfferSerial();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SERIAL_KEY, String(serial + 1));
    } catch {
      // Same as above: this offer is still correctly numbered, the next one repeats it.
    }
  }
  return serial;
}

/** Set the counter, for a works already mid-series — theirs stood at 71 in September 2026. */
export function setNextOfferSerial(serial: number): void {
  if (typeof window === "undefined" || !Number.isFinite(serial) || serial < 1) return;
  try {
    window.localStorage.setItem(SERIAL_KEY, String(Math.floor(serial)));
  } catch {
    // Non-fatal; the counter simply stays where it was.
  }
}

/** "#EC7C30" → [0.93, 0.49, 0.19]. Anything unparseable falls back to black. */
export function hexToPdfColor(hex: string | undefined): PdfColor | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? "");
  if (!match) return undefined;
  const n = parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Pixel size of a JPEG, read from its start-of-frame marker.
 *
 * The PDF image dictionary has to state width and height, and they have to be the JPEG's own —
 * a viewer that is told the wrong size draws a sheared stripe instead of a logo. Returns null
 * for anything that is not a baseline or progressive JPEG, so a bad upload prints no logo rather
 * than a broken file.
 */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 carry the frame size; C4, C8, CC do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

/** The logo as the PDF writer takes it, or undefined when there is none or it will not decode. */
export function logoImage(dataUrl: string | undefined): PdfImage | undefined {
  const match = /^data:image\/jpe?g;base64,(.+)$/i.exec(dataUrl ?? "");
  if (!match) return undefined;
  try {
    const jpeg = base64ToBytes(match[1]);
    const size = jpegSize(jpeg);
    return size ? { jpeg, ...size } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The letterhead as drawn at the head and foot of every page of every exported document —
 * customer offer, costing sheet and GTP alike, so that everything the works sends looks like it
 * came from the same place.
 */
export function pdfLetterhead(letterhead: Letterhead): PdfLetterhead {
  return {
    name: letterhead.companyName,
    nameColor: hexToPdfColor(letterhead.nameColor),
    lines: [
      letterhead.addressLines.filter(Boolean).join(" "),
      [letterhead.phone && `Tel: ${letterhead.phone}`, letterhead.emails.filter(Boolean).length ? `E-mail: ${letterhead.emails.filter(Boolean).join(" | ")}` : ""]
        .filter(Boolean)
        .join("   "),
    ].filter(Boolean),
    footerLines: letterhead.footerLines.filter(Boolean),
    footerColor: hexToPdfColor(letterhead.footerColor),
    logo: logoImage(letterhead.logoDataUrl),
  };
}

/**
 * Download any document on the works' saved letterhead.
 *
 * Used by every export except the customer offer, which passes the letterhead being edited on
 * screen. One helper so the GTP, the costing sheet and the offer cannot drift into three
 * different looks — the thing the client asked for on 23 Sept was that everything leaving the
 * works fits the same format.
 */
export function downloadOnLetterhead(filename: string, doc: PdfDocument): void {
  downloadPdf(filename, { ...doc, letterhead: pdfLetterhead(loadLetterhead()) });
}

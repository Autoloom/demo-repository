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

export function saveLetterhead(letterhead: Letterhead): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(letterhead));
  } catch {
    // Storage full or blocked. The caller's in-memory copy still prints this offer correctly.
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

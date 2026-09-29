/**
 * Adding a customer from the quote page.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────
 * A quote built from the GTP generator had no customer and no way to choose one. It was saved
 * against a placeholder id, which meant three separate things were wrong at once:
 *   • the customer's offer was addressed "To, Customer pending";
 *   • the order made from it had nobody to be delivered to on the board;
 *   • `computeGst` treats "no customer" as "another state", so every such quote was taxed as
 *     IGST even when the buyer was in Maharashtra and should have been CGST + SGST.
 *
 * ── What it asks for, and why only that ────────────────────────────────────────
 * The `Customer` record has a dozen fields, most of them for the parts of the product that were
 * removed from this build (credit limits, CRM ids). A works entering a new buyer to send an
 * offer knows a name, a person, a phone number and where they are — so that is what is asked,
 * and the rest is left at neutral, visibly-empty values rather than invented ones.
 */
import type { Customer } from "../services/types";

/**
 * GST state and union-territory codes, as printed on a GSTIN's first two digits.
 *
 * The code is what decides intra- versus inter-state tax, so it is derived from the state the
 * person picks rather than typed. 25 is absent on purpose: Daman & Diu merged into Dadra & Nagar
 * Haveli in 2020 and the merged territory uses 26.
 */
export const GST_STATES: readonly { name: string; code: string }[] = [
  { name: "Jammu & Kashmir", code: "01" },
  { name: "Himachal Pradesh", code: "02" },
  { name: "Punjab", code: "03" },
  { name: "Chandigarh", code: "04" },
  { name: "Uttarakhand", code: "05" },
  { name: "Haryana", code: "06" },
  { name: "Delhi", code: "07" },
  { name: "Rajasthan", code: "08" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Bihar", code: "10" },
  { name: "Sikkim", code: "11" },
  { name: "Arunachal Pradesh", code: "12" },
  { name: "Nagaland", code: "13" },
  { name: "Manipur", code: "14" },
  { name: "Mizoram", code: "15" },
  { name: "Tripura", code: "16" },
  { name: "Meghalaya", code: "17" },
  { name: "Assam", code: "18" },
  { name: "West Bengal", code: "19" },
  { name: "Jharkhand", code: "20" },
  { name: "Odisha", code: "21" },
  { name: "Chhattisgarh", code: "22" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Gujarat", code: "24" },
  { name: "Dadra & Nagar Haveli and Daman & Diu", code: "26" },
  { name: "Maharashtra", code: "27" },
  { name: "Karnataka", code: "29" },
  { name: "Goa", code: "30" },
  { name: "Lakshadweep", code: "31" },
  { name: "Kerala", code: "32" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Puducherry", code: "34" },
  { name: "Andaman & Nicobar Islands", code: "35" },
  { name: "Telangana", code: "36" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Ladakh", code: "38" },
];

export const CUSTOMER_SEGMENTS: readonly Customer["segment"][] = [
  "EPC contractor",
  "Civil contractor",
  "Solar installer",
  "Utility distributor",
  "OEM",
  "Government/PSU",
  "Trader/Dealer",
];

/**
 * What a quote is saved against when no customer has been chosen. It resolves to nobody, so
 * anything that shows a customer must treat it as "not chosen" rather than "not found".
 */
export const PENDING_CUSTOMER_ID = "CUS-PENDING";

export interface NewCustomerInput {
  name: string;
  segment: Customer["segment"];
  contactName: string;
  phone: string;
  city: string;
  /** A name from `GST_STATES`. */
  state: string;
  billingAddress: string;
  /** Optional — a quotation goes out before the buyer's tax details are to hand. */
  gstin?: string;
}

export type CustomerResult = { ok: true; customer: Customer } | { ok: false; problem: string };

/**
 * A GSTIN's first two digits are the state code, so one that disagrees with the state chosen is
 * a typing mistake in one of the two — and the state is what decides the tax split.
 */
export function gstinDisagreesWithState(gstin: string, stateCode: string): boolean {
  const trimmed = gstin.trim();
  return trimmed.length >= 2 && trimmed.slice(0, 2) !== stateCode;
}

export function buildCustomer(input: NewCustomerInput, id: string, createdAt: string): CustomerResult {
  const name = input.name.trim();
  if (!name) return { ok: false, problem: "Enter the customer's name." };
  const state = GST_STATES.find((entry) => entry.name === input.state);
  if (!state) return { ok: false, problem: "Choose the customer's state — it decides how GST is split." };
  const gstin = (input.gstin ?? "").trim().toUpperCase();
  if (gstin && gstinDisagreesWithState(gstin, state.code)) {
    return {
      ok: false,
      problem: `That GSTIN starts with ${gstin.slice(0, 2)}, which is not ${state.name} (${state.code}). Check the state or the GSTIN.`,
    };
  }
  return {
    ok: true,
    customer: {
      id,
      name,
      segment: input.segment,
      contactName: input.contactName.trim(),
      phone: input.phone.trim(),
      email: "",
      billingAddress: input.billingAddress.trim(),
      city: input.city.trim(),
      state: state.name,
      pincode: "",
      gstin,
      stateCode: state.code,
      // Neutral, not invented: the offer's own terms govern payment, and no credit has been given.
      paymentTerms: "As per offer terms",
      creditLimitInr: 0,
      createdAt,
    },
  };
}

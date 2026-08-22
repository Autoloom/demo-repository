/**
 * Customer profiles — the middle layer of the three-layer cascade (design-doc §0.3/§1.4).
 *
 * A profile holds a customer's house-style QUIRKs that override IS-table base values:
 * sag %, tolerance phrasing, lay ratio, approved vendor lists, drum defaults, marking legend.
 * Profiles are seeded from approved GTPs and (later) fed by the revision loop.
 *
 * MVP: hand-seeded, AB-cable only. WBSEDCL values are the PRD §0.5 ground truth.
 * In P1 these move behind a service backed by the store; the shape is deliberately small now.
 */
import type { DerivationQuirks } from "./derive";

export interface CustomerProfile {
  id: string;
  name: string;
  state: string;
  buyerType: "discom" | "transco" | "epc" | "gem" | "private";
  approvedGtpCount: number; // shown on the Moment-1 card
  /**
   * Which standard editions this customer pins (facts files, corpus plan §8). Editions are
   * separate immutable datasets; NOTE: only IS 8130@2013 is encoded today — a profile pinning
   * 1984 still resolves from the 2013 module until T1 sourcing lands (tracked in facts/dhbvn.md).
   */
  standardsPin: { standardId: string; edition: string }[];
  quirks: DerivationQuirks;
  /** CHOICE defaults offered in Moment 3 (closed sets, struck-out vendors already removed). */
  choices: {
    aluminiumVendors: string[];
    xlpeVendors: string[];
    /**
     * Curing method. Steam is the default; Water is the secondary option.
     * NOT "Sioplas"/"Cyoplast" — that is an XLPE compound brand, not a curing process, and it
     * is cured by the steam method (build-plan-v2 §3.2). Nitrogen curing is real but used only
     * by very large manufacturers, so it is deliberately not offered.
     * Compound name, if ever captured, is a SEPARATE field — never an option in this list.
     */
    curingMethods: ("Steam" | "Water")[];
    drumLengthOptions: string[]; // e.g. "1000 m ±5%"
  };
}

export const CUSTOMER_PROFILES: CustomerProfile[] = [
  {
    id: "WBSEDCL",
    name: "WBSEDCL",
    state: "West Bengal",
    buyerType: "discom",
    approvedGtpCount: 4,
    standardsPin: [
      { standardId: "IS 14255", edition: "1995" },
      { standardId: "IS 8130", edition: "2013" }, // WBSEDCL pins 2013 [facts/wbsedcl.md, G1]
      { standardId: "IS 398-4", edition: "1994" },
      { standardId: "IS 10418", edition: "1982" },
    ],
    quirks: {
      tolerancePhrasing: "min", // "(Min)" not "±5%"          [G1]
      sagPercent: 1.5, // their pen halved the proposed 3%     [G1]
      layRatioFactor: 0.995, // billing multiplier             [G1]
      customerName: "WBSEDCL",
      messengerConstruction: "covered", // note: DHBVN wants BARE [G1]
      coreIdentification: "1 / 2 / 3 ridges per phase", //      [G1]
      markingLegend: "ELECTRIC WBSEDCL · XLPE-90 · <year> · RDSS · CML · ISI",
      embossingIntervalM: 1,
      drumLengthM: 1000,
      drumLengthTolerance: "±5%",
    },
    choices: {
      aluminiumVendors: ["NALCO", "BALCO", "HINDALCO"], // JSR struck off, absent by design
      xlpeVendors: ["KLJ", "Kalpana"],
      curingMethods: ["Steam", "Water"],
      drumLengthOptions: ["1000 m ±5%", "500 m ±5%"],
    },
  },
  {
    // Haryana discoms. Sources: CSC-69/2011-12 spec (corpus S1) + Appendix-I blank GTP (G3).
    // Proves the quirk layer differentiates customers: DHBVN wants a BARE messenger and
    // "±5%" phrasing where WBSEDCL wants a covered messenger and "(Min)".
    id: "DHBVN",
    name: "UHBVN / DHBVN",
    state: "Haryana",
    buyerType: "discom",
    approvedGtpCount: 0,
    standardsPin: [
      { standardId: "IS 14255", edition: "1995" },
      { standardId: "IS 8130", edition: "1984" }, // Haryana pins 1984 [S1 §1.3]
      { standardId: "IS 398-4", edition: "1979" },
      { standardId: "IS 10418", edition: "1982" },
    ],
    quirks: {
      tolerancePhrasing: "plusminus", // S1 states a formula, not "(Min)"
      sagPercent: 3,
      customerName: "UHBVN / DHBVN",
      messengerConstruction: "bare", // ✔ S1 §1.5.2.1 — BARE Al-Mg-Si, 7 strands, compacted round
      coreIdentification: "Three ridges on all phases; street-light & messenger unmarked", // ✔ S1 §1.6
      markingLegend: "<manufacturer> · <year> · XPLE 90 · Property of UHBVN / DHBVN", // ✔ S1 §1.6
      drumLengthM: 1000,
      drumLengthTolerance: "±5%",
    },
    choices: {
      aluminiumVendors: ["NALCO", "BALCO", "HINDALCO", "VEDANTA"],
      xlpeVendors: ["KLJ", "Kalpana"],
      curingMethods: ["Steam", "Water"],
      drumLengthOptions: ["1000 m ±5%", "500 m ±5%"],
    },
  },
  {
    id: "NAVYA-GENERIC",
    name: "Navya (self-generated)",
    state: "Maharashtra",
    buyerType: "private",
    approvedGtpCount: 0,
    standardsPin: [
      { standardId: "IS 14255", edition: "1995" },
      { standardId: "IS 8130", edition: "2013" },
      { standardId: "IS 398-4", edition: "1994" },
    ],
    quirks: {
      tolerancePhrasing: "plusminus",
      sagPercent: 3,
      customerName: "Navya",
    },
    choices: {
      aluminiumVendors: ["NALCO", "BALCO", "HINDALCO", "VEDANTA"],
      xlpeVendors: ["KLJ", "Kalpana", "Fine Organics"],
      curingMethods: ["Steam", "Water"],
      drumLengthOptions: ["1000 m ±5%", "500 m ±5%", "250 m ±5%"],
    },
  },
];

export function findProfile(id: string): CustomerProfile | undefined {
  return CUSTOMER_PROFILES.find((p) => p.id === id);
}

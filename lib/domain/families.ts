/**
 * Cable family registry — the actual product range, from the company brochure.
 *
 * WHY THIS EXISTS
 * The first cut of the Cable Builder modelled exactly one family (aerial bunched),
 * because the one document we had was an ABC tender GTP. The brochure's Product Mix
 * page shows ABC is **one of twelve** lines — so ABC was the exception, not the norm,
 * and a builder that only does ABC is a builder for the rare case.
 *
 * This registry is the extension point. Adding a product line is a DATA edit here, not
 * a code change: give it standards, say which schema models it, and set its status.
 * Nothing else in the app enumerates cable types.
 *
 * SOURCE
 * "Daksha Cable Brochure2.pdf" — Daksha Cable Industries Pvt. Ltd., 143A Government
 * Industrial Estate, Charkop, Kandivali (West), Mumbai 400067. Note this is the SAME
 * address the approved GTP gives for Navya Cables & Conductor Pvt Ltd — the two names
 * are the same operation, with "DAKSHACABLE" and "RALLISON" used as product-line brands.
 * Worth confirming which entity should appear on customer-facing documents.
 *
 * HONESTY RULE
 * `status` says what is genuinely modelled. Nothing here claims a family works when it
 * doesn't — a family marked `planned` renders as "not yet modelled" with the reason,
 * rather than silently producing a wrong quote.
 */

export type CableFamilyId =
  | "ABC_AERIAL_BUNCHED"
  | "LT_XLPE_PVC_SHEATHED"
  | "LT_PVC_POWER"
  | "CONTROL_1_1KV"
  | "FR_FRLS_ZHFR"
  | "HOUSE_WIRING"
  | "WEATHER_PROOF"
  | "SCREENED_INSTRUMENTATION"
  | "THERMOCOUPLE"
  | "SUBMERSIBLE"
  | "SOLAR_DC"
  | "COVERED_CONDUCTOR";

/**
 * Which schema models the family.
 *  - `abc`      → AbcCableSpec: per-core array, each core a different size (lib/domain/abc.ts)
 *  - `armoured` → CableSpec: one conductor size across N cores (lib/services/types.ts)
 *  - `none`     → not yet modelled
 */
export type FamilySchema = "abc" | "armoured" | "none";

export type FamilyStatus =
  /** Modelled, costed, and buildable in the UI. */
  | "built"
  /** Schema exists and costing works, but no verified dimension table yet. */
  | "partial"
  /** Named in the brochure; not modelled. */
  | "planned";

export interface CableFamilyDef {
  id: CableFamilyId;
  /** Brochure wording, so the team recognises it. */
  label: string;
  shortLabel: string;
  schema: FamilySchema;
  status: FamilyStatus;
  /** Standards are a function of family — years included, as GTPs cite them. */
  standards: readonly string[];
  conductor: string;
  insulation: string;
  /** One line on what it's for, from the brochure. */
  description: string;
  /** What is missing before this family can be quoted properly. */
  blockedOn?: string;
}

export const CABLE_FAMILIES: readonly CableFamilyDef[] = [
  {
    id: "ABC_AERIAL_BUNCHED",
    label: "LT Aerial Bunched Cable",
    shortLabel: "Aerial bunched",
    schema: "abc",
    status: "built",
    standards: ["IS 14255/1995", "IS 398 (P-4)/94", "IS 8130/2013", "IS 10418/1982", "IS 10810/1984"],
    conductor: "Aluminium H2/H4 (phase) + Al-Mg-Si alloy (messenger)",
    insulation: "XLPE, UV-resistant with carbon black",
    description:
      "Overhead distribution to consumers. Phase + street-light cores twisted around a messenger that carries the weight.",
  },
  {
    id: "LT_XLPE_PVC_SHEATHED",
    label: "LT XLPE Insulated PVC Sheathed Cable",
    shortLabel: "LT XLPE",
    schema: "armoured",
    status: "partial",
    standards: ["IS 7098 (Part 1)-1988"],
    conductor: "Aluminium or Copper, stranded",
    insulation: "XLPE, PVC inner sheath + PVC outer sheath",
    description:
      "The flagship line — three-and-a-half core, unarmoured or strip/round-wire armoured. Higher current rating and lower weight than PVC.",
    blockedOn:
      "Dimension table not yet transcribed. The brochure's Table 7/8 carry approved weights (kg/km) per size — until those are entered, costing falls back to a generic density coefficient that runs ~16% heavy.",
  },
  {
    id: "LT_PVC_POWER",
    label: "LT Power Cable (1100 V grade, PVC)",
    shortLabel: "LT PVC power",
    schema: "armoured",
    status: "partial",
    standards: ["IS 1554 (Part 1)"],
    conductor: "Aluminium — solid up to 10 sq mm, stranded above",
    insulation: "PVC, PVC sheathed",
    description:
      "Single core unarmoured to 500 sq mm, multicore unarmoured to 400 sq mm, multicore armoured to 240 sq mm.",
    blockedOn: "Dimension/weight table not yet transcribed from the brochure.",
  },
  {
    id: "CONTROL_1_1KV",
    label: "1.1 kV Control Cable",
    shortLabel: "Control",
    schema: "armoured",
    status: "partial",
    standards: ["IS 1554 (Part 1)"],
    conductor: "Electrolytic copper",
    insulation: "PVC, GI round steel wire armoured, black PVC outer sheath",
    description:
      "1.5 and 2.5 sq mm, 2 to 37 cores, for control and measuring circuits — substations, railway signalling.",
    blockedOn:
      "Dimension table not transcribed. Note this family runs to 37 cores, so the core-count vocabulary needs checking against the existing CoreConfig enum.",
  },
  {
    id: "FR_FRLS_ZHFR",
    label: "FR / FRLS / ZHFR Cable",
    shortLabel: "FR / FRLS",
    schema: "armoured",
    status: "planned",
    standards: [],
    conductor: "As base cable",
    insulation: "Fire-retardant, low-smoke compounds",
    description: "Reduced flame spread, smoke and toxic emission. A property of the compound rather than a separate construction.",
    blockedOn:
      "Likely a flag on an existing family rather than a family of its own — CableSpec already has a flameClass field. Confirm with production before modelling it separately.",
  },
  {
    id: "COVERED_CONDUCTOR",
    label: "Covered Conductor (MVCC)",
    shortLabel: "Covered conductor",
    schema: "none",
    status: "planned",
    standards: ["SS EN 50397-1"],
    conductor: "AAAC or ACSR",
    insulation: "Semi-conducting screen + XLPE inner + UV/anti-tracking XLPE or HDPE outer",
    description: "Overhead lines through trees and populated areas. Three distinct covering layers, not a single insulation.",
    blockedOn: "Three-layer covering doesn't fit either existing schema. Needs its own, plus a sample spec.",
  },
  {
    id: "SOLAR_DC",
    label: "Solar (DC) Cable",
    shortLabel: "Solar DC",
    schema: "none",
    status: "planned",
    standards: ["BS EN 60228:2005 cl. 5"],
    conductor: "Fine-wire tinned copper",
    insulation: "UV-resistant, cross-linkable, halogen-free flame-retardant",
    description: "PV systems — free hanging, movable, fixed or buried.",
    blockedOn: "Single-core flexible construction; no sample spec yet.",
  },
  {
    id: "SCREENED_INSTRUMENTATION",
    label: "Screened Instrumentation Cable",
    shortLabel: "Instrumentation",
    schema: "none",
    status: "planned",
    standards: [],
    conductor: "Copper, pair/triad",
    insulation: "PVC/PE with individual and/or overall screen",
    description: "Pairs or triads with screening — the existing schema has no concept of pairs.",
    blockedOn: "Needs pair/triad modelling (the ABC spec's PAIR_CONFIGS idea), plus a sample.",
  },
  {
    id: "THERMOCOUPLE",
    label: "Thermocouple Cable",
    shortLabel: "Thermocouple",
    schema: "none",
    status: "planned",
    standards: [],
    conductor: "Thermocouple alloy pairs (type-specific)",
    insulation: "PVC / PTFE / glass",
    description: "Compensating cable for temperature measurement.",
    blockedOn: "Conductor is an alloy pair keyed to thermocouple type (K, J, T…), which the conductor-material enum can't express.",
  },
  {
    id: "SUBMERSIBLE",
    label: "Submersible Cable",
    shortLabel: "Submersible",
    schema: "none",
    status: "planned",
    standards: [],
    conductor: "Copper, flat or round",
    insulation: "Water-resistant PVC / elastomer",
    description: "Submersible pump duty.",
    blockedOn: "Flat construction; no sample spec.",
  },
  {
    id: "HOUSE_WIRING",
    label: "House Wiring Cable",
    shortLabel: "House wiring",
    schema: "none",
    status: "planned",
    standards: ["IS 694"],
    conductor: "Copper, flexible",
    insulation: "PVC / FRLS",
    description: "Single-core building wire, sold in coils rather than on drums.",
    blockedOn: "Sold by coil length, so the drum/lay-ratio model doesn't apply. Different costing shape.",
  },
  {
    id: "WEATHER_PROOF",
    label: "Weather Proof Cable",
    shortLabel: "Weather proof",
    schema: "none",
    status: "planned",
    standards: [],
    conductor: "Aluminium / copper",
    insulation: "Weather-resistant PVC / PE",
    description: "Outdoor service connections.",
    blockedOn: "No sample spec; overlaps LT PVC power — confirm whether it is a distinct line.",
  },
] as const;

export function getFamily(id: CableFamilyId): CableFamilyDef | undefined {
  return CABLE_FAMILIES.find((f) => f.id === id);
}

/** Families a user can actually build with right now. */
export function buildableFamilies(): CableFamilyDef[] {
  return CABLE_FAMILIES.filter((f) => f.status === "built" || f.status === "partial");
}

export const FAMILY_STATUS_LABEL: Record<FamilyStatus, string> = {
  built: "Ready",
  partial: "Costing only",
  planned: "Not modelled",
};

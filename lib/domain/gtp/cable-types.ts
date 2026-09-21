/**
 * Cable-type registry (build-plan-v2 WP-B / build-plan-v1 WP-S4).
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE (working rule 3):
 *   Adding a cable type = contributing a standards dataset, a field set, a config schema and a
 *   template. It must NOT mean editing shared engine code. If you find yourself writing
 *   `if (type === 'AB')` inside derivation logic, the abstraction is wrong — fix it here instead.
 *
 * Four types are in scope, in this order (D5): Aerial Bunched → LT power → aluminium control →
 * solar. Screened and instrumentation cables are explicitly out of scope.
 *
 * Each type declares:
 *   • which standards it derives from, and at which pinned editions
 *   • its configuration schema — what the operator picks (drives the builder's Step 2)
 *   • its derivation chain — an ORDERED list of named steps
 *   • which validation rules apply
 *
 * On chains: for AB the steps are largely independent lookups, but for LT power and control each
 * step's OUTPUT is the next step's LOOKUP KEY (the fictitious-diameter build-up). Modelling this
 * as an ordered chain rather than a flat "fetch 40 fields" is what makes the second family
 * possible at all — and what lets the UI explain any value to an engineer.
 */
import type { StandardsBody } from "@/lib/domain/standards/types";

import type { ProductLine } from "./types";

/** A field the operator fills in Step 2. Rendered from data — the builder has no per-type UI. */
export type ConfigField =
  | {
      kind: "choice";
      key: string;
      label: string;
      hint?: string;
      options: readonly (string | number)[];
      /** Options come from a closed set; an unsupported value must be unreachable, not rejected. */
      defaultValue?: string | number;
      optional?: boolean;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      hint?: string;
      min?: number;
      defaultValue?: number;
    }
  | {
      kind: "boolean";
      key: string;
      label: string;
      hint?: string;
      defaultValue?: boolean;
    };

/**
 * One step of a derivation chain. `blockedBy` marks steps we cannot compute yet — they throw
 * rather than approximate (build-plan-v1 §12 risk row 2).
 */
export interface DerivationStep {
  id: string;
  /** What this step produces, in plain language — shown in the standards-coverage panel. */
  describes: string;
  /** Which standard it reads. Absent for pure arithmetic steps. */
  standardId?: string;
  /** For diameter-keyed lookups: what this step's key is computed from. */
  keyedBy?: string;
  /** Set when the step cannot run: names the missing standard. */
  blockedBy?: string;
}

export interface CableTypeDefinition {
  id: ProductLine;
  label: string;
  /** Plain-language description for the type picker. */
  description: string;
  body: StandardsBody;
  primaryStandard: { id: string; edition: string };
  /**
   * Conductor material, when the standard fixes it rather than leaving it to the order.
   * IS 14255 is an aluminium-conductor specification throughout, so AB cable has no choice to
   * offer; LT power and control leave this undefined and let the operator pick. The UI reads
   * this to decide between a read-only fact and a live picker.
   */
  fixedConductorMaterial?: { material: "AL" | "CU"; ref: string };
  supportingStandards: Array<{ id: string; edition: string; purpose: string }>;
  configSchema: ConfigField[];
  derivationChain: DerivationStep[];
  /** Validation rule ids from lib/domain/gtp/validate.ts. */
  validationRules: string[];
  /** True only when every chain step can actually run. Drives the builder's availability. */
  available: boolean;
  /** When not available, the single sentence explaining why. */
  /**
   * Why this type can't be built yet, in ONE short operator-facing sentence.
   *
   * This renders on a card in the builder, read by someone deciding what to quote — not by an
   * engineer. It must say what is missing in their terms, not ours: no clause numbers, no
   * "data entry vs engine work", no internal work-queue vocabulary.
   */
  blockedReason?: string;
  /** The engineering detail, for the standards page and for us. Not shown in the builder. */
  blockedDetail?: string;
  /** Rough remaining work, so "coming soon" carries some information. */
  remainingWork?: string;
}

/** Conductor shape is first-class: LT power uses sector cores, which change dia and mass (WP-B). */
export const CONDUCTOR_SHAPES = ["circular", "sector"] as const;
export type ConductorShape = (typeof CONDUCTOR_SHAPES)[number];

// ── Type definitions ─────────────────────────────────────────────────────────

const AERIAL_BUNCHED: CableTypeDefinition = {
  id: "AB_CABLE",
  label: "Aerial Bunched (AB) cable",
  description: "Insulated cores twisted around a messenger wire, strung between poles. LT, XLPE.",
  body: "BIS",
  primaryStandard: { id: "IS 14255", edition: "1995" },
  fixedConductorMaterial: { material: "AL", ref: "IS 14255 : 1995" },
  supportingStandards: [
    { id: "IS 8130", edition: "2013", purpose: "Conductor strands, diameters, resistance" },
    { id: "IS 398-4", edition: "1979", purpose: "Messenger alloy: modulus, expansion, composition" },
    { id: "IS 10418", edition: "1982", purpose: "Drum dimensions and marking" },
  ],
  configSchema: [
    { kind: "choice", key: "coreCount", label: "Phase cores", options: [1, 3], defaultValue: 3, hint: "Three-phase mains, or a single-phase service drop" },
    { kind: "choice", key: "phaseSizeSqMm", label: "Phase size", options: [16, 25, 35, 50, 70, 95], defaultValue: 70, hint: "sq mm — IS 14255 covers 16 to 95" },
    { kind: "choice", key: "streetLightSizeSqMm", label: "Street-light core", options: [16], defaultValue: 16, optional: true, hint: "IS 14255 §6.4 fixes this at 16 sq mm" },
    { kind: "choice", key: "messengerSizeSqMm", label: "Messenger", options: [25, 35, 50, 70], hint: "Auto-paired from IS 14255 Table 3; editable" },
    // Both constructions are real and materially different cables — DHBVN specifies bare
    // Al-Mg-Si, WBSEDCL a covered messenger. Asked for by the manufacturer (Sept 2026):
    // "option of Bare messenger shall also be provided, accordingly other parameters viz.
    // Dimensions / Weight will also change."
    {
      kind: "choice",
      key: "messengerConstruction",
      label: "Messenger construction",
      options: ["covered", "bare"],
      defaultValue: "covered",
      hint: "Bare drops the messenger's insulation wall, so the bundle gets lighter and thinner.",
    },
  ],
  derivationChain: [
    { id: "conductor.phase", describes: "Phase conductor strands, diameter, resistance", standardId: "IS 8130" },
    { id: "conductor.streetLight", describes: "Street-light conductor", standardId: "IS 8130" },
    { id: "messenger.pairing", describes: "Messenger size, breaking load, resistance", standardId: "IS 14255" },
    { id: "messenger.alloy", describes: "Alloy modulus, expansion coefficient", standardId: "IS 398-4", blockedBy: "IS 398 (Part 4) not held" },
    { id: "insulation", describes: "Insulation thickness by size", standardId: "IS 14255" },
    { id: "calc.diaOverInsulation", describes: "Dia over insulation = compacted dia + 2×ti" },
    { id: "calc.bundle", describes: "Overall bundle diameter and mass" },
    { id: "rating.current", describes: "Current rating", standardId: "IS 3961", blockedBy: "IS 3961 not held" },
    { id: "drum", describes: "Drum dimensions and tare", standardId: "IS 10418", blockedBy: "IS 10418 not held" },
  ],
  validationRules: [
    "derating.non-monotonic",
    "buildup.dia-mismatch",
    "drum.length-mismatch",
    "field.missing-source",
  ],
  available: true,
};

const LT_POWER_XLPE: CableTypeDefinition = {
  id: "XLPE_POWER",
  label: "LT XLPE power cable",
  description: "Armoured underground power cable, e.g. 3.5C x 300 sq mm A2XFY.",
  body: "BIS",
  primaryStandard: { id: "IS 7098-1", edition: "2025" },
  supportingStandards: [
    { id: "IS 8130", edition: "2013", purpose: "Conductors" },
    { id: "IS 10462-1", edition: "1983", purpose: "Fictitious calculation of protective-covering dimensions" },
    { id: "IS 3975", edition: "1999", purpose: "Galvanized steel armour wires and formed wires" },
    { id: "IS 5831", edition: "1984", purpose: "PVC sheath compounds (ST-2)" },
  ],
  configSchema: [
    // Power cable tops out at 3.5 or 4 core. Niraj (13 Sept 2026) flagged the previous list as an
    // error: "current system allows core count beyond 4 for power cables; needs a constraint" —
    // anything above 4 core is a CONTROL cable, which is a separate type with a separate standard
    // and a copper conductor. Offering 5 here let an operator build a power GTP that the factory
    // does not make.
    { kind: "choice", key: "coreCount", label: "Cores", options: [1, 2, 3, 3.5, 4], defaultValue: 3.5 },
    // 4 sq mm to 400-500, with 630 a single-core edge case (Niraj, same call). The tables run
    // further, but 800 and 1000 sq mm are not cable this manufacturer makes, and 1.5 / 2.5 sq mm
    // are control and house-wiring sizes rather than power.
    { kind: "choice", key: "csa", label: "Conductor size", options: [4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630], defaultValue: 300, hint: "sq mm — 630 is single-core only" },
    { kind: "choice", key: "material", label: "Conductor material", options: ["Aluminium", "Copper"], defaultValue: "Aluminium" },
    { kind: "choice", key: "shape", label: "Conductor shape", options: [...CONDUCTOR_SHAPES], defaultValue: "circular", hint: "Sector cores pack tighter, reducing overall diameter" },
    { kind: "boolean", key: "armoured", label: "Armoured", defaultValue: true },
    // Strip by default on this line. The manufacturer's own correction (Sept 2026): "Instead of
    // Wire Armour used for 3.5 Core Cables the Galvanised Steel Strip Armour size 4 × 0.8 mm
    // shall be placed, which is very widely used." Round wire stays selectable — and is forced
    // anyway below 13 mm calculated diameter, where the standard permits nothing else.
    {
      kind: "choice",
      key: "armourForm",
      label: "Armour form",
      options: ["formed-wire", "round-wire"],
      defaultValue: "formed-wire",
      hint: "Formed wire is galvanised steel strip. Round wire is forced below 13 mm calculated diameter (§14.2).",
    },
    {
      kind: "choice",
      key: "armourMethod",
      label: "Armouring practice",
      options: ["A", "B"],
      defaultValue: "A",
      hint: "Both are printed in Table 6. A = 4.0 × 0.8 mm strip at every diameter above 13 mm. B = the banded table, stepping to 6.1 × 1.4 mm above 40 mm.",
    },
    { kind: "choice", key: "sheath", label: "Outer sheath", options: ["PVC ST-2", "PE", "LSHF"], defaultValue: "PVC ST-2" },
  ],
  // The build-up chain. Each `keyedBy` step needs the PREVIOUS step's output as its lookup key.
  derivationChain: [
    { id: "conductor.rule", describes: "Solid or stranded, flexibility class, from size and material", standardId: "IS 7098-1" },
    { id: "conductor", describes: "Max DC resistance and minimum wire count", standardId: "IS 8130" },
    { id: "neutral.reduced", describes: "Reduced-neutral CSA", standardId: "IS 7098-1" },
    { id: "insulation", describes: "Insulation thickness", standardId: "IS 7098-1" },
    { id: "calc.diaOverCore", describes: "Fictitious diameter over insulation (D_c)", standardId: "IS 10462-1" },
    { id: "layup", describes: "Lay-up pattern by core count", standardId: "IS 7098-1" },
    { id: "calc.diaOverLaidUp", describes: "Fictitious diameter over laid-up cores (D_f)", standardId: "IS 10462-1", keyedBy: "calc.diaOverCore" },
    { id: "innerSheath", describes: "Inner sheath thickness", standardId: "IS 7098-1", keyedBy: "calc.diaOverLaidUp" },
    { id: "calc.diaUnderArmour", describes: "Fictitious diameter over inner sheath = under armour (D_B)", standardId: "IS 10462-1", keyedBy: "innerSheath" },
    { id: "armour", describes: "Armour wire diameter or strip thickness", standardId: "IS 7098-1", keyedBy: "calc.diaUnderArmour" },
    { id: "calc.diaUnderSheath", describes: "Fictitious diameter over armour = under outer sheath (D_X)", standardId: "IS 10462-1", keyedBy: "armour" },
    { id: "outerSheath", describes: "Outer sheath thickness", standardId: "IS 7098-1", keyedBy: "calc.diaUnderSheath" },
    { id: "calc.overall", describes: "Overall diameter and mass by component" },
  ],
  validationRules: ["buildup.dia-mismatch", "band.coverage", "neutral.reduced", "field.missing-source"],
  available: true,
};

const PVC_CONTROL: CableTypeDefinition = {
  id: "PVC_CONTROL",
  label: "Control cable (PVC)",
  description: "Multi-core control cable, PVC insulated. Same standard as LT PVC power.",
  body: "BIS",
  primaryStandard: { id: "IS 1554-1", edition: "1988" },
  supportingStandards: [
    { id: "IS 8130", edition: "2013", purpose: "Conductors" },
    { id: "IS 10462-1", edition: "1983", purpose: "Fictitious calculation method" },
    { id: "IS 5831", edition: "1984", purpose: "PVC insulation (Type A/C) and sheath (ST-1/ST-2)" },
  ],
  configSchema: [
    { kind: "number", key: "coreCount", label: "Number of cores", min: 2, defaultValue: 7, hint: "Control cables run to 61 cores and beyond" },
    { kind: "choice", key: "csa", label: "Conductor size", options: [1.5, 2.5, 4, 6], defaultValue: 2.5, hint: "sq mm" },
    { kind: "choice", key: "material", label: "Conductor material", options: ["Copper", "Aluminium"], defaultValue: "Copper", hint: "Both are supported. Copper is the corpus norm for control; the manufacturer also runs aluminium. IS 8130 specifies both, and the minimum wire counts differ." },
    { kind: "boolean", key: "armoured", label: "Armoured", defaultValue: true },
    // Control cable is conventionally round-wire armoured, and at these sizes the calculated
    // diameter often falls at or below 13 mm, where the standard permits nothing else. Strip is
    // offered rather than assumed.
    {
      kind: "choice",
      key: "armourForm",
      label: "Armour form",
      options: ["round-wire", "formed-wire"],
      defaultValue: "round-wire",
      hint: "Round wire is forced below 13 mm calculated diameter (§13.2), whatever is selected here.",
    },
    {
      kind: "choice",
      key: "armourMethod",
      label: "Armouring practice",
      options: ["A", "B"],
      defaultValue: "A",
      hint: "Applies only to formed wire. A = 4.0 × 0.8 mm strip above 13 mm; B = the banded table.",
    },
  ],
  derivationChain: LT_POWER_XLPE.derivationChain, // structurally identical (build-plan-v1 §0.3)
  validationRules: ["buildup.dia-mismatch", "band.coverage", "field.missing-source"],
  available: true,
};

const SOLAR_DC: CableTypeDefinition = {
  id: "SOLAR_DC",
  label: "Solar DC cable",
  description: "Single-core cross-linked cable for the DC side of PV systems, 1.5 kV DC.",
  // The type that proves the engine can leave India: not BIS.
  // BIS, not IEC: IS 17293 is the Indian solar cable standard and the right citation for a GTP
  // produced here. IEC 62930 / EN 50618 remain listed as the international siblings.
  body: "BIS",
  primaryStandard: { id: "IS 17293", edition: "2020" },
  // IS 17293 §4.1 specifies annealed TINNED copper. Not a choice.
  fixedConductorMaterial: { material: "CU", ref: "IS 17293 : 2020" },
  supportingStandards: [
    { id: "IS 8130", edition: "2013", purpose: "Conductor classes 2 and 5" },
    { id: "IEC 62930", edition: "2017", purpose: "International sibling (clauses only — tables not held)" },
    { id: "EN 50618", edition: "2015", purpose: "European sibling (clauses only — tables not held)" },
  ],
  configSchema: [
    // The conductor class is NOT offered directly: §4.1 derives it from the application, and
    // offering it as a free choice would let an operator pick a class the standard forbids.
    { kind: "boolean", key: "directlyConnectedToModules", label: "Connected directly to PV modules", defaultValue: true, hint: "Yes → Class 5 (flexible). No → Class 2, fixed installation only." },
    { kind: "choice", key: "csa", label: "Conductor size", options: [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400], defaultValue: 4, hint: "sq mm" },
    { kind: "choice", key: "installationMethod", label: "Installation", options: ["free-in-air", "on-surface", "two-touching"], defaultValue: "free-in-air", hint: "Changes the current rating (Table 7)" },
    { kind: "choice", key: "ambientC", label: "Ambient temperature", options: [0, 10, 20, 30, 40, 50, 60, 70], defaultValue: 40, hint: "°C — Table 7 is rated at 40 °C; higher ambients de-rate the cable" },
  ],
  // Flat: no lay-up, no armour, no fictitious-diameter chain. This is why it is buildable now.
  derivationChain: [
    { id: "conductor", describes: "Annealed tinned copper, class derived from application", standardId: "IS 17293" },
    { id: "dimensions", describes: "Insulation and sheath thickness, overall diameter, insulation resistance", standardId: "IS 17293" },
    { id: "rating", describes: "Current capacity, de-rated for ambient temperature", standardId: "IS 17293" },
    { id: "fixed", describes: "1.5 kV DC rating, 90 °C continuous / 120 °C for 20 000 h" },
    { id: "tests", describes: "Test schedule including UV/weathering and dynamic penetration", standardId: "IEC 62930" },
  ],
  validationRules: ["tolerance.iec", "field.missing-source"],
  available: true,
};

export const CABLE_TYPES: CableTypeDefinition[] = [
  AERIAL_BUNCHED,
  LT_POWER_XLPE,
  PVC_CONTROL,
  SOLAR_DC,
];

export function findCableType(id: ProductLine): CableTypeDefinition | undefined {
  return CABLE_TYPES.find((t) => t.id === id);
}

export function availableCableTypes(): CableTypeDefinition[] {
  return CABLE_TYPES.filter((t) => t.available);
}

/** Steps that cannot run today, with the standard each is waiting on. Drives the coverage panel. */
export function blockedSteps(type: CableTypeDefinition): DerivationStep[] {
  return type.derivationChain.filter((s) => s.blockedBy);
}

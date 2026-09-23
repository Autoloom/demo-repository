/**
 * CableSpec builders for the two families the LT bridge cannot express.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * `specFromFields` opens with:
 *
 *     if (productLine !== "XLPE_POWER" && productLine !== "PVC_CONTROL")
 *       throw new Error("AB and solar quoting require the Construction union");
 *
 * That one line meant **neither AB nor solar cable could be quoted at all**. A GTP for either
 * derived cleanly, saved, and then sat on the quote list reading "No cable is linked to this GTP
 * yet", because the quote needs a `CableSpec` and nothing could build one.
 *
 * The blocker was never the data model. `CableSpec` already carries `aerialBunched` and `solar`
 * detail blocks and a `family` that names both, and `costing.ts` already prices an AB bundle's
 * phases, messenger and street-light core separately in `effectiveConductorWeight`. The only
 * missing piece was the bridge from a derived GTP to that spec — which is what this file is.
 *
 * ─── Why it is a separate module ──────────────────────────────────────────────────────────────
 *
 * `GtpSpecSource.config` is an `LtCableConfig`, and an AB cable has no single conductor size and
 * no armour, while a solar cable has no cores at all. Widening that type to cover three unrelated
 * constructions would put `if (productLine === ...)` back inside the shared engine — exactly what
 * the cable-type registry's working rule 3 forbids. So these build a `CableSpec` WITHOUT a
 * `gtpSource`, and costing routes them by `family` to their own derived-mass path.
 *
 * ─── Nothing is invented ──────────────────────────────────────────────────────────────────────
 *
 * Every dimension comes from the resolved GTP fields or the same derivation the GTP printed.
 * Where a figure is absent the builder returns a gap, exactly as the LT bridge does; a quote
 * priced on a number the GTP did not state is the failure this whole layer exists to prevent.
 */

import type { CableSpec, CoreConfig } from "@/lib/services/types";
import { conductorClassFor, solarDimensions } from "@/lib/domain/standards/is17293-2020";
import { deriveAbBundle, type AbBundle } from "./derive";
import { deriveSolarMass, isMassGap } from "./mass";
import type { CableConstruction, ConductorGroup, ResolvedField } from "./types";

export interface SpecGap {
  gap: true;
  reason: string;
}

/** Narrow any `T | SpecGap` result. Generic so mass results use the same guard as specs. */
export function isSpecGap<T extends object>(value: T | SpecGap): value is SpecGap {
  return (value as SpecGap).gap === true;
}

/** First field whose value is still unresolved, so a quote never prices an unfinished GTP. */
function firstGap(fields: ResolvedField[]): ResolvedField | undefined {
  return fields.find((f) => f.gap);
}

function fieldValue(fields: ResolvedField[], key: string): string | undefined {
  const f = fields.find((entry) => entry.key === key);
  return f === undefined ? undefined : String(f.value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aerial bunched
// ─────────────────────────────────────────────────────────────────────────────

export interface AbSpecInput {
  specId: string;
  designation: string;
  construction: CableConstruction;
  fields: ResolvedField[];
  messengerConstruction: "bare" | "covered";
}

/**
 * Build a quotable CableSpec for an AB cable.
 *
 * The phase size becomes `conductorSizeSqMm` and the phase count becomes `cores`, because that is
 * what the flat spec can hold; the parts a flat spec cannot express — messenger size, street
 * light, whether the messenger is covered — go in `aerialBunched`, which is what costing actually
 * reads for this family.
 */
export function specFromAbConstruction(input: AbSpecInput): CableSpec | SpecGap {
  const { construction, fields } = input;

  const gap = firstGap(fields);
  if (gap) return { gap: true, reason: `${gap.label}: ${gap.value}` };

  // The group role is still keyed "power" internally; only the printed labels say phase.
  const phase = construction.groups.find((g) => g.role === "power");
  const messenger = construction.groups.find((g) => g.role === "messenger");
  const streetLight = construction.groups.find((g) => g.role === "street-light");

  if (!phase) return { gap: true, reason: "This AB cable has no phase core" };
  if (!messenger) return { gap: true, reason: "This AB cable has no messenger core" };
  if (phase.count !== 1 && phase.count !== 3) {
    return { gap: true, reason: `AB cable is built in 1 or 3 phase cores, not ${phase.count}` };
  }

  // The same bundle the GTP printed — not a second model. A missing IS row here means the GTP
  // could not state a mass either, so the quote must not invent one.
  const bundle = deriveAbBundle(construction.groups, input.messengerConstruction);
  if (!bundle) {
    return { gap: true, reason: "A conductor size in this cable has no IS row, so its mass cannot be derived" };
  }

  return {
    id: input.specId,
    family: "Aerial Bunched Cable",
    standard: "IS 14255",
    voltageGrade: "650/1100 V (1.1 kV)",
    cores: `${phase.count}C` as CoreConfig,
    conductorMaterial: "Aluminium", // IS 14255 throughout — the registry fixes it
    conductorClass: "Class 2 (stranded)",
    conductorSizeSqMm: phase.sizeSqMm,
    insulation: "XLPE",
    // An AB bundle is insulated cores laid up bare: no armour, no overall sheath.
    armour: "Unarmoured",
    sheath: "PVC (ST2)",
    flameClass: "Standard",
    designation: input.designation,
    approxOuterDiaMm: bundle.overallDiaMm,
    approxWeightKgPerKm: bundle.massKgPerKm,
    aerialBunched: {
      phaseCount: phase.count,
      phaseSizeSqMm: phase.sizeSqMm,
      messengerSizeSqMm: messenger.sizeSqMm,
      messengerInsulated: input.messengerConstruction === "covered",
      streetLightSizeSqMm: streetLight?.sizeSqMm,
    },
    technical: {
      coreIdentification: fieldValue(fields, "power.identification"),
    },
  };
}

/** Per-layer mass for an AB cable, in the shape costing's `derivedMass` expects. */
export function abDerivedMass(
  construction: CableConstruction,
  messengerConstruction: "bare" | "covered",
): { insulationKgPerM: number; armourKgPerM: number; sheathKgPerM: number; workings: string } | SpecGap {
  const bundle: AbBundle | undefined = deriveAbBundle(construction.groups, messengerConstruction);
  if (!bundle) {
    return { gap: true, reason: "A conductor size in this cable has no IS row, so its mass cannot be derived" };
  }
  return {
    insulationKgPerM: bundle.insulationMassKgPerKm / 1000,
    // An AB bundle has neither. Stated as zero rather than omitted, so the quote shows the
    // construction honestly instead of leaving a reader to wonder whether it was forgotten.
    armourKgPerM: 0,
    sheathKgPerM: 0,
    workings: bundle.workings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Solar DC
// ─────────────────────────────────────────────────────────────────────────────

export interface SolarSpecInput {
  specId: string;
  designation: string;
  csaSqMm: number;
  /** IS 17293 §4.1 derives the conductor class from this, so it is carried, not re-guessed. */
  directlyConnectedToModules: boolean;
  fields: ResolvedField[];
  /** From the GTP's own derived fields — never defaulted. */
  insulationThicknessMm: number;
  sheathThicknessMm: number;
  conductorDiaMm: number;
  overallDiaMm: number;
  massKgPerKm: number;
  dcPolarityColour?: "Red" | "Black" | "Natural" | "Black with red stripe";
}

/**
 * Build a quotable CableSpec for a solar DC cable.
 *
 * Single core, no armour, nothing laid up — so most of the flat spec's shape is unused, and the
 * solar-specific facts (polarity colour, halogen-free, UV resistance) live in `solar`, which is
 * where a solar GTP's own distinguishing claims belong.
 */
export function specFromSolarConstruction(input: SolarSpecInput): CableSpec | SpecGap {
  const gap = firstGap(input.fields);
  if (gap) return { gap: true, reason: `${gap.label}: ${gap.value}` };
  if (!(input.csaSqMm > 0)) return { gap: true, reason: "Solar cable needs a conductor size" };

  return {
    id: input.specId,
    family: "Solar DC Cable",
    standard: "IS 17293",
    // IS 17293 is a 1.5 kV DC cable. CableSpec's grades are a.c. pairs, so the nearest true
    // statement is the LT grade; the DC rating is carried on the GTP itself, which is the
    // document an inspector reads.
    voltageGrade: "650/1100 V (1.1 kV)",
    cores: "1C",
    conductorMaterial: "Copper", // §4.1 — annealed TINNED copper. Not a choice.
    conductorClass: input.directlyConnectedToModules ? "Class 5 (flexible)" : "Class 2 (stranded)",
    conductorSizeSqMm: input.csaSqMm,
    insulation: "XLPO (solar/UV)",
    armour: "Unarmoured",
    sheath: "Zero-halogen (ZHFR/LSZH)",
    flameClass: "LSZH",
    designation: input.designation,
    approxOuterDiaMm: input.overallDiaMm,
    approxWeightKgPerKm: input.massKgPerKm,
    solar: {
      dcPolarityColour: input.dcPolarityColour ?? "Black",
      halogenFree: true,
      uvResistant: true,
    },
  };
}

/**
 * Per-layer mass for a solar cable, in the shape costing's `derivedMass` expects.
 *
 * Re-derived from IS 17293 by size and class rather than read off the stored spec, for the same
 * reason the LT path re-derives: the quote must price the cable the standard describes, not a
 * figure that was copied once and could since have drifted from its own GTP.
 */
export function solarDerivedMass(input: {
  csaSqMm: number;
  directlyConnectedToModules: boolean;
}): { insulationKgPerM: number; armourKgPerM: number; sheathKgPerM: number; workings: string } | SpecGap {
  const { klass } = conductorClassFor(input.directlyConnectedToModules);
  const dims = solarDimensions(input.csaSqMm, klass);
  // The table gives an overall diameter and two walls; the conductor is what is left inside.
  const conductorDiaMm =
    dims.values.meanOverallDiaMm - 2 * (dims.values.insulationThicknessMm + dims.values.sheathThicknessMm);

  const mass = deriveSolarMass({
    csaSqMm: input.csaSqMm,
    insulationThicknessMm: dims.values.insulationThicknessMm,
    sheathThicknessMm: dims.values.sheathThicknessMm,
    conductorDiaMm,
  });
  if (isMassGap(mass)) return { gap: true, reason: mass.missing };

  const kgPerMFor = (layer: string) =>
    mass.components.filter((c) => c.layer === layer).reduce((sum, c) => sum + c.massKgPerKm, 0) / 1000;

  return {
    insulationKgPerM: kgPerMFor("Insulation"),
    // A solar cable is unarmoured by construction — IS 17293 has no armour at all.
    armourKgPerM: 0,
    sheathKgPerM: kgPerMFor("Sheath"),
    workings: mass.workings,
  };
}

/** Rebuild the AB conductor groups a mass derivation needs from a stored spec. */
export function abGroupsFromSpec(ab: NonNullable<CableSpec["aerialBunched"]>): ConductorGroup[] {
  const groups: ConductorGroup[] = [
    { role: "power" as const, count: ab.phaseCount, sizeSqMm: ab.phaseSizeSqMm },
    { role: "messenger" as const, count: 1, sizeSqMm: ab.messengerSizeSqMm },
  ];
  if (ab.streetLightSizeSqMm) {
    groups.push({ role: "street-light" as const, count: 1, sizeSqMm: ab.streetLightSizeSqMm });
  }
  return groups;
}

/**
 * A temporary bridge from the legacy flat `CableSpec` to the GTP engines.
 *
 * ─── Why this exists, and why it should not exist for long ────────────────────────────────────
 *
 * There are two notions of "a cable" in this codebase:
 *
 *   • `CableSpec` in lib/services/types.ts — flat, quote-oriented: a family, a core config
 *     string, a size, an armour type. What the quote builder edits.
 *   • `Construction` — the discriminated union the GTP engines derive from, where an LT cable
 *     has an armour flag and a solar cable has an installation method, because those are
 *     genuinely different shapes.
 *
 * The quote needs a mass it can price, and only the engines can derive one. Until the two
 * notions are unified — that is WP-3, and it is the convergence point both work tracks feed
 * into — something has to translate.
 *
 * ⚠️ THIS FILE IS SCAFFOLDING. When `CableSpec` becomes the persisted substrate carrying a real
 * `Construction`, delete it. It exists so the quote can stop estimating today, not because
 * translating between two cable models is a good permanent arrangement.
 *
 * ─── What it will and will not do ─────────────────────────────────────────────────────────────
 *
 * It maps the families that correspond to an encoded standard, and returns a GAP for everything
 * else. It never guesses. A quote for a cable this cannot map gets no derived mass and must say
 * so, because the alternative — falling back to the old coefficients — is exactly the
 * two-definitions problem this work removes.
 */
import type { CableSpec } from "@/lib/services/types";

import type { LtCableConfig } from "./derive-lt";
import type { ProductLine } from "./types";
import { deriveLtMass, isMassGap } from "./mass";

/** A cable this bridge cannot map, and the reason, in the same voice as a standards gap. */
export interface BridgeGap {
  gap: true;
  reason: string;
}

export type BridgeResult<T> = T | BridgeGap;

export function isBridgeGap<T>(r: BridgeResult<T>): r is BridgeGap {
  return typeof r === "object" && r !== null && "gap" in r;
}

/** Core configs the LT engine understands. "3.5C" is a float discriminator, not a typo. */
function coreCountFor(cores: CableSpec["cores"]): number | undefined {
  if (cores === "3.5C") return 3.5;
  const n = Number(cores.replace("C", ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Which encoded standard governs a legacy family.
 *
 * Control cable is IS 1554-1 like LT PVC power — the standard covers both, and the engine
 * already serves them from one chain with two datasets.
 */
function ltStandardFor(spec: Pick<CableSpec, "family" | "insulation">): LtCableConfig["standard"] | undefined {
  if (spec.family === "LT XLPE Power") return "IS7098-1";
  if (spec.family === "LT PVC Power" || spec.family === "Control Cable") return "IS1554-1";

  // NO insulation-based fallback. An earlier version fell back to the insulation compound when
  // the family was unrecognised, on the theory that "XLPE implies IS 7098-1". It does not: an
  // aerial bunched cable is XLPE insulated and governed by IS 14255, and a solar cable is
  // cross-linked and governed by IS 17293. The fallback silently priced both against the LT
  // power chain — a number, and a wrong one.
  //
  // A family this function does not recognise is a gap. AB and solar have their own engines and
  // belong on their own paths; everything else has no encoded standard at all.
  return undefined;
}

/**
 * Translate a legacy spec into LT engine inputs.
 *
 * Only aluminium and copper are mappable: the engine's conductor tables are IS 8130's, which
 * cover those two. An alloy or ACSR conductor is a different standard and returns a gap rather
 * than being silently priced as aluminium — the densities differ by enough to matter.
 */
export function ltConfigFromLegacySpec(
  spec: Pick<CableSpec, "family" | "insulation" | "cores" | "conductorSizeSqMm" | "conductorMaterial" | "armour">,
): BridgeResult<LtCableConfig> {
  const standard = ltStandardFor(spec);
  if (!standard) {
    return { gap: true, reason: `No encoded LT standard for family "${spec.family ?? "(none)"}"` };
  }

  const coreCount = coreCountFor(spec.cores);
  if (coreCount == null) {
    return { gap: true, reason: `Core configuration "${spec.cores}" is not a number the chain can use` };
  }

  const material =
    spec.conductorMaterial === "Copper"
      ? ("CU" as const)
      : spec.conductorMaterial === "Aluminium"
        ? ("AL" as const)
        : undefined;
  if (!material) {
    return {
      gap: true,
      // Naming the material matters: "Aluminium Alloy" priced as aluminium would be wrong by the
      // density difference, and wrong quietly.
      reason: `Conductor material "${spec.conductorMaterial}" has no IS 8130 table in this system`,
    };
  }

  if (!Number.isFinite(spec.conductorSizeSqMm) || spec.conductorSizeSqMm <= 0) {
    return { gap: true, reason: "Conductor size is missing or not positive" };
  }

  return {
    standard,
    csaSqMm: spec.conductorSizeSqMm,
    coreCount,
    material,
    armoured: spec.armour !== "Unarmoured",
  };
}

/**
 * Per-layer mass for a legacy spec, in kg/m, ready for `computeLine`.
 *
 * Returns a gap rather than a number when the cable cannot be mapped. The caller must surface
 * that — a quote showing a conductor-only price is honest; one showing a full price assembled
 * from untraceable coefficients is not.
 *
 * Units: `deriveLtMass` works in kg/km, `computeLine` in kg/m. The division by 1000 happens here,
 * once, rather than at each call site.
 */
export function derivedLineMassFromLegacySpec(
  spec: Parameters<typeof ltConfigFromLegacySpec>[0],
): BridgeResult<{ insulationKgPerM: number; armourKgPerM: number; sheathKgPerM: number; workings: string }> {
  const config = ltConfigFromLegacySpec(spec);
  if (isBridgeGap(config)) return config;

  const mass = deriveLtMass(config);
  if (isMassGap(mass)) return { gap: true, reason: mass.missing };

  const kgPerMFor = (layers: string[]) =>
    mass.components
      .filter((c) => layers.includes(c.layer))
      .reduce((sum, c) => sum + c.massKgPerKm, 0) / 1000;

  return {
    insulationKgPerM: kgPerMFor(["Insulation"]),
    armourKgPerM: kgPerMFor(["Armour"]),
    // Both sheaths are one priced component — they are the same compound at the same rate.
    sheathKgPerM: kgPerMFor(["Inner sheath", "Outer sheath"]),
    workings: mass.workings,
  };
}

// ── Spec ⇄ builder ────────────────────────────────────────────────────────────────────────────
//
// WP-3: one cable record behind both builders. The quote writes a CableSpec; the GTP builder
// reads one back and reconstructs its own inputs from it, so a cable entered once can be both
// quoted and GTP'd without re-entry.
//
// These live here, beside the costing bridge, because they solve the same problem: the quote
// edits a flat CableSpec while the GTP engines want a discriminated construction. When WP-3's
// successor unifies the two models, this whole file goes.

/** Which GTP engine a stored spec belongs to. */
export function productLineFromSpec(spec: Pick<CableSpec, "family" | "insulation">): ProductLine | undefined {
  switch (spec.family) {
    case "Aerial Bunched Cable":
      return "AB_CABLE";
    case "LT XLPE Power":
      return "XLPE_POWER";
    case "LT PVC Power":
    case "Control Cable":
      return "PVC_CONTROL";
    case "Solar DC Cable":
      return "SOLAR_DC";
    default:
      // No insulation fallback, for the same reason ltStandardFor has none: XLPE does not imply
      // a standard, and guessing routes a cable to the wrong engine.
      return undefined;
  }
}

/** The GTP builder's cable inputs, reconstructed from a stored spec. */
export interface BuilderInputs {
  productLine: ProductLine;
  conductorMaterial: "AL" | "CU";
  /** AB only. */
  selection?: { coreCount: number; phaseSizeSqMm: number; streetLightSizeSqMm: number | null; messengerSizeSqMm: number };
  /** LT only. */
  ltConfig?: { csaSqMm: number; coreCount: number; armoured: boolean };
  /** Solar only. */
  solarConfig?: { csaSqMm: number };
}

/**
 * Rebuild the GTP builder's inputs from a stored cable.
 *
 * Returns a gap rather than a partial reconstruction: loading a cable that silently becomes a
 * DIFFERENT cable is worse than refusing to load it, because the operator would not notice.
 */
export function builderInputsFromSpec(spec: CableSpec): BridgeResult<BuilderInputs> {
  const productLine = productLineFromSpec(spec);
  if (!productLine) {
    return { gap: true, reason: `No GTP engine covers family "${spec.family ?? "(none)"}"` };
  }

  const conductorMaterial =
    spec.conductorMaterial === "Copper" || spec.conductorMaterial === "Tinned Copper" ? ("CU" as const) : ("AL" as const);

  if (productLine === "AB_CABLE") {
    // AB needs the per-conductor sizes, which only `aerialBunched` carries. A flat conductor
    // size cannot express a phase/messenger/street-light bundle.
    if (!spec.aerialBunched) {
      return { gap: true, reason: "An aerial bunched spec carries no phase/messenger sizes" };
    }
    return {
      productLine,
      conductorMaterial: "AL", // IS 14255 pins aluminium; the picker is not offered for AB.
      selection: {
        coreCount: spec.aerialBunched.phaseCount,
        phaseSizeSqMm: spec.aerialBunched.phaseSizeSqMm,
        streetLightSizeSqMm: spec.aerialBunched.streetLightSizeSqMm ?? null,
        messengerSizeSqMm: spec.aerialBunched.messengerSizeSqMm,
      },
    };
  }

  if (productLine === "SOLAR_DC") {
    return { productLine, conductorMaterial: "CU", solarConfig: { csaSqMm: spec.conductorSizeSqMm } };
  }

  const coreCount = coreCountFor(spec.cores);
  if (coreCount == null) {
    return { gap: true, reason: `Core configuration "${spec.cores}" is not a number the chain can use` };
  }
  return {
    productLine,
    conductorMaterial,
    ltConfig: { csaSqMm: spec.conductorSizeSqMm, coreCount, armoured: spec.armour !== "Unarmoured" },
  };
}

/**
 * Cable mass, derived from the build-up chain rather than estimated.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * The quote builder priced cable from tunable coefficients whose own header admitted they were
 * "engineering estimates so a quote is realistic without a full IS dimensional table". That table
 * now exists — the LT and solar engines derive every layer diameter and thickness from encoded IS
 * clauses — so the estimate was approximating something the system already knew exactly. On a
 * real AB cable the two disagreed by roughly 35%, on the metal that dominates the price.
 *
 * This module closes that gap for LT and solar. AB already derived its own mass in `derive.ts`
 * (`finishedBundle`), using the same annulus method; that code is left where it is and this
 * module deliberately mirrors its approach rather than replacing it.
 *
 * ─── The one identity everything rests on ─────────────────────────────────────────────────────
 *
 *     area (mm²) × density (g/cm³) ≡ mass (kg/km)
 *
 * because 1 mm² × 1 km = 1000 cm³, and 1000 cm³ × 1 g/cm³ = 1 kg. No conversion factor is
 * needed and none should be added — a stray ×1000 here is the most likely defect in this file,
 * which is why `massTest` pins the identity directly.
 *
 * ─── What is derived and what is assumed ──────────────────────────────────────────────────────
 *
 * DERIVED from IS tables, via the chain: every diameter, every wall thickness, the armour
 * dimension, the conductor cross-section.
 *
 * ASSUMED: material densities (below) and the lay-up factor. Densities are physical constants,
 * cited. The lay-up factor is a manufacturing reality — stranded cores travel further than the
 * cable is long — and is the one genuinely empirical number here. It is shared with `derive.ts`
 * so AB and LT cannot drift apart on it.
 *
 * NOT INVENTED: where a layer's dimension is not in the chain, this module returns a gap rather
 * than a plausible number. A quote priced on a fabricated mass is worse than a quote that
 * refuses to price.
 */
import type { LtCableConfig } from "./derive-lt";
import { deriveLtCable } from "./derive-lt";

/**
 * Material densities in g/cm³.
 *
 * Sources: aluminium and copper are the standard values used for conductor mass throughout the
 * cable industry (IS 8130 works to the same figures). Polymer densities are nominal compound
 * values — a real compound varies by a few percent with filler loading, which is inside the
 * tolerance the derived mass carries anyway.
 */
export const MATERIAL_DENSITY = {
  /** Aluminium, EC grade. */
  aluminium: 2.70,
  /** Annealed copper. */
  copper: 8.89,
  /** Cross-linked polyethylene — LT insulation under IS 7098-1, and solar under IS 17293. */
  xlpe: 0.92,
  /** PVC compound — LT insulation and sheath under IS 1554-1. */
  pvc: 1.40,
  /** Galvanised steel — round wire or formed strip armour. */
  galvanisedSteel: 7.85,
} as const;

/**
 * Stranding adds length: a core laid up helically travels further than the cable is long, so its
 * mass per km of CABLE exceeds its mass per km of CORE.
 *
 * Deliberately the same 1.03 `derive.ts` uses for AB. If these two ever diverge, AB and LT will
 * disagree about the same physics, so they are kept in one place conceptually even though the
 * constant is declared twice — a test asserts they match.
 */
export const LAY_UP_FACTOR = 1.03;

/** One layer's contribution, kept separate so a reviewer can see where the mass came from. */
export interface MassComponent {
  layer: string;
  massKgPerKm: number;
  /** How this layer's mass was arrived at, in the same voice as the chain's own traces. */
  workings: string;
}

export interface DerivedMass {
  totalKgPerKm: number;
  components: MassComponent[];
  /** One line naming every component, for the field's trace. */
  workings: string;
}

/**
 * A gap, not a guess.
 *
 * Returned instead of a mass when a layer's dimension is missing from the chain. The caller must
 * surface this rather than substituting a default — see the module header.
 */
export interface MassGap {
  gap: true;
  missing: string;
}

export type MassResult = DerivedMass | MassGap;

export function isMassGap(result: MassResult): result is MassGap {
  return "gap" in result;
}

/**
 * Mass of a solid round conductor of a given cross-section.
 *
 * Takes the CSA directly rather than deriving it from a diameter: the nominal cross-section is
 * what the standard specifies and what the conductor is sold as, and a stranded conductor's
 * circumscribed circle is larger than its metal area.
 */
export function conductorMassKgPerKm(csaSqMm: number, density: number, coreCount: number): number {
  return csaSqMm * density * coreCount;
}

/**
 * Mass of an annular layer — insulation, a sheath, anything extruded over a core.
 *
 * The annulus area is π·t·(d_inner + t), which is the exact area of a ring of wall `t` around a
 * circle of diameter `d_inner`. Written in that form rather than as π/4·(d_o² − d_i²) because it
 * makes the wall thickness explicit, and the wall is what the IS clause actually specifies.
 */
export function annulusMassKgPerKm(innerDiaMm: number, wallMm: number, density: number): number {
  if (wallMm <= 0) return 0;
  const areaMm2 = Math.PI * wallMm * (innerDiaMm + wallMm);
  return areaMm2 * density;
}

/**
 * Mass of round-wire armour.
 *
 * Round wires do NOT form a solid steel shell, and modelling them as one over-states the steel by
 * about 30% — enough to make armour outweigh the conductor on a large cable, which is visibly
 * wrong. The wires sit side by side on a pitch circle of (d_under_armour + d_wire); the number
 * that fits is the pitch circumference divided by one wire diameter, and the steel present is
 * that count times one wire's cross-section.
 *
 * This still ignores the lay angle (a helical wire is slightly longer than the cable) and the
 * small gap IS 3975 permits between wires. The first understates by ~1-2%, the second overstates;
 * IS 3975 is not held so neither is corrected for. Net error is well inside the ±5% the derived
 * mass carries.
 */
export function roundWireArmourMassKgPerKm(underArmourDiaMm: number, wireDiaMm: number): {
  massKgPerKm: number;
  wireCount: number;
} {
  const pitchDiaMm = underArmourDiaMm + wireDiaMm;
  const wireCount = Math.floor((Math.PI * pitchDiaMm) / wireDiaMm);
  const oneWireAreaMm2 = (Math.PI / 4) * wireDiaMm * wireDiaMm;
  return {
    massKgPerKm: wireCount * oneWireAreaMm2 * MATERIAL_DENSITY.galvanisedSteel,
    wireCount,
  };
}

/** Which polymer a standard uses for insulation and sheath. */
function polymerFor(standard: LtCableConfig["standard"]): { insulation: number; sheath: number; name: string } {
  // IS 7098-1 is XLPE insulated with a thermoplastic (PVC) sheath; IS 1554-1 is PVC throughout.
  return standard === "IS7098-1"
    ? { insulation: MATERIAL_DENSITY.xlpe, sheath: MATERIAL_DENSITY.pvc, name: "XLPE insulation, PVC sheath" }
    : { insulation: MATERIAL_DENSITY.pvc, sheath: MATERIAL_DENSITY.pvc, name: "PVC insulation and sheath" };
}

/**
 * Derive the mass of an LT power or control cable from its build-up chain.
 *
 * Walks the same steps the GTP prints, so a mass and a printed dimension can never disagree —
 * they are computed from one source. Every diameter used here is read from the chain, never
 * recomputed, for the same reason.
 */
export function deriveLtMass(config: LtCableConfig, walls: Record<string, number> = {}): MassResult {
  const chain = deriveLtCable(config);
  const byId = new Map(chain.steps.map((s) => [s.id, s.value]));
  const polymer = polymerFor(config.standard);
  // Build targets change the selected annulus only; standard lookup diameters remain nominal.
  const insulationMm = walls["lt.insulation"] ?? chain.insulationThicknessMm;
  const innerMm = walls["lt.innerSheath"] ?? chain.innerSheathThicknessMm;
  const outerMm = walls["lt.outerSheath"] ?? chain.outerSheathThicknessMm;
  const components: MassComponent[] = [];

  const conductorDensity =
    config.material === "CU" ? MATERIAL_DENSITY.copper : MATERIAL_DENSITY.aluminium;
  const conductorName = config.material === "CU" ? "copper" : "aluminium";

  // ── Conductor ─────────────────────────────────────────────────────────────────────────────
  // 3.5 core is three full cores plus a reduced neutral. The neutral's own CSA comes from the
  // chain, because the reduction is a table lookup and not a fixed fraction.
  const fullCores = config.coreCount === 3.5 ? 3 : config.coreCount;
  const conductorMass = conductorMassKgPerKm(config.csaSqMm, conductorDensity, fullCores);
  components.push({
    layer: "Conductor",
    massKgPerKm: conductorMass,
    workings: `${fullCores} × ${config.csaSqMm} sq mm ${conductorName} @ ${conductorDensity} g/cm³`,
  });

  if (config.coreCount === 3.5) {
    const neutralCsa = byId.get("neutral.reduced");
    if (neutralCsa == null) {
      return { gap: true, missing: "reduced neutral cross-section (chain step `neutral.reduced`)" };
    }
    const neutralMass = conductorMassKgPerKm(neutralCsa, conductorDensity, 1);
    components.push({
      layer: "Reduced neutral",
      massKgPerKm: neutralMass,
      workings: `1 × ${neutralCsa} sq mm ${conductorName} @ ${conductorDensity} g/cm³`,
    });
  }

  // ── Insulation ────────────────────────────────────────────────────────────────────────────
  // Applied over the fictitious conductor diameter, which is what the standard's build-up uses.
  const dL = byId.get("calc.dL");
  if (dL == null) return { gap: true, missing: "fictitious conductor diameter (chain step `calc.dL`)" };

  const insulationMass =
    annulusMassKgPerKm(dL, insulationMm, polymer.insulation) * fullCores;
  components.push({
    layer: "Insulation",
    massKgPerKm: insulationMass,
    workings: `${fullCores} cores × ${insulationMm} mm wall over ${dL.toFixed(2)} mm @ ${polymer.insulation} g/cm³`,
  });

  // ── Inner sheath ──────────────────────────────────────────────────────────────────────────
  // Only present on armoured constructions; the chain omits the step otherwise.
  // `null` means the construction genuinely has no inner sheath — not a missing value. A
  // single-core unarmoured cable has none, and the chain says so by omitting the thickness.
  const diaOverLaidUp = byId.get("calc.diaOverLaidUp");
  if (chain.innerSheathThicknessMm != null && chain.innerSheathThicknessMm > 0) {
    if (diaOverLaidUp == null) {
      return { gap: true, missing: "diameter over laid-up cores (chain step `calc.diaOverLaidUp`)" };
    }
    const innerSheathMass = annulusMassKgPerKm(
      diaOverLaidUp,
      innerMm!,
      polymer.sheath,
    );
    components.push({
      layer: "Inner sheath",
      massKgPerKm: innerSheathMass,
      workings: `${chain.innerSheathThicknessMm} mm over ${diaOverLaidUp.toFixed(2)} mm @ ${polymer.sheath} g/cm³`,
    });
  }

  // ── Armour ────────────────────────────────────────────────────────────────────────────────
  // The chain reports a WIRE DIAMETER here, not a wall thickness — see the step label, "Armour
  // round wire diameter". Treating it as a wall (a solid steel shell) over-states the steel by
  // ~30% and makes armour outweigh the conductor on a large cable. Wires are counted as wires.
  if (config.armoured && chain.armourDiaOrThicknessMm != null && chain.armourDiaOrThicknessMm > 0) {
    const diaUnderArmour = byId.get("calc.diaUnderArmour");
    if (diaUnderArmour == null) {
      return { gap: true, missing: "diameter under armour (chain step `calc.diaUnderArmour`)" };
    }
    if (chain.armourForm === "formed-wire") {
      components.push({ layer: "Armour",
        massKgPerKm: annulusMassKgPerKm(diaUnderArmour, chain.armourDiaOrThicknessMm, MATERIAL_DENSITY.galvanisedSteel),
        workings: `${chain.armourDiaOrThicknessMm} mm formed steel layer over ${diaUnderArmour.toFixed(2)} mm @ ${MATERIAL_DENSITY.galvanisedSteel} g/cm³ (continuous coverage approximation)`,
      });
    } else {
      const armour = roundWireArmourMassKgPerKm(diaUnderArmour, chain.armourDiaOrThicknessMm);
      components.push({
        layer: "Armour", massKgPerKm: armour.massKgPerKm,
        workings: `${armour.wireCount} × ${chain.armourDiaOrThicknessMm} mm GI wire on a ${(diaUnderArmour + chain.armourDiaOrThicknessMm).toFixed(2)} mm pitch circle @ ${MATERIAL_DENSITY.galvanisedSteel} g/cm³`,
      });
    }
  }

  // ── Outer sheath ──────────────────────────────────────────────────────────────────────────
  const diaUnderSheath = byId.get("calc.diaUnderSheath") ?? diaOverLaidUp;
  if (diaUnderSheath == null) {
    return { gap: true, missing: "diameter under outer sheath (chain step `calc.diaUnderSheath`)" };
  }
  const outerSheathMass = annulusMassKgPerKm(
    diaUnderSheath,
    outerMm,
    polymer.sheath,
  );
  components.push({
    layer: "Outer sheath",
    massKgPerKm: outerSheathMass,
    workings: `${chain.outerSheathThicknessMm} mm over ${diaUnderSheath.toFixed(2)} mm @ ${polymer.sheath} g/cm³`,
  });

  const rawTotal = components.reduce((sum, c) => sum + c.massKgPerKm, 0);
  const totalKgPerKm = rawTotal * LAY_UP_FACTOR;

  return {
    totalKgPerKm,
    components,
    workings:
      components.map((c) => `${c.layer} ${c.massKgPerKm.toFixed(0)}`).join(" + ") +
      ` kg/km × lay-up ${LAY_UP_FACTOR} = ${totalKgPerKm.toFixed(0)} kg/km`,
  };
}

/**
 * Derive the mass of a solar DC cable.
 *
 * Simpler than LT: single core, no armour, no lay-up (nothing is stranded around anything), so
 * the lay-up factor is deliberately NOT applied. Conductor is annealed tinned copper per
 * IS 17293 §4.1 — the tin coating is a few microns and is ignored, which understates mass by
 * far less than the compound density varies.
 */
export function deriveSolarMass(input: {
  csaSqMm: number;
  insulationThicknessMm: number;
  sheathThicknessMm: number;
  conductorDiaMm: number;
}): MassResult {
  if (input.conductorDiaMm <= 0) {
    return { gap: true, missing: "conductor diameter for a solar cable" };
  }

  const components: MassComponent[] = [];

  const conductorMass = conductorMassKgPerKm(input.csaSqMm, MATERIAL_DENSITY.copper, 1);
  components.push({
    layer: "Conductor",
    massKgPerKm: conductorMass,
    workings: `${input.csaSqMm} sq mm tinned copper @ ${MATERIAL_DENSITY.copper} g/cm³`,
  });

  const insulationMass = annulusMassKgPerKm(
    input.conductorDiaMm,
    input.insulationThicknessMm,
    MATERIAL_DENSITY.xlpe,
  );
  components.push({
    layer: "Insulation",
    massKgPerKm: insulationMass,
    workings: `${input.insulationThicknessMm} mm over ${input.conductorDiaMm.toFixed(2)} mm @ ${MATERIAL_DENSITY.xlpe} g/cm³`,
  });

  const diaOverInsulation = input.conductorDiaMm + 2 * input.insulationThicknessMm;
  const sheathMass = annulusMassKgPerKm(
    diaOverInsulation,
    input.sheathThicknessMm,
    MATERIAL_DENSITY.xlpe,
  );
  components.push({
    layer: "Sheath",
    massKgPerKm: sheathMass,
    workings: `${input.sheathThicknessMm} mm over ${diaOverInsulation.toFixed(2)} mm @ ${MATERIAL_DENSITY.xlpe} g/cm³`,
  });

  const totalKgPerKm = components.reduce((sum, c) => sum + c.massKgPerKm, 0);

  return {
    totalKgPerKm,
    components,
    // No lay-up factor: a single-core cable has nothing laid up. Said explicitly so the absence
    // reads as a decision rather than an omission.
    workings:
      components.map((c) => `${c.layer} ${c.massKgPerKm.toFixed(1)}`).join(" + ") +
      ` kg/km (single core — no lay-up) = ${totalKgPerKm.toFixed(1)} kg/km`,
  };
}

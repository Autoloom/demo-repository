/**
 * LT power / control derivation — the sequential build-up chain.
 *
 * This is the chain the cable-type registry describes, executed. Unlike AB cable (where every
 * value is a flat lookup on conductor size), here each step's OUTPUT is the next step's LOOKUP
 * KEY, because IS 7098-1 Tables 5/6/7 and IS 1554-1 Tables 4/5/7 are keyed by a calculated
 * diameter rather than by conductor size:
 *
 *   conductor size ─→ d_L        (IS 10462 Table 1)
 *                  ─→ D_c        (§3.2, needs insulation thickness from the cable standard)
 *                  ─→ D_f        (§3.3, needs the assembly coefficient for the core count)
 *                  ─→ inner sheath thickness   (keyed by D_f)
 *                  ─→ D_B        (§3.4)
 *                  ─→ armour dimensions        (keyed by D_B)
 *                  ─→ D_X        (§3.5)
 *                  ─→ outer sheath thickness   (keyed by D_X)
 *
 * Every diameter is rounded to 0.1 mm before it becomes the next key (IS 10462 §0.7), which
 * is handled inside the fictitious-chain functions.
 *
 * ONE ENGINE, TWO STANDARDS. XLPE and PVC differ only in insulation thickness and thermal
 * rating; the chain itself is identical, so `standard` selects the dataset rather than the code
 * path. That is the shared-schema lever the registry was built for.
 */
import {
  assemblyCoefficient, fictitiousConductorDiameter, fictitiousCoreDiameter,
  fictitiousLaidUpDiameter, fictitiousOverArmour, fictitiousOverInnerSheath,
} from "@/lib/domain/standards/is10462-1-1983";
import { pvcInsulationThickness, reducedNeutralSize as pvcReducedNeutral } from "@/lib/domain/standards/is1554-1-1988";
import { reducedNeutralSize as xlpeReducedNeutral, xlpeInsulationThickness } from "@/lib/domain/standards/is7098-1-2025";
import type { ConductorMaterialCode } from "@/lib/domain/standards/is8130-2013";
import { IS8130_2013_TABLE2_STRANDED, findConductor } from "@/lib/domain/standards/is8130-2013";
import type { ConductorForm } from "@/lib/domain/standards/is8130-2013";
import {
  armourDimensions, formedWireThickness, formedWireWidthMm, innerSheathThickness, outerSheathThickness,
  FORMED_WIRE_WIDTH_REF,
} from "@/lib/domain/standards/protective-coverings";
import type { ArmourMethod, CoveringStandard } from "@/lib/domain/standards/protective-coverings";
import type { ConductorShape } from "./cable-types";

export interface LtCableConfig {
  standard: CoveringStandard;
  /** Input used by the IS 8130 lookup; this engine supports Class 2. */
  conductorClass?: "Class 2";
  csaSqMm: number;
  /** 3.5 means three full cores plus a reduced neutral. */
  coreCount: number;
  material: ConductorMaterialCode;
  armoured: boolean;
  /** Armour style. Ignored when the calculated diameter forces round wire (≤ 13 mm). */
  armourForm?: "round-wire" | "formed-wire";
  /**
   * Which of the standard's two armouring practices to apply to formed wire (strip).
   * Defaults to A — the flat 0.8 mm strip, which is the size in common use and the one the
   * manufacturer asked for ("Galvanised Steel Strip Armour size 4 × 0.8 mm ... very widely
   * used"). Has no effect on round wire, which has only one table.
   */
  armourMethod?: ArmourMethod;
  /**
   * Conductor shape. LT power aluminium is generally sector-shaped and compacted, and the GTP
   * has to say so — an inspector checks the conductor form against the sheet.
   *
   * DELIBERATELY NOT USED IN THE FICTITIOUS CHAIN. IS 10462 (Part 1) §0.3 ignores conductor
   * shape and compactness by design, so that every manufacturer keying into the sheath and
   * armour tables lands on the same row for the same cable. A 3-core 70 sq mm cable has a
   * fictitious conductor diameter of 9.4 mm whether the real conductor measures 9.44 circular
   * or is sector-shaped and not round at all. Making shape move those lookups would select a
   * DIFFERENT sheath thickness from the one the standard prescribes. `shapeDoesNotMoveTheChain`
   * in the tests pins this.
   *
   * The real overall diameter of a sector cable IS smaller, and §0.4 says that figure "should be
   * calculated separately" — it is not this method's output and we do not hold a source for it.
   */
  shape?: ConductorShape;
}

/** One traced step, carrying the value AND where it came from. */
export interface LtStep {
  id: string;
  label: string;
  value: number;
  unit: "mm" | "sq mm" | "ohm/km";
  ref: string;
  /** The key this step was looked up by — the thing that makes the chain auditable. */
  keyedBy?: string;
}

export interface LtDerivation {
  armourForm: "round-wire" | "formed-wire" | null;
  steps: LtStep[];
  /** Fictitious diameter over the armour, or over the inner sheath when unarmoured. */
  calculatedDiaUnderOuterSheathMm: number;
  insulationThicknessMm: number;
  innerSheathThicknessMm: number | null;
  armourDiaOrThicknessMm: number | null;
  /** Nominal strip width, printed only — it takes no part in the dimensional build-up. */
  armourWidthMm: number | null;
  /** Which of the standard's two armouring practices produced the formed-wire thickness. */
  armourMethod: ArmourMethod | null;
  outerSheathThicknessMm: number;
}

const REDUCED_NEUTRAL_CORE_COUNT = 3.5;

/**
 * Which IS 8130 construction form applies at a given size.
 *
 * Table 2 specifies compacted wire counts only from 10 sq mm (copper) / 16 sq mm (aluminium)
 * upward — below that the cell is a dash and only the circular non-compacted column exists.
 * Asking for a compacted conductor at 1.5 sq mm is asking for a row the standard does not have.
 */
function conductorFormFor(csaSqMm: number, material: ConductorMaterialCode): ConductorForm {
  const row = IS8130_2013_TABLE2_STRANDED.find((r) => r.csaSqMm === csaSqMm);
  const compactedMin = material === "AL" ? row?.minWiresCompactedAl : row?.minWiresCompactedCu;
  return compactedMin == null ? "circular-non-compacted" : "compacted-or-shaped";
}

/**
 * Run the chain.
 *
 * Throws rather than defaulting at every step — a cable the standards do not cover must not
 * silently produce a GTP.
 */
export function deriveLtCable(config: LtCableConfig): LtDerivation {
  const steps: LtStep[] = [];
  const isXlpe = config.standard === "IS7098-1";

  // ── Conductor ───────────────────────────────────────────────────────────────────────────
  const conductor = findConductor({
    csaSqMm: config.csaSqMm,
    material: config.material,
    klass: config.conductorClass ?? "Class 2",
    form: conductorFormFor(config.csaSqMm, config.material),
  });
  steps.push({
    id: "conductor.resistance",
    label: "Max DC resistance at 20 °C",
    value: conductor.maxDcResistanceOhmPerKm,
    unit: "ohm/km",
    ref: conductor.ref,
  });

  // ── Insulation (the one place the two standards genuinely differ) ────────────────────────
  const insulation = isXlpe
    ? xlpeInsulationThickness({ csaSqMm: config.csaSqMm, coreCount: config.coreCount, armoured: config.armoured })
    : pvcInsulationThickness({ csaSqMm: config.csaSqMm, coreCount: config.coreCount, armoured: config.armoured });
  steps.push({
    id: "insulation",
    label: `Insulation thickness (${insulation.column})`,
    value: insulation.nominalMm,
    unit: "mm",
    ref: insulation.ref,
  });

  // ── Fictitious conductor and core diameter ──────────────────────────────────────────────
  const dL = fictitiousConductorDiameter(config.csaSqMm, "fixed");
  steps.push({
    id: "calc.dL",
    label: "Fictitious conductor diameter (d_L)",
    value: dL,
    unit: "mm",
    ref: "IS 10462 (Part 1) : 1983, Table 1",
    keyedBy: `${config.csaSqMm} sq mm`,
  });

  const dC = fictitiousCoreDiameter({ dLMm: dL, insulationThicknessMm: insulation.nominalMm });
  steps.push({
    id: "calc.diaOverCore",
    label: "Fictitious core diameter (D_c)",
    value: dC,
    unit: "mm",
    ref: "IS 10462 (Part 1) : 1983, §3.2",
    keyedBy: `d_L ${dL} + 2 × ${insulation.nominalMm}`,
  });

  // ── Lay-up ──────────────────────────────────────────────────────────────────────────────
  let dF: number;
  if (config.coreCount === REDUCED_NEUTRAL_CORE_COUNT) {
    // 3½ core: three full cores plus a reduced neutral, each with its own insulation thickness.
    const neutral = isXlpe ? xlpeReducedNeutral(config.csaSqMm) : pvcReducedNeutral(config.csaSqMm);
    steps.push({
      id: "neutral.reduced",
      label: "Reduced neutral size",
      value: neutral.neutralSqMm,
      unit: "sq mm",
      ref: neutral.ref,
    });

    const neutralInsulation = isXlpe
      ? xlpeInsulationThickness({ csaSqMm: neutral.neutralSqMm, coreCount: config.coreCount, armoured: config.armoured })
      : pvcInsulationThickness({ csaSqMm: neutral.neutralSqMm, coreCount: config.coreCount, armoured: config.armoured });
    const neutralDL = fictitiousConductorDiameter(neutral.neutralSqMm, "fixed");
    const neutralDC = fictitiousCoreDiameter({
      dLMm: neutralDL,
      insulationThicknessMm: neutralInsulation.nominalMm,
    });
    steps.push({
      id: "calc.diaOverCore.neutral",
      label: "Fictitious core diameter, reduced neutral (D_c2)",
      value: neutralDC,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.2",
    });

    dF = fictitiousLaidUpDiameter({ form: "threeAndHalf", fullCoreDMm: dC, halfCoreDMm: neutralDC });
    steps.push({
      id: "calc.diaOverLaidUp",
      label: "Fictitious diameter over laid-up cores (D_f, 3½ core)",
      value: dF,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.3(b)",
      keyedBy: `2.42 × (3 × ${dC} + ${neutralDC}) / 4`,
    });
  } else if (config.coreCount === 1) {
    // Single-core cables are not laid up — the core IS the bundle.
    dF = dC;
    steps.push({
      id: "calc.diaOverLaidUp",
      label: "Fictitious diameter over core (single core, no lay-up)",
      value: dF,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.3",
    });
  } else {
    const k = assemblyCoefficient(config.coreCount);
    dF = fictitiousLaidUpDiameter({ form: "uniform", cores: config.coreCount, dCMm: dC });
    steps.push({
      id: "calc.diaOverLaidUp",
      label: "Fictitious diameter over laid-up cores (D_f)",
      value: dF,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.3(a) + Table 3",
      keyedBy: `k = ${k} (${config.coreCount} cores) × D_c ${dC}`,
    });
  }

  // ── Inner sheath — the first table keyed by a calculated diameter ────────────────────────
  // §13.3 / §12.3: single-core cables have no inner sheath.
  let dB = dF;
  let innerSheathMm: number | null = null;
  if (config.coreCount > 1) {
    const inner = innerSheathThickness(config.standard, dF);
    innerSheathMm = inner.values.minThicknessMm;
    steps.push({
      id: "innerSheath",
      label: "Inner sheath thickness (min)",
      value: innerSheathMm,
      unit: "mm",
      ref: inner.ref,
      keyedBy: `calculated diameter over laid-up cores = ${dF} mm`,
    });

    dB = fictitiousOverInnerSheath(dF, innerSheathMm);
    steps.push({
      id: "calc.diaUnderArmour",
      label: "Fictitious diameter over inner sheath (D_B = under armour)",
      value: dB,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.4",
      keyedBy: `D_f ${dF} + 2 × ${innerSheathMm}`,
    });
  }

  // ── Armour ──────────────────────────────────────────────────────────────────────────────
  let dX = dB;
  let armourMm: number | null = null;
  let armourWidthMm: number | null = null;
  let armourForm: LtDerivation["armourForm"] = null;
  if (config.armoured) {
    const armour = armourDimensions(config.standard, dB);
    const method: ArmourMethod = config.armourMethod ?? "A";
    // Below 13 mm the standards permit round wire only, whatever was asked for.
    const formed =
      armour.values.roundWireOnly || (config.armourForm ?? "round-wire") === "round-wire"
        ? null
        : formedWireThickness(config.standard, dB, method);

    armourForm = formed ? "formed-wire" : "round-wire";
    armourMm = formed ? formed.values.thicknessMm : armour.values.roundWireDiaMm;
    if (armourMm === null) throw new Error(`No armour dimension at ${dB} mm`);

    steps.push({
      id: "armour",
      label: formed ? "Armour formed wire thickness" : "Armour round wire diameter",
      value: armourMm,
      unit: "mm",
      ref: formed ? formed.ref : armour.ref,
      keyedBy: `calculated diameter under armour = ${dB} mm`,
    });

    // Width is printed, never load-bearing: the steel area of a strip layer is π(D + t)·t, in
    // which width cancels. Emitted as its own step so the GTP can say "4.0 × 0.8 mm" with a
    // citation, and so a reviewer can see it took no part in the build-up.
    if (formed) {
      armourWidthMm = formedWireWidthMm(formed.values.thicknessMm);
      if (armourWidthMm !== null) {
        steps.push({
          id: "armour.width",
          label: "Armour formed wire width (nominal)",
          value: armourWidthMm,
          unit: "mm",
          ref: FORMED_WIRE_WIDTH_REF,
          keyedBy: `paired to ${formed.values.thicknessMm} mm thickness`,
        });
      }
    }

    dX = fictitiousOverArmour(dB, armourMm);
    steps.push({
      id: "calc.diaUnderSheath",
      label: "Fictitious diameter over armour (D_X = under outer sheath)",
      value: dX,
      unit: "mm",
      ref: "IS 10462 (Part 1) : 1983, §3.5",
      keyedBy: `D_B ${dB} + 2 × ${armourMm}`,
    });
  }

  // ── Outer sheath ────────────────────────────────────────────────────────────────────────
  const outer = outerSheathThickness(config.standard, dX);
  const outerMm = config.armoured ? outer.values.armouredMinMm : outer.values.unarmouredNominalMm;
  steps.push({
    id: "outerSheath",
    label: config.armoured ? "Outer sheath thickness (min, armoured)" : "Outer sheath thickness (nominal)",
    value: outerMm,
    unit: "mm",
    ref: outer.ref,
    keyedBy: `calculated diameter under outer sheath = ${dX} mm`,
  });

  for (const step of steps) {
    if (!step.ref) throw new Error(`Step ${step.id} has no provenance — it must not reach a GTP`);
  }

  return {
    steps,
    armourForm,
    calculatedDiaUnderOuterSheathMm: dX,
    insulationThicknessMm: insulation.nominalMm,
    innerSheathThicknessMm: innerSheathMm,
    armourDiaOrThicknessMm: armourMm,
    armourWidthMm,
    armourMethod: armourForm === "formed-wire" ? (config.armourMethod ?? "A") : null,
    outerSheathThicknessMm: outerMm,
  };
}

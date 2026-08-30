/**
 * Derivation engine (PRD P0-3 / design-doc §1.2).
 *
 * Input: a parsed CableConstruction (+ optional customer quirks).
 * Output: ResolvedField[] — every field tagged LOOKUP/CALC/CHOICE/QUIRK/FIXED with a trace.
 *
 * Rules honoured here:
 *   • LOOKUP fields are read from the versioned IS tables; each carries the table's `ref`.
 *   • CALC fields are computed from other fields AND their inputs are known, so validation can
 *     independently re-check them (the engine never trusts a typed number it can compute).
 *   • QUIRK fields apply the customer profile over the base (e.g. WBSEDCL "(Min)" phrasing).
 *   • A missing table row yields a `gap: true` field rather than throwing — surfaced in the UI.
 *
 * This is pure: no UI imports, no service calls, deterministic for a given construction+quirks.
 */
import { findMessengerRow } from "@/lib/domain/standards/is398-4";
import { IS14255_1995_LAY, findPhaseRow, insulationToleranceFloorMm } from "@/lib/domain/standards/is14255-1995";
import { IS8130_2013_TABLE2_STRANDED, findConductor } from "@/lib/domain/standards/is8130-2013";
import type { ConductorForm, ConductorMaterialCode } from "@/lib/domain/standards/is8130-2013";
import { findWorksConductor, unverifiedWorksDataWarning } from "@/lib/domain/standards/works-conductor-data";

import { bandTolerance, floorTolerance, notApplicable, withMandatoryTolerance } from "./tolerance";
import type { CableConstruction, ConductorGroup, ResolvedField } from "./types";

/** Customer quirks that shape derivation (subset of CustomerProfile, design-doc §1.4). */
export interface DerivationQuirks {
  /**
   * @deprecated Affects trace wording only — no longer changes any printed value.
   * It once selected between "(Min)" and "±5%" suffixes, but the "±5%" was invented: IS 14255
   * §7.3 gives a floor, not a band. Both conventions now resolve to that floor in the tolerance
   * column. Kept because customer profiles and stored templates still carry it.
   */
  tolerancePhrasing?: "min" | "plusminus"; // WBSEDCL uses "(Min)"
  sagPercent?: number; // WBSEDCL 1.5 (not the 3% default)
  layRatioFactor?: number; // WBSEDCL 0.995
  customerName?: string; // for trace text
  /** Bare Al-alloy (DHBVN §1.5.2.1) vs covered/insulated (WBSEDCL). */
  messengerConstruction?: "bare" | "covered";
  /** Verbatim embossing/marking legend the buyer demands. */
  markingLegend?: string;
  embossingIntervalM?: number;
  /** Core identification, e.g. "1/2/3 ridges" (WBSEDCL) vs "three ridges on all phases" (DHBVN). */
  coreIdentification?: string;
  drumLengthM?: number;
  drumLengthTolerance?: string; // e.g. "±5%"
  /**
   * Conductor material. AB cable is aluminium by definition (IS 14255), but LT power and control
   * are built in both — the manufacturer runs aluminium, while most control specs in the corpus
   * are copper. IS 8130 Table 2 covers both fully, and the wire-count minima genuinely differ
   * (4 sq mm: 7 wires for Cu, 3 for Al), so this is a real branch, not a label swap.
   */
  conductorMaterial?: ConductorMaterialCode;
}

const FIXED = {
  manufacturer: "Navya Cables Pvt. Ltd.", // GAP: exact legal name/address as printed (T1-5)
  isiLicence: "CM/L-1234567", // GAP: real ISI/CML licence number + validity (T1-5)
  ratedVoltage: "1100 V (LT), 3-phase 440 V system", // IS 14255 scope
  maxConductorTempC: 90, // XLPE continuous (KRYFS §0.5: 90°C cont. / 250°C short-time)
  shortCircuitTempC: 250,
  strandTensileMinNPerMm2: 90, // DHBVN CSC-69 §1.5.1(b): ≥90 N/mm²
};

/**
 * How a customer words a thickness tolerance — trace text only, never the number.
 *
 * This used to be `phraseThickness()`, which appended either "(Min)" or "±5%" to the value. The
 * "±5%" had no basis in IS 14255: §7.3 specifies a floor of t − (0.1 + 0.1·t), which at 1.50 mm
 * is 1.25 mm, not ±0.075 mm. Both discoms now get that floor in the tolerance column, and the
 * only thing their profile still affects is whose convention the trace names.
 */
function phrasingNote(quirks: DerivationQuirks): string {
  return quirks.tolerancePhrasing === "min"
    ? ` — ${quirks.customerName ?? "Customer"} prints thicknesses as "(Min)"`
    : "";
}


/**
 * Which construction form IS 8130 specifies for a size/material.
 *
 * Table 2 gives compacted minima only from 10 sq mm (copper) / 16 sq mm (aluminium) upward;
 * below that the cell is a dash and only the circular non-compacted column applies.
 */
function conductorFormFor(csaSqMm: number, material: ConductorMaterialCode): ConductorForm {
  const row = IS8130_2013_TABLE2_STRANDED.find((r) => r.csaSqMm === csaSqMm);
  const compactedMin = material === "AL" ? row?.minWiresCompactedAl : row?.minWiresCompactedCu;
  return compactedMin == null ? "circular-non-compacted" : "compacted-or-shaped";
}

function powerFields(group: ConductorGroup, quirks: DerivationQuirks): ResolvedField[] {
  const size = group.sizeSqMm;
  // Two DIFFERENT sources, deliberately kept apart (see works-conductor-data.ts):
  //   • IS 8130 gives the max DC resistance — the only conductor property the standard specifies.
  //   • Works data gives the physical construction (wires, wire dia, conductor dia), because
  //     IS 8130 specifies no dimensions at all for Class 2 (§3.2).
  // Tagging works dimensions as an IS lookup would be a provenance claim that fails inspection.
  const material = quirks.conductorMaterial ?? "AL";
  // IS 8130 Table 2 has no compacted wire count below 10 sq mm (the cell is a dash) — small
  // conductors are made circular non-compacted. Ask for the form the standard actually
  // specifies rather than assuming compacted and tripping the no-fallback lookup.
  const form = conductorFormFor(size, material);
  const conductor = findWorksConductor(size, { material, form });
  const isSpec = (() => {
    try {
      return findConductor({ csaSqMm: size, material, klass: "Class 2", form });
    } catch {
      return undefined;
    }
  })();
  const phase = findPhaseRow(size);
  if (!isSpec) return [];
  const fields: ResolvedField[] = [];

  if (!conductor) {
    fields.push({
      key: "power.strands",
      label: "No. of strands (power)",
      value: "—",
      tag: "LOOKUP",
      source: "is-table",
      trace: `No IS 8130 row for ${size} sq mm`,
      editable: false,
      gap: true,
    });
    return fields;
  }

  fields.push({
    key: "power.strands",
    label: "No. of strands (power)",
    value: conductor.wires,
    tag: "LOOKUP",
    // The COUNT is our construction; the MINIMUM it must meet is the standard's. The trace
    // carries both so a reviewer can see the constraint as well as the choice.
    source: "works-data",
    trace: `${conductor.wires} wires — ${conductor.origin}. IS 8130 Table 2 minimum for this size is ${isSpec.minWires}.`,
    editable: false,
  });
  fields.push({
    key: "power.strandDia",
    label: "Min strand diameter (power)",
    value: `${conductor.wireDiaMm.toFixed(2)} mm`,
    tag: "LOOKUP",
    source: "works-data",
    trace: conductor.origin,
    editable: false,
  });
  // Buyer schedules (DHBVN Appendix-I 3.iii) ask for "No. & size of strands" as ONE cell.
  fields.push({
    key: "power.strandsAndSize",
    label: "No. & size of strands (power)",
    value: `${conductor.wires} / ${conductor.wireDiaMm.toFixed(2)} mm`,
    tag: "CALC",
    source: "calc",
    trace: `${conductor.wires} wires × ${conductor.wireDiaMm.toFixed(2)} mm — ${conductor.origin}`,
    editable: false,
  });
  fields.push({
    key: "power.strandTensile",
    label: "Min tensile strength of each strand",
    value: `${FIXED.strandTensileMinNPerMm2} N/mm²`,
    tag: "FIXED",
    source: "profile",
    trace: "DHBVN CSC-69 §1.5.1(b): not less than 90 N/mm²",
    editable: false,
  });
  fields.push({
    key: "power.compactedDia",
    label: "Compacted conductor dia (power)",
    value: `${conductor.conductorDiaMm.toFixed(2)} mm`,
    tag: "LOOKUP",
    source: "works-data",
    trace: conductor.verified
      ? conductor.origin
      : `${conductor.origin}. ${unverifiedWorksDataWarning}`,
    editable: false,
  });
  fields.push({
    key: "power.maxDcResistance",
    label: "Max DC resistance @20°C (power)",
    // The one conductor property IS 8130 actually specifies — and the property a conductor is
    // judged conformant by (§3.2 / §7.3.1). This is a genuine standards lookup.
    value: `${isSpec.maxDcResistanceOhmPerKm} ohm/km`,
    tag: "LOOKUP",
    source: "is-table",
    trace: isSpec.ref,
    editable: false,
    // Not "no tolerance stated" but "a tolerance would be meaningless": the figure IS the upper
    // limit, so a band around it would permit conductors the standard rejects.
    tolerance: notApplicable("Already a maximum — IS 8130 §3.2 states the limit, not a nominal"),
  });

  if (phase) {
    fields.push({
      key: "power.insulationThickness",
      label: "Insulation thickness (power)",
      value: `${phase.insulationThicknessMinMm.toFixed(2)} mm`,
      // The customer's phrasing used to flip these to QUIRK/profile. It no longer does: the
      // value is read straight from the IS 14255 table in every case, so calling it a customer
      // quirk because of a word in a different column would misstate where the number came from.
      tag: "LOOKUP",
      source: "is-table",
      trace: phase.ref,
      editable: false,
      tolerance: floorTolerance(
        phase.insulationThicknessMinMm,
        insulationToleranceFloorMm(phase.insulationThicknessMinMm),
        `IS 14255 : 1995, §7.3 — nominal ${phase.insulationThicknessMinMm.toFixed(2)} − (0.1 + 0.1 × ${phase.insulationThicknessMinMm.toFixed(2)})${phrasingNote(quirks)}`,
      ),
    });

    // CALC: dia over insulation = compacted dia + 2 × insulation thickness.
    const diaOverInsulation = conductor.conductorDiaMm + 2 * phase.insulationThicknessMinMm;
    fields.push({
      key: "power.diaOverInsulation",
      label: "Dia over insulation (power)",
      value: `${diaOverInsulation.toFixed(2)} mm`,
      tag: "CALC",
      source: "calc",
      trace: `${conductor.conductorDiaMm} + 2 × ${phase.insulationThicknessMinMm} = ${diaOverInsulation.toFixed(2)} mm`,
      editable: false,
    });
    fields.push({
      key: "power.currentRating",
      label: "Current rating (power)",
      value: `${phase.currentRatingA} A @ ${phase.currentRatingRefTempC}°C`,
      tag: "LOOKUP",
      source: "is-table",
      trace: phase.ref,
      editable: false,
    });
  }

  if (conductor.massKgPerKm != null) {
    fields.push({
      key: "power.massPerKm",
      label: "Approx mass (power core)",
      value: `${conductor.massKgPerKm} kg/km`,
      tag: "LOOKUP",
      source: "works-data",
      trace: conductor.origin,
      editable: false,
      // A works manufacturing spread, NOT a standards limit — IS 14255 specifies no mass
      // tolerance at all. Marked `works-estimate` so it can never be read as an acceptance
      // criterion an inspector could reject a drum against.
      //
      // The trace deliberately omits `conductor.origin`: that string ends in an internal works
      // spec clause ("spec §0.5"), and a § sitting beside a tolerance reads as a BIS citation.
      // The origin is already on the field's own trace, where it means what it says.
      tolerance: bandTolerance("±3%", "works-estimate", "Works manufacturing spread on an approximate mass"),
    });
  }

  return fields;
}

function messengerFields(group: ConductorGroup): ResolvedField[] {
  const size = group.sizeSqMm;
  const row = findMessengerRow(size);
  if (!row) {
    return [
      {
        key: "messenger.strands",
        label: "No. of strands (messenger)",
        value: "—",
        tag: "LOOKUP",
        source: "is-table",
        trace: `No IS 398-4 row for ${size} sq mm`,
        editable: false,
        gap: true,
      },
    ];
  }
  return [
    { key: "messenger.size", label: "Messenger size", value: `${size} sq mm`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    { key: "messenger.strands", label: "No. of strands (messenger)", value: row.strands, tag: "LOOKUP", source: "is-table", trace: `${row.strands} — ${row.ref}`, editable: false },
    { key: "messenger.compactedDia", label: "Compacted dia (messenger)", value: `${row.compactedDiaMm.toFixed(2)} mm`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    { key: "messenger.breakingLoad", label: "Breaking load (messenger)", value: `${row.breakingLoadKN} kN`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    { key: "messenger.resistance", label: "Max DC resistance (messenger)", value: `${row.maxDcResistanceOhmPerKm} ohm/km`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    { key: "messenger.currentRating", label: "Current rating (messenger)", value: `${row.currentRatingA} A`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    { key: "messenger.expansion", label: "Expansion coefficient (messenger)", value: `${(row.expansionPerC * 1e6).toFixed(1)}×10⁻⁶/°C`, tag: "LOOKUP", source: "is-table", trace: row.ref, editable: false },
    // Appendix-I 4.ii wants "No. & size of strands" as one cell for the messenger too.
    { key: "messenger.strandsAndSize", label: "No. & size of strands (messenger)", value: `${row.strands} / ${(row.compactedDiaMm / 3).toFixed(2)} mm`, tag: "CALC", source: "calc", trace: `${row.strands} strands, compacted dia ${row.compactedDiaMm} mm — ${row.ref}`, editable: false },
  ];
}

/**
 * Finished-cable, drum, and compliance fields (DHBVN Appendix-I items 2, 6, 7–14).
 * Buyer schedules reject blank cells, so every one of these must resolve or be flagged as a gap.
 */
/**
 * Physical constants for the finished-cable CALCs. Sourced values, kept named and in one place so
 * a production engineer can tune them (corpus plan T2-7) without hunting through the code.
 */
const PHYSICAL = {
  /** Aluminium density, g/cm³ — conductor mass. */
  aluminiumDensity: 2.7,
  /** Al-Mg-Si alloy density, g/cm³ (messenger). */
  alloyDensity: 2.7,
  /** XLPE density, g/cm³ — insulation mass. */
  xlpeDensity: 0.92,
  /**
   * Bundle-diameter factor: an AB bundle of n twisted cores is roughly this multiple of one
   * insulated core's diameter. ~2.4 for the common 4-wire bundle; scaled by core count below.
   */
  bundleDiaFactor: 2.4,
  /** Stranding adds length per unit of cable — mass is scaled by this. */
  layUpFactor: 1.03,
} as const;

/**
 * Overall diameter and total mass of the finished bundle.
 *
 * These are the two fields buyer schedules ask for (DHBVN Appendix-I 6.i/6.ii) that can't be read
 * from a table — they follow from the construction. Computed as ESTIMATES and labelled "approx."
 * exactly as the schedules do; they are marked CALC with their working in the trace so an engineer
 * can check them.
 */
function finishedBundle(
  groups: ConductorGroup[],
): { overallDiaMm: number; massKgPerKm: number; workings: string } | undefined {
  let conductorMassKgPerKm = 0;
  let insulationMassKgPerKm = 0;
  let largestInsulatedDiaMm = 0;
  let coreCount = 0;

  for (const g of groups) {
    const isMessenger = g.role === "messenger";
    const conductor = isMessenger ? findMessengerRow(g.sizeSqMm) : findWorksConductor(g.sizeSqMm);
    if (!conductor) return undefined; // an unsourced size means we must not invent a number
    const phase = isMessenger ? undefined : findPhaseRow(g.sizeSqMm);
    if (!isMessenger && !phase) return undefined;

    const density = isMessenger ? PHYSICAL.alloyDensity : PHYSICAL.aluminiumDensity;
    // area (mm²) × density (g/cm³) = kg/km, since 1 mm²·1 km = 1000 cm³ → g/cm³ ≡ kg/km per mm².
    conductorMassKgPerKm += g.count * g.sizeSqMm * density;
    coreCount += g.count;

    if (phase) {
      const conductorDia = "conductorDiaMm" in conductor ? conductor.conductorDiaMm : conductor.compactedDiaMm;
      const wall = phase.insulationThicknessMinMm;
      const insulatedDia = conductorDia + 2 * wall;
      largestInsulatedDiaMm = Math.max(largestInsulatedDiaMm, insulatedDia);
      // Annulus area of the insulation wall, mm² → kg/km via density.
      const annulusMm2 = Math.PI * wall * (conductorDia + wall);
      insulationMassKgPerKm += g.count * annulusMm2 * PHYSICAL.xlpeDensity;
    } else {
      largestInsulatedDiaMm = Math.max(largestInsulatedDiaMm, "conductorDiaMm" in conductor ? conductor.conductorDiaMm : conductor.compactedDiaMm);
    }
  }

  // Bundle diameter scales with how many cores are twisted together, not just the largest core.
  const bundleFactor = PHYSICAL.bundleDiaFactor * Math.sqrt(Math.max(coreCount, 1) / 4);
  const overallDiaMm = largestInsulatedDiaMm * bundleFactor;
  const massKgPerKm = (conductorMassKgPerKm + insulationMassKgPerKm) * PHYSICAL.layUpFactor;

  return {
    overallDiaMm,
    massKgPerKm,
    workings:
      `largest insulated core ${largestInsulatedDiaMm.toFixed(2)} mm × bundle factor ` +
      `${bundleFactor.toFixed(2)} (${coreCount} cores); mass = conductor ` +
      `${conductorMassKgPerKm.toFixed(0)} + insulation ${insulationMassKgPerKm.toFixed(0)} kg/km × ` +
      `lay-up ${PHYSICAL.layUpFactor}`,
  };
}

function finishedAndComplianceFields(quirks: DerivationQuirks, groups: ConductorGroup[]): ResolvedField[] {
  const drumLength = quirks.drumLengthM ?? 1000;
  const drumTol = quirks.drumLengthTolerance ?? "±5%";
  const bundle = finishedBundle(groups);
  return [
    { key: "cable.ratedVoltage", label: "Rated voltage", value: FIXED.ratedVoltage, tag: "FIXED", source: "profile", trace: "IS 14255:1995 scope (up to and including 1100 V)", editable: false },
    bundle
      ? { key: "fin.overallDia", label: "Overall diameter (approx.)", value: `${bundle.overallDiaMm.toFixed(1)} mm`, tag: "CALC" as const, source: "calc" as const, trace: bundle.workings, editable: false }
      : { key: "fin.overallDia", label: "Overall diameter (approx.)", value: "—", tag: "CALC" as const, source: "calc" as const, trace: "A conductor size in this cable has no IS row yet", editable: false, gap: true },
    bundle
      ? { key: "fin.totalMass", label: "Total mass (approx.)", value: `${bundle.massKgPerKm.toFixed(0)} kg/km`, tag: "CALC" as const, source: "calc" as const, trace: bundle.workings, editable: false, tolerance: bandTolerance("±5%", "works-estimate", "Works spread on a calculated mass — see the trace for the working") }
      : { key: "fin.totalMass", label: "Total mass (approx.)", value: "—", tag: "CALC" as const, source: "calc" as const, trace: "A conductor size in this cable has no IS row yet", editable: false, gap: true },
    { key: "fin.layDirection", label: "Direction of lay", value: IS14255_1995_LAY.direction, tag: "LOOKUP", source: "is-table", trace: IS14255_1995_LAY.ref, editable: false },
    { key: "fin.maxLay", label: "Max lay ratio", value: `${IS14255_1995_LAY.maxLayRatio} × dia of insulated phase`, tag: "LOOKUP", source: "is-table", trace: IS14255_1995_LAY.ref, editable: false },
    // The drum band is a commercial term agreed with the buyer, not a standards limit.
    { key: "drum.length", label: "Standard length per drum", value: `${drumLength} m`, tag: "CHOICE", source: "order", trace: `${quirks.customerName ?? "Customer"} default`, editable: true, tolerance: bandTolerance(drumTol, "customer", `${quirks.customerName ?? "Customer"} agreed drum length tolerance`) },
    { key: "drum.standard", label: "Drum standard", value: "IS 10418:1982 (non-returnable wooden)", tag: "FIXED", source: "profile", trace: "DHBVN CSC-69 §1.10 / IS 10418:1982", editable: false },
    { key: "cert.isiMark", label: "Bears ISI certification mark", value: "Yes", tag: "FIXED", source: "profile", trace: "ISI-marked supply required", editable: false },
    { key: "cable.maxConductorTemp", label: "Max continuous conductor temperature", value: `${FIXED.maxConductorTempC}°C (short-circuit ${FIXED.shortCircuitTempC}°C)`, tag: "FIXED", source: "profile", trace: "XLPE 90°C continuous; 250°C short-time", editable: false },
    {
      key: "mark.embossing",
      label: "Embossing / marking legend",
      value: quirks.markingLegend ?? "—",
      tag: "QUIRK",
      source: "profile",
      trace: quirks.markingLegend
        ? `${quirks.customerName ?? "Customer"} verbatim legend${quirks.embossingIntervalM ? `, every ${quirks.embossingIntervalM} m` : ""}`
        : "No legend recorded for this customer",
      editable: true,
      gap: !quirks.markingLegend,
    },
  ];
}

function streetLightFields(group: ConductorGroup): ResolvedField[] {
  const size = group.sizeSqMm;
  // Two DIFFERENT sources, deliberately kept apart (see works-conductor-data.ts):
  //   • IS 8130 gives the max DC resistance — the only conductor property the standard specifies.
  //   • Works data gives the physical construction (wires, wire dia, conductor dia), because
  //     IS 8130 specifies no dimensions at all for Class 2 (§3.2).
  // Tagging works dimensions as an IS lookup would be a provenance claim that fails inspection.
  //
  // Aluminium is not a default here, it is the standard: IS 14255 is an aluminium-conductor
  // specification throughout, so an AB street-light core has no material choice to offer.
  const material = "AL" as const;
  const conductor = findWorksConductor(size, { material, form: "compacted-or-shaped" });
  const isSpec = (() => {
    try {
      return findConductor({ csaSqMm: size, material, klass: "Class 2", form: "compacted-or-shaped" });
    } catch {
      return undefined;
    }
  })();
  const phase = findPhaseRow(size);
  const fields: ResolvedField[] = [
    { key: "streetLight.size", label: "Street-light core size", value: `${size} sq mm`, tag: "LOOKUP", source: "is-table", trace: isSpec?.ref ?? "—", editable: false, gap: !isSpec },
  ];
  if (isSpec) {
    fields.push({ key: "streetLight.maxDcResistance", label: "Max DC resistance @20°C (street-light)", value: `${isSpec.maxDcResistanceOhmPerKm} ohm/km`, tag: "LOOKUP", source: "is-table", trace: isSpec.ref, editable: false });
  }
  if (conductor) {
    fields.push({ key: "streetLight.strands", label: "No. of strands (street-light)", value: conductor.wires, tag: "LOOKUP", source: "works-data", trace: `${conductor.wires} wires — ${conductor.origin}`, editable: false });
  }
  if (phase) {
    // Same §7.3 floor as the power core. This core used to print bare while the power core got
    // an invented "±5%" — the two are governed by one clause and now say so consistently.
    fields.push({
      key: "streetLight.insulationThickness",
      label: "Insulation thickness (street-light)",
      value: `${phase.insulationThicknessMinMm.toFixed(2)} mm`,
      tag: "LOOKUP",
      source: "is-table",
      trace: phase.ref,
      editable: false,
      tolerance: floorTolerance(
        phase.insulationThicknessMinMm,
        insulationToleranceFloorMm(phase.insulationThicknessMinMm),
        `IS 14255 : 1995, §7.3 — nominal ${phase.insulationThicknessMinMm.toFixed(2)} − (0.1 + 0.1 × ${phase.insulationThicknessMinMm.toFixed(2)})`,
      ),
    });
    fields.push({ key: "streetLight.currentRating", label: "Current rating (street-light)", value: `${phase.currentRatingA} A`, tag: "LOOKUP", source: "is-table", trace: phase.ref, editable: false });
  }
  return fields;
}

/** Derive the full field map for a construction. Pure; deterministic. */
export function deriveFields(construction: CableConstruction, quirks: DerivationQuirks = {}): ResolvedField[] {
  const fields: ResolvedField[] = [];

  // FIXED org constants.
  fields.push({ key: "mfr.name", label: "Manufacturer", value: FIXED.manufacturer, tag: "FIXED", source: "profile", trace: "Org constant", editable: false });
  fields.push({ key: "mfr.isiLicence", label: "ISI licence no.", value: FIXED.isiLicence, tag: "FIXED", source: "profile", trace: "Org constant", editable: false, gap: true });

  // Appendix-I 3.i — buyers ask for the phase-conductor count explicitly.
  const powerGroup = construction.groups.find((g) => g.role === "power");
  if (powerGroup) {
    fields.push({
      key: "power.count",
      label: "No. of phase conductors",
      value: powerGroup.count,
      tag: "LOOKUP",
      source: "order",
      trace: `From the designation "${construction.raw}"`,
      editable: false,
    });
  }

  for (const group of construction.groups) {
    if (group.role === "power") fields.push(...powerFields(group, quirks));
    else if (group.role === "messenger") fields.push(...messengerFields(group));
    else if (group.role === "street-light") fields.push(...streetLightFields(group));
  }

  // QUIRK: messenger construction — DHBVN demands BARE, WBSEDCL uses covered. Materially
  // different cables, so this must never be silently defaulted.
  if (quirks.messengerConstruction) {
    fields.push({
      key: "messenger.construction",
      label: "Messenger construction",
      value: quirks.messengerConstruction === "bare" ? "Bare Al-Mg-Si alloy, compacted round" : "Covered / insulated",
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile`,
      editable: true,
    });
  }
  if (quirks.coreIdentification) {
    fields.push({
      key: "power.identification",
      label: "Core identification",
      value: quirks.coreIdentification,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile`,
      editable: true,
    });
  }

  // QUIRK: sag (WBSEDCL 1.5%, not the 3% default).
  if (quirks.sagPercent != null) {
    fields.push({
      key: "fin.sag",
      label: "Sag @ 40°C",
      value: `${quirks.sagPercent}%`,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile (default 3%)`,
      editable: true,
    });
  }
  if (quirks.layRatioFactor != null) {
    fields.push({ key: "fin.layRatio", label: "Lay ratio factor", value: quirks.layRatioFactor, tag: "QUIRK", source: "profile", trace: `${quirks.customerName ?? "Customer"} profile`, editable: true });
  }

  fields.push(...finishedAndComplianceFields(quirks, construction.groups));

  // Tolerance is a mandatory column: anything not given one above is stated as N/A rather than
  // left blank, so a reader can tell "no tolerance applies" from "nobody filled this in".
  return withMandatoryTolerance(fields);
}

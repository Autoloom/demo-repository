/**
 * GTP (Guaranteed Technical Particulars) — document model and renderer.
 *
 * A GTP is the approved technical contract for a cable: the manufacturer states every
 * particular, the DISCOM approves it, and inspection is carried out against it.
 *
 * WHY SPEC AND DOCUMENT ARE SEPARATE TYPES
 * The source GTP's covering letter approves ONE cable
 * ("3CX70+1CX50+1CX16 Sqmm") across SIX packages — PKG 30, 31, 32, 33, 34 & 36,
 * spanning two districts (Murshidabad, Malda) under different NOA numbers. So the
 * cable spec is reusable and the order metadata is not. Folding NOA/package into the
 * spec would force six near-duplicate specs and let them drift apart.
 *
 *   AbcCableSpec  → what the cable IS        (lib/domain/abc.ts)
 *   GtpDocument   → spec + who it's for + approval state  (this file)
 *
 * APPROVAL STATE IS REAL
 * The source is stamped "PROVISIONALLY APPROVED — subject to incorporation of
 * necessary correction/additional modification shown by us", and the approver's
 * handwriting changes values: allowable sag was submitted as 3% and approved as
 * 1.5%. A GTP therefore has a status and can carry corrections. We model both rather
 * than pretending the submitted and approved documents are the same thing.
 */

import {
  formatSpecValue,
  STANDARDS_AMENDMENT_NOTE,
  STANDARDS_BY_FAMILY,
  coreTypeLabel,
  type AbcCableSpec,
} from "@/lib/domain/abc";

export type GtpStatus = "Draft" | "Submitted" | "Provisionally approved" | "Approved" | "Superseded";

export interface GtpOrderMetadata {
  project: string;
  customer: string;
  /** A package can sit under more than one NOA (supply + erection). */
  noaNumbers: string[];
  packageNos: string[];
  districts?: string[];
  turnkeyAgency: string;
  manufacturerName: string;
  manufacturerAddress: string;
  materialDescription: string;
  itemTitle: string;
}

/** A value the approver changed on the submitted document. Kept, never silently applied. */
export interface GtpCorrection {
  field: string;
  submitted: string;
  approved: string;
  note?: string;
}

export interface GtpDocument {
  id: string;
  status: GtpStatus;
  order: GtpOrderMetadata;
  spec: AbcCableSpec;
  approvedBy?: string;
  approvedOn?: string;
  memoNo?: string;
  corrections?: GtpCorrection[];
  /** Anything the source prints that the schema shouldn't pretend to structure. */
  footnotes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

/** One printed row: "d) Strands of Dia of Power Core | Min 2.17 mm (Before Compacting)". */
export interface GtpRow {
  label: string;
  value: string;
  /** Sub-item letter as printed, e.g. "a", "b". Absent for a section's own row. */
  marker?: string;
}

/** A numbered block, e.g. "4.A — Power Core". */
export interface GtpSection {
  slNo: string;
  title: string;
  rows: GtpRow[];
}

const letter = (i: number) => String.fromCharCode(97 + i); // 0 → "a"

function coreSection(spec: AbcCableSpec, coreType: AbcCableSpec["cores"][number]["coreType"], slNo: string): GtpSection | null {
  const core = spec.cores.find((c) => c.coreType === coreType);
  if (!core) return null;

  const rows: Omit<GtpRow, "marker">[] = [
    { label: "No of Core", value: String(core.numCores) },
    { label: `Nominal Cross sectional area of ${coreTypeLabel(coreType)} Core`, value: `${core.nominalCsaSqMm} Sqmm` },
    { label: `No of Strands of ${coreTypeLabel(coreType)} Core`, value: String(core.numStrands) },
    { label: "Strand dia", value: formatSpecValue(core.strandDiaMm) },
    { label: "Dia of Compacted Conductor (mm)", value: formatSpecValue(core.compactedConductorDiaMm) },
    { label: "Insulation Minimum Thickness", value: formatSpecValue(core.insulationMinThicknessMm) },
    { label: "Approximate dia over Insulation", value: formatSpecValue(core.approxDiaOverInsulationMm) },
    {
      label: `Continuous Current carrying capacity in air at ambient temp ${core.currentRatingAmbientTempC}°C (Amp)`,
      value: formatSpecValue(core.continuousCurrentRatingAmp),
    },
    { label: `Identification of ${coreTypeLabel(coreType)} Core`, value: core.identification },
    { label: "Max DC resistance of conductor at 20°C (ohm/Km)", value: String(core.maxDcResistanceOhmPerKm) },
    { label: "Apporx. Mass (Kg/Km) of conductor metal", value: formatSpecValue(core.approxConductorMassKgPerKm) },
  ];

  if (core.coreType === "NEUTRAL_MESSENGER") {
    rows.push(
      { label: "Minimum Breaking Load (KN)", value: String(core.minBreakingLoadKn) },
      { label: "Modulus of Elasticity (Kg/cm² × 10⁶)", value: String(core.modulusOfElasticityKgPerCm2) },
      { label: "Coefficient of Linear Expansion (per °C × 10⁻⁶)", value: String(core.coefficientLinearExpansionPerC) },
    );
  }

  return {
    slNo,
    title: `${coreTypeLabel(coreType)} Core`,
    rows: rows.map((r, i) => ({ ...r, marker: letter(i) })),
  };
}

/**
 * Build the printable GTP as ordered sections, mirroring the approved document's own
 * numbering (1.0 … 20) so an inspector can read ours side-by-side with theirs.
 * Pure — no formatting decisions leak into the React layer.
 */
export function buildGtpSections(doc: GtpDocument): GtpSection[] {
  const { spec } = doc;
  const sections: GtpSection[] = [];

  sections.push({
    slNo: "1.0",
    title: "Name & Address of Manufacturer",
    rows: [
      { label: "Manufacturer", value: `${doc.order.manufacturerName}, ${doc.order.manufacturerAddress}` },
      {
        label: "ISI License shall remain valid till order is completed",
        value: spec.isiLicenceValidTillOrderComplete ? "Yes" : "No",
      },
    ],
  });

  sections.push({ slNo: "2.0", title: "AB Cables Size", rows: [{ label: "Size", value: spec.size }] });

  sections.push({
    slNo: "3.0",
    title: "List of Standards applicable",
    rows: [
      {
        label: "Standards",
        value: `As per ${STANDARDS_BY_FAMILY[spec.family].join(", ")} ${STANDARDS_AMENDMENT_NOTE}`,
      },
    ],
  });

  sections.push({
    slNo: "4.0",
    title: "Name of Raw Material Supplier",
    rows: spec.rawMaterialSuppliers.map((s, i) => ({
      marker: letter(i),
      label: s.material,
      value: s.approvedMakes.join(" / "),
    })),
  });

  const power = coreSection(spec, "POWER", "4.A");
  const messenger = coreSection(spec, "NEUTRAL_MESSENGER", "4.B");
  const street = coreSection(spec, "STREET_LIGHTING", "4.C");
  for (const s of [power, messenger, street]) if (s) sections.push(s);

  sections.push({
    slNo: "5",
    title: "Details of Power Core Conductor & Street Light Core",
    rows: [
      { marker: "a", label: "Material", value: spec.conductorMaterialGrade },
      { marker: "b", label: "Flexibility class as per IS: 8130-1984", value: spec.flexibilityClass },
      { marker: "c", label: "Form of conductor", value: spec.conductorForm },
      { marker: "d", label: "Maximum continuous conductor Temperature (°C)", value: `${spec.maxContinuousConductorTempC}° C` },
      { marker: "e", label: "Maximum short time conductor Temperature (°C)", value: `${spec.maxShortCircuitConductorTempC}° C` },
    ],
  });

  sections.push({
    slNo: "6",
    title: "Details of Neutral-cum-messenger Core",
    rows: [
      { marker: "a", label: "Material", value: spec.messengerMaterial },
      { marker: "b", label: "Form of Conductor", value: spec.messengerConductorForm },
    ],
  });

  sections.push({
    slNo: "7",
    title: "Insulation",
    rows: [
      { marker: "a", label: "Material", value: spec.insulationMaterial },
      { marker: "b", label: "Method of application of Insulation", value: spec.insulationApplicationMethod },
      { marker: "c", label: "Type of curing of XLPE Insulated Completed Cable", value: spec.insulationCuringType },
      { marker: "d", label: "Colour of Insulation", value: spec.insulationColour },
    ],
  });

  sections.push({
    slNo: "8",
    title: "Voltage Grade of Cable",
    rows: [
      { marker: "a", label: "Service Voltage", value: `${spec.serviceVoltageV} Volt` },
      { marker: "b", label: "Neutral to Phase Voltage", value: `${spec.neutralToPhaseVoltageV} Volt` },
    ],
  });

  sections.push({
    slNo: "9",
    title: "De-Rating factor: De-Rating factor for variation in air",
    // The note is its own row — appending it to the value strings ran it into the
    // last temperature ("… 45 50°C: As per TS/IS"), which reads as a bad figure.
    rows: [
      { label: "Air Temperature °C", value: spec.deratingTable.map((d) => d.airTempC).join(", ") },
      { label: "Rating Factor", value: spec.deratingTable.map((d) => d.ratingFactor).join(", ") },
      ...(spec.deratingNote ? [{ label: "Beyond tabulated range", value: spec.deratingNote }] : []),
    ],
  });

  sections.push({ slNo: "10", title: "Direction of Laying", rows: [{ label: "Direction", value: spec.directionOfLaying }] });

  sections.push({
    slNo: "11",
    title: "Details about Completed Cables",
    rows: [
      { marker: "a", label: "Approx. overall Diameter (mm)", value: formatSpecValue(spec.completedCable.approxOverallDiaMm) },
      { marker: "b", label: "Approx. Weight (Kg/Km)", value: formatSpecValue(spec.completedCable.approxWeightKgPerKm) },
      {
        marker: "c",
        label: "Allowable sag as a percentage of span length at 40°C ambient temperature",
        value: formatSpecValue(spec.completedCable.allowableSagPctAt40C),
      },
    ],
  });

  sections.push({
    slNo: "12",
    title: "Details about Cable drums",
    rows: [
      { marker: "a", label: "Standard Drum length and tolerance of each drum", value: formatSpecValue(spec.drum.standardLengthM) },
      { marker: "b", label: "Dimension of drum", value: spec.drum.dimensionStandard },
      { marker: "c", label: "Shipping weight", value: spec.drum.shippingWeight },
    ],
  });

  sections.push({ slNo: "13", title: "Sequential Marking In each meter Length", rows: [{ label: "Marking", value: spec.sequentialMarking }] });
  sections.push({ slNo: "14", title: "Embossing on any one phase core", rows: [{ label: "Embossing", value: spec.embossingContent }] });
  sections.push({ slNo: "15", title: "Cable Identification", rows: [{ label: "Identification", value: spec.cableIdentification }] });
  sections.push({
    slNo: "16",
    title: "Multiplying factor considering Lay ratio of Cable to Measure the length of cable in drum",
    rows: [{ label: "Factor", value: String(spec.layRatioMultiplyingFactor) }],
  });
  sections.push({
    slNo: "17",
    title: `Drum Marking (${spec.drum.markingStandard})`,
    rows: [{ label: "Marking", value: spec.drum.markingContent }],
  });
  sections.push({ slNo: "18", title: "Guarantee", rows: [{ label: "Guarantee", value: spec.guaranteeTerms }] });
  sections.push({ slNo: "19", title: "Extras (if any)", rows: [{ label: "Extras", value: spec.extras ?? "—" }] });
  sections.push({
    slNo: "20",
    title: "Documents to accompany the GTP",
    rows: spec.complianceChecklist.map((c) => ({ label: c.item, value: c.required ? "Yes" : "No" })),
  });

  return sections;
}

/**
 * Seed: the real approved GTP, transcribed.
 *
 * Source: "APPROVED GTP KRYFS PKG-30, 31-36 3x70.pdf"
 *   WBSEDCL · RDSS Project-II · Memo RE/RDSS/GTP/LT AB Cable/Pkg-30/241(D)/B-82(?)
 *   Turnkey: KRYFS Power Components Ltd · Manufacturer: Navya Cables & Conductor Pvt Ltd
 *   Approved by A.N. Bhattacharya, Chief Engineer-RE, 14.05.2024
 *
 * Every value here is transcribed from that document. Nothing is interpolated. Where
 * the source is ambiguous, contradictory, or looks like a transcription error, the
 * value is reproduced AS PRINTED and the problem is recorded in `footnotes` — it is
 * not quietly repaired. An "engines are deterministic" codebase must not launder a
 * questionable approved figure into a confident one.
 */

import type { AbcCableSpec } from "@/lib/domain/abc";
import { buildAbcDesignation, buildAbcSize } from "@/lib/domain/abc";
import type { GtpDocument } from "@/lib/domain/gtp-document";

const cores: AbcCableSpec["cores"] = [
  {
    coreType: "POWER",
    numCores: 3,
    nominalCsaSqMm: 70,
    numStrands: 19,
    strandDiaMm: { value: 2.17, unit: "mm", qualifier: "Min", note: "Before Compacting" },
    // Power core tolerance is PLUS-ONLY in the source; messenger and street-light are ±.
    compactedConductorDiaMm: { value: 9.44, unit: "mm", tolerancePlusPct: 5 },
    insulationMinThicknessMm: { value: 1.5, unit: "mm", qualifier: "Min" },
    approxDiaOverInsulationMm: { value: 12.5, unit: "mm", qualifier: "Min" },
    continuousCurrentRatingAmp: { value: 154, unit: "A" },
    currentRatingAmbientTempC: 40,
    maxDcResistanceOhmPerKm: 0.443,
    approxConductorMassKgPerKm: { value: 196, unit: "Kg/Km", tolerancePct: 3, note: "EC grade Aluminium part only" },
    identification: "The Phase conductors shall be provided with one, two or three ridges for quick identification",
  },
  {
    coreType: "NEUTRAL_MESSENGER",
    numCores: 1,
    nominalCsaSqMm: 50,
    numStrands: 7,
    strandDiaMm: { value: 3.02, unit: "mm", qualifier: "Min", note: "before compacting" },
    compactedConductorDiaMm: { value: 7.98, unit: "mm", tolerancePct: 5, qualifier: "Min" },
    insulationMinThicknessMm: { value: 1.5, unit: "mm", qualifier: "Min" },
    // Source states dia over insulation for the messenger only via the combined
    // "compacted conductor + insulation" row; carried as the same figure pending confirmation.
    approxDiaOverInsulationMm: { value: 7.98, unit: "mm", qualifier: "Min", note: "over compacted conductor + insulation" },
    continuousCurrentRatingAmp: { value: 128, unit: "A" },
    currentRatingAmbientTempC: 40,
    maxDcResistanceOhmPerKm: 0.689,
    approxConductorMassKgPerKm: { value: 127, unit: "Kg/Km", tolerancePct: 3, note: "Alloy part only" },
    identification: "Insulated Messenger Conductor with 4 Nos ridges",
    minBreakingLoadKn: 14,
    modulusOfElasticityKgPerCm2: 0.6324,
    coefficientLinearExpansionPerC: 23.0,
  },
  {
    coreType: "STREET_LIGHTING",
    numCores: 1,
    nominalCsaSqMm: 16,
    numStrands: 7,
    strandDiaMm: { value: 1.72, unit: "mm", note: "before compacting" },
    compactedConductorDiaMm: { value: 4.55, unit: "mm", tolerancePct: 5 },
    insulationMinThicknessMm: { value: 1.2, unit: "mm", qualifier: "Min" },
    approxDiaOverInsulationMm: { value: 7.1, unit: "mm" },
    continuousCurrentRatingAmp: { value: 63, unit: "Amp", note: "As per IS" },
    currentRatingAmbientTempC: 40,
    maxDcResistanceOhmPerKm: 1.91,
    approxConductorMassKgPerKm: { value: 42, unit: "Kg/Km", tolerancePct: 3, note: "EC grade Aluminium part only" },
    identification: "The insulated street light conductors shall not have any identification mark",
  },
];

export const abcSampleSpec: AbcCableSpec = {
  family: "ABC_AERIAL_BUNCHED",
  id: "SPEC-ABC-3X70-1X50-1X16",
  size: buildAbcSize(cores),
  designation: buildAbcDesignation({ cores, serviceVoltageV: 1100 }),
  cores,

  conductorMaterial: "Aluminium",
  conductorMaterialGrade:
    "Aluminium Conductor shall be H4 grade complying with the requirements of IS: 8130-1984 with up to date amendments",
  flexibilityClass: "Class-2",
  conductorForm: "Strand Compacted Circular",
  maxContinuousConductorTempC: 90,
  maxShortCircuitConductorTempC: 250,

  messengerMaterial:
    "Heat treated Aluminium Magnesium-silicon Alloy wires containing approximate 0.5% silicon conforming to IS-398 (Part-IV)/1984 with up to date amendments",
  messengerConductorForm: "Strand Compacted Circular",
  // The approved GTP's section 4.B reads "Insulated Messenger Conductor with 4 Nos
  // ridges", so the approved cable is the insulated construction. Bare is offered in
  // the builder as a deviation from this.
  messengerCovering: "Insulated",

  insulationMaterial: "Cross linked Polyethylene",
  insulationApplicationMethod: "Extrusion",
  insulationCuringType: "Steam Curing / Sio Plus",
  insulationColour: "Black",

  serviceVoltageV: 1100,
  neutralToPhaseVoltageV: 635,

  // Reproduced exactly as printed — see footnote on the document about the ordering.
  deratingTable: [
    { airTempC: 20, ratingFactor: 1.22 },
    { airTempC: 25, ratingFactor: 1.25 },
    { airTempC: 30, ratingFactor: 1.16 },
    { airTempC: 35, ratingFactor: 1.09 },
    { airTempC: 40, ratingFactor: 1.1 },
    { airTempC: 45, ratingFactor: 0.9 },
  ],
  deratingNote: "50°C: As per TS/IS",

  directionOfLaying: "Right Hand Direction",

  completedCable: {
    approxOverallDiaMm: { value: 35, unit: "mm", qualifier: "Approx" },
    approxWeightKgPerKm: { value: 966, unit: "Kg/Km", tolerancePct: 5, qualifier: "Approx" },
    // Approved value. Submitted was 3% — struck out by the approver. See corrections.
    allowableSagPctAt40C: { value: 1.5, unit: "%" },
  },

  drum: {
    standardLengthM: { value: 1000, unit: "meter", tolerancePct: 5 },
    dimensionStandard: "As per IS: 10418-1982 with latest amendments",
    shippingWeight: "1000 Kg + Drum Weight with allowable Tolerance as per TS",
    markingStandard: "As per IS: 10148:1982 with Latest amendment",
    markingContent:
      "Manufacturer Name, TKC Name & PKG No., Trade Mark, Drum No, Size of Conductor and Cable, Voltage Grade, Length of cable, Gross weight & Net weight of Cable drum, ISI Mark, Developed under RDSS, WBSEDCL / Golden brown colour on the flange.",
  },

  sequentialMarking: "Marking of sequential length shall be provided on any core by printing / engraving.",
  embossingContent:
    "Each meter length shall be embossed with Trade Mark, Voltage grade, ELECTRIC WBSEDCL, Type, Year of Manufacturing, No of Core, Size of Cable, XLPE-90, Developed under RDSS, CML NO — ISI Mark",
  cableIdentification:
    'Cable with XLPE insulation shall be identified throughout the length of the Cable by the legend "XLPE 90" and Year of manufacture by embossing',

  layRatioMultiplyingFactor: 0.995,

  rawMaterialSuppliers: [
    { material: "Aluminium Wire Rod", approvedMakes: ["NALCO", "BALCO", "HINDALCO", "Any Reputed Make"] },
    { material: "Aluminium Alloy Wire Rod", approvedMakes: ["VEDANTA", "HINDALCO", "Any Reputed Make"] },
    { material: "XLPE Compound", approvedMakes: ["KLJ Polymers", "Kalpana Industries", "Any Reputed Make"] },
  ],

  isiLicenceValidTillOrderComplete: true,
  guaranteeTerms: "As per SBD",

  complianceChecklist: [
    { item: "MQP along with GTP", required: true },
    { item: "Updated Valid Calibration certificates of all testing equipment's from NABL", required: true },
    { item: "Valid Type Test Report as per SBD for the same item / higher", required: true },
    { item: "Details of Raw Material Suppliers as per standard", required: true },
    { item: "Credentials of Supply to WBSEDCL and other State Utilities", required: true },
    { item: "All documents stamped and signed by Authorised signatories of Manufacturer and Turnkey Agencies", required: true },
  ],
};

export const abcSampleGtp: GtpDocument = {
  id: "GTP-PKG30-ABC-3X70",
  status: "Provisionally approved",
  memoNo: "RE/RDSS/GTP/LT AB Cable/Pkg-30/241(D)/B-82",
  approvedBy: "A.N. Bhattacharya, Chief Engineer-RE, WBSEDCL",
  approvedOn: "2024-05-14",
  order: {
    project: "Revamped Distribution Sector Scheme (RDSS) in WBSEDCL Project-II",
    customer: "West Bengal State Electricity Distribution Company Limited",
    noaNumbers: [
      "RE/RDSS/Murshidabad/Pkg 30/Supply/241(D)/B-742 dated 21.07.2023",
      "RE/RDSS/Murshidabad/Pkg 30/Erection/241(D)/B-743 dated 21.07.2023",
    ],
    // One approved cable serving six packages — the reason spec and order are separate types.
    packageNos: ["PKG-30", "PKG-31", "PKG-32", "PKG-33", "PKG-34", "PKG-36"],
    districts: ["Murshidabad", "Malda"],
    turnkeyAgency: "KRYFS Power Components Ltd.",
    manufacturerName: "M/s. Navya Cables and Conductor Private Limited",
    manufacturerAddress: "143A, Government Industrial Estate, Charkop, Kandivali (W), Mumbai – 400067",
    materialDescription: "LT AERIAL BUNCHED XLPE CABLE WITH COVERED MESSENGER",
    itemTitle: "GTP of LT AB Cable SIZE 3 X 70 + 1 X 50 + 1 X 16 SQ.MM (COVERED MESSENGER)",
  },
  spec: abcSampleSpec,
  corrections: [
    {
      field: "Allowable sag (% of span at 40°C)",
      submitted: "3%",
      approved: "1.5%",
      note: "Struck out and corrected in the approver's hand.",
    },
    {
      field: "Messenger compacted conductor dia tolerance",
      submitted: "+ 5%",
      approved: "± 5%",
      note: "Amended on the approved copy.",
    },
  ],
  footnotes: [
    "Length of the drum should match the cable length.",
    "CONFIRM BEFORE PRODUCTION USE — the approved de-rating table does not decrease monotonically with temperature (20°C → 1.22, 25°C → 1.25, 35°C → 1.09, 40°C → 1.10). Reproduced exactly as printed; likely a transcription error on the source document. Flag to WBSEDCL rather than assuming an intended sequence.",
    "CONFIRM — the source states seven air temperatures (20–50°C) but only six rating factors, with '50°C: As per TS/IS' carried as a note.",
    'The source document is internally inconsistent on ordering: the item title reads "3 X 70 + 16 + 50 SQ.MM" while the size field reads "3CX70+1CX50+1CX16 Sqmm". The app emits power → messenger → street-lighting consistently.',
  ],
};

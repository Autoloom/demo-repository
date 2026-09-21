/**
 * Formatted GTP sheet builder — pure functions only.
 *
 * Boards expect the Guaranteed Technical Particulars as a fixed numbered table
 * (the WBSEDCL tender layout: manufacturer header, cable-size column, grouped
 * rows for Conductor / Insulation / Inner sheath / Armouring / Outer sheath /
 * Electrical Properties). This maps a CableSpec onto that exact row structure.
 *
 * Values the spec cannot supply (strand count, layer thicknesses, resistivity)
 * render as blank cells for manual fill — never fabricated numbers.
 */
import { suggestStandard } from "@/lib/domain/cable";
import type { CableSpec, CoreConfig, Gtp } from "@/lib/services/types";

export interface GtpTableItem {
  /** Sub-row label, e.g. "i) Material". Empty for single-row groups. */
  label: string;
  /** Empty string renders as a blank cell (tender-style manual fill). */
  value: string;
}

export interface GtpTableGroup {
  no: number;
  label: string;
  items: GtpTableItem[];
}

export interface GtpTable {
  title: string;
  manufacturerName: string;
  tenderNo: string;
  cableSizeLabel: string;
  groups: GtpTableGroup[];
}

const coreCount: Record<CoreConfig, string> = {
  "1C": "1 Core",
  "2C": "2 Core",
  "3C": "3 Core",
  "3.5C": "3.5 Core",
  "4C": "4 Core",
  "5C": "5 Core",
  "7C": "7 Core",
  "12C": "12 Core",
  "19C": "19 Core",
  "27C": "27 Core",
  "37C": "37 Core",
};

/** "650/1100 V (1.1 kV)" → "1.1 kV"; multi-part HT grades keep the full pair. */
function ratedVoltage(spec: CableSpec): string {
  const bracket = spec.voltageGrade.match(/\(([^)]+)\)/);
  return bracket ? bracket[1] : spec.voltageGrade;
}

function conductorShape(spec: CableSpec): string {
  if (spec.conductorClass === "Class 1 (solid)") return "Solid circular";
  if (spec.conductorClass === "Class 2 compacted") return "Compacted circular";
  return "Circular (stranded)";
}

function conductorMaterialRow(spec: CableSpec): string {
  const base = `Stranded ${spec.conductorMaterial}, ${spec.conductorClass}`;
  const governing =
    spec.conductorMaterial === "Aluminium" ||
    spec.conductorMaterial === "Copper" ||
    spec.conductorMaterial === "Tinned Copper"
      ? ", conforming to IS 8130 and its amendments"
      : "";
  return `${base}${governing}`;
}

function nominalArea(spec: CableSpec): string {
  const neutral = spec.neutralSizeSqMm ? ` (+ ${spec.neutralSizeSqMm} sq mm reduced neutral)` : "";
  return `${spec.conductorSizeSqMm}${neutral}`;
}

/** Colour code up to 5 cores, printed numerals above — mirrors IS 1554 cl. 10.3. */
function coreIdentification(spec: CableSpec): string {
  if (spec.technical?.coreIdentification) return spec.technical.coreIdentification;
  const colours: Partial<Record<CoreConfig, string>> = {
    "1C": spec.technical?.colour ?? "Single core — sheath colour",
    "2C": "Red, Black",
    "3C": "Red, Yellow, Blue",
    "3.5C": "Red, Yellow, Blue + reduced neutral Black",
    "4C": "Red, Yellow, Blue, Black",
    "5C": "Red, Yellow, Blue, Black, Grey",
  };
  return colours[spec.cores] ?? "Printed Hindu-Arabic numerals on all cores";
}

/** Continuous conductor temperature by insulation grade (per governing IS). */
function maxConductorTempC(spec: CableSpec): string {
  if (spec.insulation === "PVC (Type A)") return "70";
  if (spec.insulation === "PVC (Type C)") return "85";
  if (spec.insulation === "Polyethylene") return "70";
  return "90"; // XLPE / EPR / XLPO and other thermoset grades
}

function innerSheathMaterial(spec: CableSpec): string {
  if (spec.cores === "1C") return "Not applicable (single core)";
  const fr = spec.flameClass === "Standard" ? "" : ` (${spec.flameClass})`;
  return `Extruded PVC ST-2${fr}, softer than insulation, non-hygroscopic`;
}

function armourMaterial(spec: CableSpec): string {
  switch (spec.armour) {
    case "GI round wire (GSW)":
      return "Galvanised steel round wire, per IS 3975";
    case "GI strip (GSS)":
      return "Galvanised steel strip, per IS 3975";
    case "Aluminium wire (AWA)":
      return "Aluminium round wire";
    case "Aluminium strip":
      return "Aluminium strip";
    case "Unarmoured":
      return "Unarmoured";
  }
}

function outerSheathMaterial(spec: CableSpec): string {
  return `Extruded ${spec.sheath}, black`;
}

/** Fixed WBSEDCL-style numbered rows, populated from the contracted spec. */
export function buildGtpTable(
  spec: CableSpec,
  gtp: Pick<Gtp, "cableType" | "manufacturerName" | "tenderNo">,
): GtpTable {
  const standard = spec.standard ?? suggestStandard(spec);
  const armoured = spec.armour !== "Unarmoured";
  const kv = ratedVoltage(spec);
  return {
    title: `Guaranteed Technical Particulars for ${gtp.cableType}`,
    manufacturerName: gtp.manufacturerName ?? "",
    tenderNo: gtp.tenderNo ?? "",
    cableSizeLabel: `${coreCount[spec.cores]} ${spec.conductorSizeSqMm} sq. mm.`,
    groups: [
      { no: 1, label: "Rated Voltage", items: [{ label: "", value: kv }] },
      {
        no: 2,
        label: "Standard Referred",
        items: [{ label: "", value: `${standard} up to latest amendment` }],
      },
      {
        no: 3,
        label: "Conductor",
        items: [
          { label: "i) Material", value: conductorMaterialRow(spec) },
          { label: "ii) Nominal Area of Cross-section (sq. mm)", value: nominalArea(spec) },
          { label: "iii) Total no. of Conductor / Core", value: "" },
          { label: "iv) Shape of conductor", value: conductorShape(spec) },
        ],
      },
      {
        no: 4,
        label: "Insulation",
        items: [
          { label: "i) Material", value: spec.insulation },
          { label: "ii) Nom. Thickness (mm)", value: `As per ${standard} and its amendments` },
          {
            label: "iii) Suitability w.r.t. temperature, moisture, acid, oil and alkaline surrounding",
            value: "Yes",
          },
        ],
      },
      {
        no: 5,
        label: "Inner sheath",
        items: [
          { label: "i) Material", value: innerSheathMaterial(spec) },
          { label: "ii) Minimum thickness of sheath (mm)", value: "" },
        ],
      },
      {
        no: 6,
        label: "Armouring",
        items: [
          { label: "a) Material & Type", value: armourMaterial(spec) },
          { label: "b) Nom. dia/size of armour (mm)", value: armoured ? "" : "Not applicable" },
        ],
      },
      {
        no: 7,
        label: "Outer sheath",
        items: [
          { label: "i) Material", value: outerSheathMaterial(spec) },
          { label: "ii) Minimum thickness of sheath (mm)", value: "" },
        ],
      },
      {
        no: 8,
        label: "Approx. overall dia of cable (mm)",
        items: [{ label: "", value: spec.approxOuterDiaMm ? String(spec.approxOuterDiaMm) : "" }],
      },
      {
        no: 9,
        label: "Method of core identification",
        items: [{ label: "", value: coreIdentification(spec) }],
      },
      {
        no: 10,
        label: "Electrical Properties",
        items: [
          {
            label: "i) Maximum D.C. resistance of conductor at 20°C (Ohm/Km)",
            value: spec.technical?.conductorResistanceOhmPerKm
              ? String(spec.technical.conductorResistanceOhmPerKm)
              : "",
          },
          {
            label: "ii) Maximum permissible conductor temperature (°C) under full load",
            value: maxConductorTempC(spec),
          },
          { label: "iii) Rated voltage", value: kv },
          { label: "iv) Maximum operating voltage", value: "10% higher than the Rated Voltage" },
          { label: "v) Permissible voltage variation", value: "±10%" },
          { label: "vi) Rated frequency", value: "50 Hz" },
          { label: "vii) Permitted frequency variation", value: "±5%" },
          { label: "viii) Minimum volume resistivity at 27°C / 85°C (Ohm·cm)", value: "" },
        ],
      },
    ],
  };
}

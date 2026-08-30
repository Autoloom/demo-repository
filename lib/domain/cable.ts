/*  Builds cable designations and internal 
    cable codes from cable specifications. */

import type {
  ArmourType,
  CableSpec,
  ConductorMaterial,
  Insulation,
  SheathType,
} from "@/lib/services/types";

/** Construction inputs needed to derive a designation/code (a subset of CableSpec). */
export type SpecConstruction = Pick<
  CableSpec,
  | "cores"
  | "conductorMaterial"
  | "conductorSizeSqMm"
  | "neutralSizeSqMm"
  | "insulation"
  | "armour"
  | "sheath"
  | "flameClass"
  | "voltageGrade"
> & { screened?: boolean };

const materialShort: Record<ConductorMaterial, string> = {
  Aluminium: "Al",
  Copper: "Cu",
};

/** Printed designation, e.g. "3.5C x 240 sq mm Al, XLPE, GI strip armoured, FRLS, 1.1kV". */
export function buildDesignation(spec: SpecConstruction): string {
  const neutral =
    spec.cores === "3.5C" && spec.neutralSizeSqMm
      ? ` + ${spec.neutralSizeSqMm} sq mm neutral`
      : "";
  const screen = spec.screened ? ", screened" : "";
  return `${spec.cores} x ${spec.conductorSizeSqMm} sq mm${neutral} ${
    materialShort[spec.conductorMaterial]
  }, ${spec.insulation}, ${spec.armour}, ${spec.sheath}, ${spec.flameClass}, ${
    spec.voltageGrade
  }${screen}`;
}

function insulationCode(insulation: Insulation): string {
  if (insulation === "XLPE") return "2X";
  if (insulation.startsWith("PVC")) return "Y";
  return "E"; // EPR / XLPO and other elastomers
}

function armourCode(armour: ArmourType): string {
  if (armour.includes("strip")) return "F";
  if (armour.includes("wire") || armour.includes("AWA")) return "W";
  return ""; // unarmoured
}

function sheathCode(sheath: SheathType): string {
  if (sheath.includes("PVC")) return "Y";
  if (sheath.includes("HDPE")) return "H";
  return "Z"; // zero-halogen
}

/** Standard cable code, e.g. A2XFY / A2XWY / YWY. A=Al, 2X=XLPE, F=strip, W=wire, Y=PVC sheath. */
export function buildCableCode(spec: SpecConstruction): string {
  const conductor = spec.conductorMaterial === "Aluminium" ? "A" : "";
  return `${conductor}${insulationCode(spec.insulation)}${armourCode(spec.armour)}${sheathCode(
    spec.sheath,
  )}`;
}

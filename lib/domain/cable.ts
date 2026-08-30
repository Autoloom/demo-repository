/*  Builds cable designations and internal 
    cable codes from cable specifications. */

import type {
  ArmourType,
  CableSpec,
  CableStandard,
  ConductorMaterial,
  Insulation,
  SheathType,
} from "@/lib/services/types";

/** Construction inputs needed to derive a designation/code (a subset of CableSpec). */
export type SpecConstruction = Pick<
  CableSpec,
  | "family"
  | "cores"
  | "conductorMaterial"
  | "conductorSizeSqMm"
  | "neutralSizeSqMm"
  | "insulation"
  | "armour"
  | "sheath"
  | "flameClass"
  | "voltageGrade"
  | "aerialBunched"
  | "coveredConductor"
  | "instrumentation"
  | "thermocouple"
  | "solar"
  | "submersible"
> & { screened?: boolean };

const materialShort: Record<ConductorMaterial, string> = {
  Aluminium: "Al",
  Copper: "Cu",
  "Tinned Copper": "Tinned Cu",
  "Aluminium Alloy": "Al alloy",
  AAAC: "AAAC",
  ACSR: "ACSR",
  "Thermocouple Alloy": "TC alloy",
};

/** Printed designation, e.g. "3.5C x 240 sq mm Al, XLPE, GI strip armoured, FRLS, 1.1kV". */
export function buildDesignation(spec: SpecConstruction): string {
  if (spec.family === "Aerial Bunched Cable" && spec.aerialBunched) {
    const streetLight = spec.aerialBunched.streetLightSizeSqMm
      ? ` + ${spec.aerialBunched.streetLightSizeSqMm} sq mm street light`
      : "";
    const messenger = `${spec.aerialBunched.messengerSizeSqMm} sq mm ${
      spec.aerialBunched.messengerInsulated ? "insulated" : "bare"
    } messenger`;
    return `ABC ${spec.aerialBunched.phaseCount} phase x ${spec.aerialBunched.phaseSizeSqMm} sq mm Al, XLPE, ${messenger}${streetLight}, ${spec.voltageGrade}`;
  }

  if (spec.family === "Covered Conductor" && spec.coveredConductor) {
    const antiTracking = spec.coveredConductor.antiTrackingOuter ? ", anti-tracking" : "";
    return `${spec.coveredConductor.conductorConstruction} covered conductor ${spec.conductorSizeSqMm} sq mm, ${spec.insulation}${antiTracking}, ${spec.voltageGrade}`;
  }

  if (spec.family === "Screened Instrumentation" && spec.instrumentation) {
    const screens = [
      spec.instrumentation.individualScreen ? "individual screen" : null,
      spec.instrumentation.overallScreen ? "overall screen" : null,
      spec.instrumentation.drainWire ? "drain wire" : null,
    ].filter(Boolean);
    return `${spec.instrumentation.groupCount} ${spec.instrumentation.grouping.toLowerCase()} x ${spec.conductorSizeSqMm} sq mm instrumentation cable, ${screens.join(" + ") || "unscreened"}, ${spec.sheath}`;
  }

  if (spec.family === "Thermocouple Cable" && spec.thermocouple) {
    return `Type ${spec.thermocouple.thermocoupleType} thermocouple ${spec.thermocouple.pairCount} pair x ${spec.conductorSizeSqMm} sq mm, ${spec.sheath}`;
  }

  if (spec.family === "Solar DC Cable" && spec.solar) {
    return `Solar DC ${spec.cores} x ${spec.conductorSizeSqMm} sq mm ${materialShort[spec.conductorMaterial]}, ${spec.insulation}, ${spec.solar.dcPolarityColour}, ${spec.sheath}`;
  }

  if (spec.family === "Submersible Cable" && spec.submersible) {
    return `${spec.submersible.shape} submersible ${spec.cores} x ${spec.conductorSizeSqMm} sq mm ${materialShort[spec.conductorMaterial]}, ${spec.sheath}`;
  }

  if (spec.family === "House Wiring") {
    return `${spec.conductorSizeSqMm} sq mm ${materialShort[spec.conductorMaterial]} house wire, ${spec.insulation}, ${spec.flameClass}`;
  }

  if (spec.family === "Weatherproof Cable") {
    return `${spec.cores} x ${spec.conductorSizeSqMm} sq mm ${materialShort[spec.conductorMaterial]} weatherproof cable, ${spec.sheath}, ${spec.voltageGrade}`;
  }

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
  if (insulation.includes("solar")) return "PV";
  if (insulation.includes("anti-tracking")) return "AT";
  if (insulation === "Polyethylene") return "PE";
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
  if (spec.family === "Aerial Bunched Cable") return "ABC";
  if (spec.family === "Covered Conductor") return "MVCC";
  if (spec.family === "Screened Instrumentation") return "INST";
  if (spec.family === "Thermocouple Cable" && spec.thermocouple) return `TC-${spec.thermocouple.thermocoupleType}`;
  if (spec.family === "Solar DC Cable") return "PV1-F";
  if (spec.family === "Submersible Cable") return spec.submersible?.shape === "Flat" ? "SUB-FLAT" : "SUB";
  if (spec.family === "House Wiring") return "HW";
  if (spec.family === "Weatherproof Cable") return "WP";
  const conductor =
    spec.conductorMaterial === "Aluminium" ||
    spec.conductorMaterial === "Aluminium Alloy" ||
    spec.conductorMaterial === "AAAC" ||
    spec.conductorMaterial === "ACSR"
      ? "A"
      : "";
  return `${conductor}${insulationCode(spec.insulation)}${armourCode(spec.armour)}${sheathCode(
    spec.sheath,
  )}`;
}

/**
 * Suggest the governing IS/IEC standard from construction, so the GTP and job card
 * auto-populate it instead of relying on manual entry (kamble-meeting-improvements.md §10).
 * The client's product lines map: XLPE power ≤1.1kV → IS 7098-1, XLPE >1.1kV → IS 7098-2,
 * PVC power/control → IS 1554-1, flexible small-section → IS 694, solar XLPO → IEC 60502-1.
 */
export function suggestStandard(
  spec: Pick<SpecConstruction, "family" | "insulation" | "voltageGrade" | "conductorSizeSqMm"> & {
    conductorClass?: CableSpec["conductorClass"];
  },
): CableStandard {
  const lowVoltage = spec.voltageGrade === "650/1100 V (1.1 kV)";
  if (spec.family === "Aerial Bunched Cable") return "IS 14255";
  if (spec.family === "Covered Conductor") return "SS EN 50397-1";
  if (spec.family === "Solar DC Cable") return "EN 50618";
  if (spec.family === "Thermocouple Cable") return "IEC 60584";
  if (spec.family === "Submersible Cable") return "IS 9968-1";
  if (spec.family === "Screened Instrumentation") return "BS EN 60228";
  if (spec.family === "House Wiring" || spec.family === "Weatherproof Cable") return "IS 694";
  if (spec.insulation === "XLPO (solar/UV)") return "IEC 60502-1";
  if (spec.insulation === "XLPE" || spec.insulation === "EPR") {
    return lowVoltage ? "IS 7098-1" : "IS 7098-2";
  }
  // PVC insulated from here down.
  if (!lowVoltage) return "IEC 60502-2";
  if (spec.conductorClass === "Class 5 (flexible)" && spec.conductorSizeSqMm <= 50) return "IS 694";
  return "IS 1554-1";
}

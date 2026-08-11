//  Predefined cable specification presets used by the quote builder.

/**
 * Ready-made cable presets — the "common cables you usually sell" shown first in the Quote
 * Builder wizard (page plan §2a / §3). Picking one pre-fills the whole spec form; the operator
 * then edits only what differs.
 *
 * ⚠️ PROVISIONAL CATALOGUE — these are plausible Indian LT/HT cables for the demo. Confirm the
 * real ~8–12 most-sold cables with the client (Open question, page plan §7) and replace.
 */
import type { CableSpec } from "@/lib/services/types";

export interface CablePreset {
  id: string;
  /** Plain name (no codes), e.g. "Aluminium armoured 240 — 3.5 core". */
  displayName: string;
  /** One-line plain description. */
  description?: string;
  /** Pre-fills the spec form (designation/cableCode are derived live). */
  spec: Omit<CableSpec, "id" | "designation" | "cableCode">;
  /** Sensible starting profit %. */
  defaultMarginPct?: number;
  /** Sensible starting overhead ₹/m (process + drum + freight buffer). */
  defaultOverheadPerM?: number;
  /** A typical order length to pre-fill (metres). */
  defaultLengthM?: number;
}

export const cablePresets: CablePreset[] = [
  {
    id: "PRESET-AL-240-35C",
    displayName: "Aluminium armoured 240 — 3.5 core",
    description: "Most common LT power feeder. XLPE, strip armoured, FRLS.",
    defaultMarginPct: 14,
    defaultOverheadPerM: 820,
    defaultLengthM: 1000,
    spec: {
      standard: "IS 7098-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "3.5C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 compacted",
      conductorSizeSqMm: 240,
      neutralSizeSqMm: 120,
      insulation: "XLPE",
      armour: "GI strip (GSS)",
      sheath: "FRLS PVC",
      flameClass: "FRLS",
    },
  },
  {
    id: "PRESET-AL-185-35C",
    displayName: "Aluminium armoured 185 — 3.5 core",
    description: "LT feeder one size down from 240. XLPE, strip armoured.",
    defaultMarginPct: 14,
    defaultOverheadPerM: 720,
    defaultLengthM: 1000,
    spec: {
      standard: "IS 7098-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "3.5C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 compacted",
      conductorSizeSqMm: 185,
      neutralSizeSqMm: 95,
      insulation: "XLPE",
      armour: "GI strip (GSS)",
      sheath: "FRLS PVC",
      flameClass: "FRLS",
    },
  },
  {
    id: "PRESET-AL-95-4C",
    displayName: "Aluminium armoured 95 — 4 core",
    description: "Mid-size LT distribution cable. XLPE, round-wire armoured.",
    defaultMarginPct: 15,
    defaultOverheadPerM: 360,
    defaultLengthM: 1000,
    spec: {
      standard: "IS 7098-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "4C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 compacted",
      conductorSizeSqMm: 95,
      insulation: "XLPE",
      armour: "GI round wire (GSW)",
      sheath: "FR PVC",
      flameClass: "FR",
    },
  },
  {
    id: "PRESET-AL-50-4C",
    displayName: "Aluminium armoured 50 — 4 core",
    description: "Small LT distribution cable for sub-feeders.",
    defaultMarginPct: 16,
    defaultOverheadPerM: 220,
    defaultLengthM: 1000,
    spec: {
      standard: "IS 1554-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "4C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 (stranded)",
      conductorSizeSqMm: 50,
      insulation: "PVC (Type A)",
      armour: "GI round wire (GSW)",
      sheath: "PVC (ST1)",
      flameClass: "Standard",
    },
  },
  {
    id: "PRESET-CU-185-4C",
    displayName: "Copper armoured 185 — 4 core",
    description: "Heavy copper LT cable. HR PVC, round-wire armoured.",
    defaultMarginPct: 13,
    defaultOverheadPerM: 920,
    defaultLengthM: 600,
    spec: {
      standard: "IS 1554-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "4C",
      conductorMaterial: "Copper",
      conductorClass: "Class 2 (stranded)",
      conductorSizeSqMm: 185,
      insulation: "PVC (Type C)",
      armour: "GI round wire (GSW)",
      sheath: "PVC (ST2)",
      flameClass: "FR",
    },
  },
  {
    id: "PRESET-CU-70-4C",
    displayName: "Copper armoured 70 — 4 core",
    description: "Mid copper LT cable for machine and panel feeds.",
    defaultMarginPct: 15,
    defaultOverheadPerM: 480,
    defaultLengthM: 500,
    spec: {
      standard: "IS 1554-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "4C",
      conductorMaterial: "Copper",
      conductorClass: "Class 2 (stranded)",
      conductorSizeSqMm: 70,
      insulation: "PVC (Type C)",
      armour: "GI round wire (GSW)",
      sheath: "FR PVC",
      flameClass: "FR",
    },
  },
  {
    id: "PRESET-CU-16-3C-FLEX",
    displayName: "Copper flexible 16 — 3 core",
    description: "Flexible copper cable for portable / panel wiring. FRLS.",
    defaultMarginPct: 18,
    defaultOverheadPerM: 140,
    defaultLengthM: 500,
    spec: {
      standard: "IS 694",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "3C",
      conductorMaterial: "Copper",
      conductorClass: "Class 5 (flexible)",
      conductorSizeSqMm: 16,
      insulation: "PVC (Type A)",
      armour: "Unarmoured",
      sheath: "FRLS PVC",
      flameClass: "FRLS",
    },
  },
  {
    id: "PRESET-SOLAR-6-1C",
    displayName: "Solar DC cable 6 — 1 core",
    description: "UV-resistant DC string cable. XLPO, zero-halogen.",
    defaultMarginPct: 20,
    defaultOverheadPerM: 60,
    defaultLengthM: 2000,
    spec: {
      standard: "IEC 60502-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "1C",
      conductorMaterial: "Copper",
      conductorClass: "Class 5 (flexible)",
      conductorSizeSqMm: 6,
      insulation: "XLPO (solar/UV)",
      armour: "Unarmoured",
      sheath: "Zero-halogen (ZHFR/LSZH)",
      flameClass: "LSZH",
    },
  },
  {
    id: "PRESET-SOLAR-16-1C",
    displayName: "Solar DC cable 16 — 1 core",
    description: "Larger UV-resistant DC main cable for solar parks.",
    defaultMarginPct: 19,
    defaultOverheadPerM: 110,
    defaultLengthM: 2000,
    spec: {
      standard: "IEC 60502-1",
      voltageGrade: "650/1100 V (1.1 kV)",
      cores: "1C",
      conductorMaterial: "Copper",
      conductorClass: "Class 5 (flexible)",
      conductorSizeSqMm: 16,
      insulation: "XLPO (solar/UV)",
      armour: "Unarmoured",
      sheath: "Zero-halogen (ZHFR/LSZH)",
      flameClass: "LSZH",
    },
  },
  {
    id: "PRESET-HT-11KV-300-1C",
    displayName: "11kV screened 300 — 1 core (Aluminium)",
    description: "HT single-core cable, screened, aluminium-wire armoured.",
    defaultMarginPct: 16,
    defaultOverheadPerM: 1260,
    defaultLengthM: 1000,
    spec: {
      standard: "IS 7098-2",
      voltageGrade: "6.35/11 kV",
      cores: "1C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 compacted",
      conductorSizeSqMm: 300,
      insulation: "XLPE",
      armour: "Aluminium wire (AWA)",
      sheath: "FRLS PVC",
      flameClass: "FRLS",
      screened: true,
    },
  },
  {
    id: "PRESET-HT-11KV-185-3C",
    displayName: "11kV screened 185 — 3 core (Aluminium)",
    description: "HT three-core feeder, screened, strip armoured.",
    defaultMarginPct: 15,
    defaultOverheadPerM: 1480,
    defaultLengthM: 800,
    spec: {
      standard: "IS 7098-2",
      voltageGrade: "6.35/11 kV",
      cores: "3C",
      conductorMaterial: "Aluminium",
      conductorClass: "Class 2 compacted",
      conductorSizeSqMm: 185,
      insulation: "XLPE",
      armour: "GI strip (GSS)",
      sheath: "FRLS PVC",
      flameClass: "FRLS",
      screened: true,
    },
  },
];

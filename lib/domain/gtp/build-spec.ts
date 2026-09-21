import type { DerivedLineMass } from "@/lib/domain/costing";
import { deriveLtMass, isMassGap, LAY_UP_FACTOR, type DerivedMass } from "./mass";
import { fieldNumber, type GtpSpecSource } from "./spec-from-fields";

export interface BuildLayer {
  layer: string;
  declaredMm: number;
  floorMm: number | null;
  builtMm: number;
  clause: string;
}
export interface BuildSpec {
  constructionKey?: string;
  specId: string;
  layers: BuildLayer[];
  massAtDeclaredKgPerKm: number;
  massAtBuiltKgPerKm: number;
}

export function constructionKey(source: GtpSpecSource): string {
  const c = source.config;
  return JSON.stringify([c.standard, c.coreCount, c.csaSqMm, c.material, c.armoured, source.armourForm, c.conductorClass ?? "Class 2"]);
}

export function buildSpecFromFields(specId: string, source: GtpSpecSource, targets: Record<string, number> = {}): BuildSpec {
  if (source.fields.some((f) => f.gap)) throw new Error("Resolve every GTP gap before setting a build target");
  const layers = source.fields.filter((f) => f.key.startsWith("lt.") && !f.key.startsWith("lt.calc.") && /^\s*\d+(?:\.\d+)? mm$/.test(String(f.value))).map((field): BuildLayer => {
    const declaredMm = fieldNumber(source.fields, field.key);
    const floorMm = field.tolerance?.origin === "is-rule" ? field.tolerance.floorMm ?? null : null;
    const builtMm = targets[field.key] ?? declaredMm;
    const clause = field.tolerance?.origin === "is-rule" ? field.tolerance.trace : field.trace;
    if (!Number.isFinite(builtMm) || builtMm < (floorMm ?? declaredMm) || (floorMm === null && builtMm !== declaredMm)) {
      throw new Error(`${field.label}: target ${builtMm} mm is not permitted; minimum ${(floorMm ?? declaredMm).toFixed(2)} mm — ${clause}`);
    }
    return { layer: field.key, declaredMm, floorMm, builtMm, clause };
  });
  for (const key of Object.keys(targets)) if (!layers.some((l) => l.layer === key)) throw new Error(`Unknown build layer ${key}`);
  const declared = deriveLtMass(source.config, Object.fromEntries(layers.map((l) => [l.layer, l.declaredMm])));
  const built = deriveLtMass(source.config, Object.fromEntries(layers.map((l) => [l.layer, l.builtMm])));
  if (isMassGap(declared)) throw new Error(declared.missing);
  if (isMassGap(built)) throw new Error(built.missing);
  return { specId, constructionKey: constructionKey(source), layers, massAtDeclaredKgPerKm: declared.totalKgPerKm, massAtBuiltKgPerKm: built.totalKgPerKm };
}

export function targetsFromBuild(build?: BuildSpec): Record<string, number> {
  return Object.fromEntries(build?.layers.map((l) => [l.layer, l.builtMm]) ?? []);
}

export function lineMassFromDerived(mass: DerivedMass): DerivedLineMass {
  const perM = (...layers: string[]) => mass.components.filter((c) => layers.includes(c.layer)).reduce((s, c) => s + c.massKgPerKm, 0) * LAY_UP_FACTOR / 1000;
  return { insulationKgPerM: perM("Insulation"), armourKgPerM: perM("Armour"), sheathKgPerM: perM("Inner sheath", "Outer sheath"), workings: mass.workings };
}

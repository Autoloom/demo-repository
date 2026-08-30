/**
 * Solar DC → GTP field set (IS 17293 : 2020).
 *
 * The simplest of the three engines, and deliberately so: solar cable is single-core with flat
 * per-size tables, so there is no build-up chain and no calculated diameter. Insulation and
 * sheath thickness are read straight from Table 1 or Table 2.
 *
 * What this type has that the others do not is APPLICATION-DEPENDENT data. The conductor class,
 * the dimensional table, the current rating and the bending radius all change with how the cable
 * is installed — so `installation` is a required input, not a nicety.
 */
import {
  IS17293_CORE_COLOUR, IS17293_HANDLING, IS17293_MARKING, IS17293_SCOPE, IS17293_SHEATH,
  IS17293_VOLTAGE_TEST, conductorClassFor, currentCarryingCapacityA, insulationToleranceFloorMm,
  minimumBendingRadiusMm, sheathToleranceFloorMm, solarDimensions,
} from "@/lib/domain/standards/is17293-2020";
import type { SolarInstallationMethod } from "@/lib/domain/standards/is17293-2020";

import type { DerivationQuirks } from "./derive";
import { bandTolerance, floorTolerance, notApplicable, withMandatoryTolerance } from "./tolerance";
import type { ResolvedField } from "./types";

const FIXED = {
  manufacturer: "Navya Cables Pvt. Ltd.",
  isiLicence: "CM/L-1234567",
};

export interface SolarCableConfig {
  csaSqMm: number;
  /** Drives the conductor class AND which dimensional table applies (§4.1). */
  directlyConnectedToModules: boolean;
  /** Drives the current rating (Table 7). */
  installationMethod: SolarInstallationMethod;
  /** Ambient at the array. Required — 40 °C is the table's base, not a safe assumption. */
  ambientC: number;
}

const REF = "IS 17293 : 2020";

export function deriveSolarFields(
  config: SolarCableConfig,
  opts: { customerName?: string; quirks?: DerivationQuirks } = {},
): ResolvedField[] {
  const { klass, ref: classRef } = conductorClassFor(config.directlyConnectedToModules);
  const dims = solarDimensions(config.csaSqMm, klass);
  const current = currentCarryingCapacityA({
    csaSqMm: config.csaSqMm,
    method: config.installationMethod,
    ambientC: config.ambientC,
  });
  const bending = minimumBendingRadiusMm({
    overallDiaMm: dims.values.meanOverallDiaMm,
    use: config.directlyConnectedToModules ? "flexible-moving" : "fixed-normal",
  });

  const fields: ResolvedField[] = [
    { key: "mfr.name", label: "Manufacturer", value: FIXED.manufacturer, tag: "FIXED", source: "profile", trace: "Org constant", editable: false },
    { key: "mfr.isiLicence", label: "ISI licence no.", value: FIXED.isiLicence, tag: "FIXED", source: "profile", trace: "Org constant", editable: false, gap: true },

    { key: "cable.standard", label: "Applicable standard", value: REF, tag: "FIXED", source: "is-table", trace: "Indian solar cable standard", editable: false },
    { key: "cable.size", label: "Nominal conductor area", value: `${config.csaSqMm} sq mm`, tag: "CHOICE", source: "order", trace: "As ordered", editable: false },
    {
      key: "solar.conductorClass",
      label: "Conductor class",
      value: klass,
      tag: "LOOKUP",
      source: "is-table",
      // The class is NOT a preference — it follows from how the cable is used.
      trace: classRef,
      editable: false,
    },
    { key: "cable.material", label: "Conductor material", value: "Annealed tinned copper (ATC)", tag: "FIXED", source: "is-table", trace: `${REF}, §4.1 — per IS 8130 : 2013`, editable: false },
    { key: "cable.cores", label: "No. of cores", value: 1, tag: "FIXED", source: "is-table", trace: `${REF}, §1 — single core`, editable: false },

    { key: "cable.ratedVoltage", label: "Rated voltage", value: `${IS17293_SCOPE.ratedVoltageDcV} V d.c. / ${IS17293_SCOPE.ratedVoltageAcV} V a.c.`, tag: "FIXED", source: "is-table", trace: `${REF}, §1`, editable: false },
    {
      key: "cable.maxSystemVoltage",
      label: "Max system voltage",
      value: `${IS17293_SCOPE.maxSystemVoltageDcV} V d.c.`,
      tag: "FIXED",
      source: "is-table",
      // A separate limit from the cable rating, and the one an installer actually needs.
      trace: `${REF}, Annex A-1 — the SYSTEM must not exceed this, though the cable is rated ${IS17293_SCOPE.ratedVoltageDcV} V`,
      editable: false,
    },
    { key: "cable.maxTempContinuous", label: "Max conductor temp (continuous)", value: `${IS17293_SCOPE.maxContinuousConductorTempC} °C`, tag: "FIXED", source: "is-table", trace: `${REF}, §1`, editable: false },
    {
      key: "cable.maxTempExcursion",
      label: "Max conductor temp (limited period)",
      value: `${IS17293_SCOPE.excursionConductorTempC} °C for ${IS17293_SCOPE.excursionMaxHours.toLocaleString("en-IN")} h max`,
      tag: "FIXED",
      source: "is-table",
      trace: `${REF}, §1 — time-limited, NOT a continuous rating`,
      editable: false,
    },
    { key: "cable.shortCircuitTemp", label: "Short-circuit temp", value: `${IS17293_SCOPE.shortCircuitTempC} °C for ${IS17293_SCOPE.shortCircuitMaxSeconds} s max`, tag: "FIXED", source: "is-table", trace: `${REF}, Annex A-3`, editable: false },

    // ── Dimensions, straight from the table ────────────────────────────────────────────────
    // Each thickness carries its own acceptance floor in the tolerance column rather than as a
    // separate row, so a reader sees the nominal and its limit on one line.
    {
      key: "solar.insulationThickness",
      label: "Insulation thickness",
      value: `${dims.values.insulationThicknessMm.toFixed(2)} mm`,
      tag: "LOOKUP",
      source: "is-table",
      trace: dims.ref,
      editable: false,
      tolerance: floorTolerance(
        dims.values.insulationThicknessMm,
        insulationToleranceFloorMm(dims.values.insulationThicknessMm),
        `${REF}, §5.3 — nominal ${dims.values.insulationThicknessMm} − (0.1 + 0.1 × ${dims.values.insulationThicknessMm})`,
      ),
    },
    {
      key: "solar.sheathThickness",
      label: "Sheath thickness",
      value: `${dims.values.sheathThicknessMm.toFixed(2)} mm`,
      tag: "LOOKUP",
      source: "is-table",
      trace: dims.ref,
      editable: false,
      // §6.3 uses 0.15 where §5.3 uses 0.1 — the sheath gets a wider negative tolerance. This is
      // why the floor rules cannot be collapsed into one shared helper.
      tolerance: floorTolerance(
        dims.values.sheathThicknessMm,
        sheathToleranceFloorMm(dims.values.sheathThicknessMm),
        `${REF}, §6.3 — nominal ${dims.values.sheathThicknessMm} − (0.1 + 0.15 × ${dims.values.sheathThicknessMm})`,
      ),
    },
    {
      key: "solar.overallDia",
      label: "Mean overall diameter",
      value: `${dims.values.meanOverallDiaMm.toFixed(1)} mm`,
      tag: "LOOKUP",
      source: "is-table",
      // The tables footnote this explicitly, and it must carry through to the document.
      trace: `${dims.ref} — indicative value for information only`,
      editable: false,
      // Not an omission: the standard prints this figure for information and states no limit,
      // so any tolerance we attached would be one we invented.
      tolerance: notApplicable(`${REF}, Tables 1/2 — indicative value for information only, no limit specified`),
    },
    { key: "solar.ovality", label: "Max ovality", value: "15%", tag: "FIXED", source: "is-table", trace: `${REF}, §11.3.3`, editable: false },

    // ── Electrical ─────────────────────────────────────────────────────────────────────────
    { key: "solar.insulationResistance20", label: "Min insulation resistance @20 °C", value: `${dims.values.insulationResistanceAt20CMOhmKm} MΩ·km`, tag: "LOOKUP", source: "is-table", trace: dims.ref, editable: false },
    { key: "solar.insulationResistance90", label: "Min insulation resistance @90 °C", value: `${dims.values.insulationResistanceAt90CMOhmKm} MΩ·km`, tag: "LOOKUP", source: "is-table", trace: dims.ref, editable: false },
    {
      key: "solar.currentRating",
      label: "Current carrying capacity",
      value: `${current.amps} A`,
      tag: "CALC",
      source: "calc",
      // The de-rating is the point: at 60 °C ambient this is 78 % of the tabulated figure.
      trace: `${current.ref} — ${current.baseAmps} A at 40 °C × ${current.factor} for ${config.ambientC} °C ambient`,
      editable: false,
    },
    { key: "solar.voltageTest", label: "Voltage test on completed cable", value: `${IS17293_VOLTAGE_TEST.acKv} kV a.c. or ${IS17293_VOLTAGE_TEST.dcKv} kV d.c., ${IS17293_VOLTAGE_TEST.durationMin} min`, tag: "FIXED", source: "is-table", trace: IS17293_VOLTAGE_TEST.ref, editable: false },

    // ── Installation ───────────────────────────────────────────────────────────────────────
    { key: "solar.bendingRadius", label: "Min bending radius", value: `${bending.radiusMm} mm (${bending.multiple}D)`, tag: "CALC", source: "calc", trace: bending.ref, editable: false },
    { key: "solar.directBurial", label: "Direct burial", value: "Not permitted", tag: "FIXED", source: "is-table", trace: `${REF}, Table 5`, editable: false },
    { key: "solar.storageTemp", label: "Max storage temperature", value: `${IS17293_HANDLING.maxStorageTempC} °C`, tag: "FIXED", source: "is-table", trace: IS17293_HANDLING.ref, editable: false },

    // ── Sheath and marking ─────────────────────────────────────────────────────────────────
    { key: "solar.sheathColour", label: "Sheath colour", value: IS17293_SHEATH.preferredColour, tag: "CHOICE", source: "is-table", trace: `${REF}, §6.4 — preferred; other colours by agreement`, editable: true },
    { key: "solar.coreColour", label: "Core colour", value: IS17293_CORE_COLOUR.preferred.join(" or "), tag: "CHOICE", source: "is-table", trace: `${REF}, §9`, editable: true },
    { key: "mark.code", label: "Code designation", value: IS17293_MARKING.codeDesignation, tag: "FIXED", source: "is-table", trace: `${REF}, §8`, editable: false },
    { key: "mark.legend", label: "Mandatory legend", value: IS17293_MARKING.mandatoryLegend, tag: "FIXED", source: "is-table", trace: `${REF}, §8 — required in addition to the code`, editable: false },
    { key: "mark.interval", label: "Max gap between marks", value: `${IS17293_MARKING.maxGapBetweenMarksMm} mm`, tag: "FIXED", source: "is-table", trace: `${REF}, §8.1`, editable: false },
    { key: "drum.atc", label: "Drum marking", value: "Must carry the word 'ATC'", tag: "FIXED", source: "is-table", trace: `${REF}, §12.2(g)`, editable: false },
  ];

  // ── Customer quirks that mean something on a solar cable ──────────────────────────────────
  // Sag, messenger and armour are absent by design: none exists on this cable type.
  const quirks = opts.quirks;
  if (quirks?.markingLegend) {
    fields.push({
      key: "mark.customerLegend",
      label: "Additional customer legend",
      value: quirks.markingLegend,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? opts.customerName ?? "Customer"} profile — in addition to the mandatory IS marking`,
      editable: true,
    });
  }
  if (quirks?.drumLengthM != null) {
    fields.push({
      key: "drum.standardLength",
      label: "Standard drum length",
      value: `${quirks.drumLengthM} m`,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile`,
      editable: true,
      // A commercial term, not a standards limit — hence `customer`, never `is-rule`.
      tolerance: quirks.drumLengthTolerance
        ? bandTolerance(
            quirks.drumLengthTolerance,
            "customer",
            `${quirks.customerName ?? "Customer"} profile — agreed drum length tolerance`,
          )
        : undefined,
    });
  }

  fields.push({
    key: "cert.standard",
    label: "Conforms to",
    value: REF,
    tag: "FIXED",
    source: "is-table",
    trace: opts.customerName ? `For ${opts.customerName}` : "Standards conformance",
    editable: false,
  });

  // Tolerance is a mandatory column — see withMandatoryTolerance.
  return withMandatoryTolerance(fields);
}

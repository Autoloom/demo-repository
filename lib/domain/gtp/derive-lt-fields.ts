/**
 * LT power / control → GTP field set.
 *
 * Adapts the build-up chain in derive-lt.ts into the same `ResolvedField[]` shape the AB engine
 * produces, so the builder, validator and PDF renderer need no per-type branching downstream.
 *
 * The fields themselves are NOT the AB fields. An LT power GTP has no messenger and no
 * street-light core; it has an armour, an inner sheath and (for 3½ core) a reduced neutral —
 * so the field KEYS differ by design. That is the whole point: selecting a different cable type
 * must produce a different schedule, not the same schedule with different numbers.
 *
 * Every step of the chain becomes a field carrying its `keyedBy` in the trace, because on this
 * cable type "why is the outer sheath 2.36 mm?" is answered by a calculated diameter, not by
 * the conductor size an operator can see.
 */
import { IS1554_1_MANDATORY_LEGEND, IS1554_1_THERMAL } from "@/lib/domain/standards/is1554-1-1988";
import { IS7098_1_RATED_VOLTAGE, IS7098_1_THERMAL } from "@/lib/domain/standards/is7098-1-2025";
import { insulationToleranceFloorMm } from "@/lib/domain/standards/protective-coverings";

import { deriveLtCable } from "./derive-lt";
import type { LtCableConfig } from "./derive-lt";
import type { ResolvedField } from "./types";

/** Org constants, shared with the AB engine. Kept in sync deliberately, not imported cyclically. */
const FIXED = {
  manufacturer: "Navya Cables Pvt. Ltd.",
  isiLicence: "CM/L-1234567",
};

/** Map a chain step's unit to its printed suffix. */
function withUnit(value: number, unit: string): string {
  return unit === "sq mm" ? `${value} sq mm` : unit === "ohm/km" ? `${value} ohm/km` : `${value.toFixed(2)} mm`;
}

/**
 * Build the LT field set.
 *
 * Throws only where the standards genuinely do not cover the cable — the caller surfaces that
 * rather than emitting a GTP with a guessed value.
 */
export function deriveLtFields(config: LtCableConfig, opts: { customerName?: string } = {}): ResolvedField[] {
  const chain = deriveLtCable(config);
  const isXlpe = config.standard === "IS7098-1";
  const standardRef = isXlpe ? "IS 7098 (Part 1) : 2025" : "IS 1554 (Part 1) : 1988";
  const fields: ResolvedField[] = [];

  // ── Manufacturer ────────────────────────────────────────────────────────────────────────
  fields.push(
    { key: "mfr.name", label: "Manufacturer", value: FIXED.manufacturer, tag: "FIXED", source: "profile", trace: "Org constant", editable: false },
    { key: "mfr.isiLicence", label: "ISI licence no.", value: FIXED.isiLicence, tag: "FIXED", source: "profile", trace: "Org constant", editable: false, gap: true },
  );

  // ── Cable identity ──────────────────────────────────────────────────────────────────────
  const coreLabel = config.coreCount === 3.5 ? "3½" : String(config.coreCount);
  fields.push(
    {
      key: "cable.standard",
      label: "Applicable standard",
      value: standardRef,
      tag: "FIXED",
      source: "is-table",
      trace: isXlpe ? "XLPE insulated, thermoplastic sheathed" : "PVC insulated, heavy duty",
      editable: false,
    },
    {
      key: "cable.cores",
      label: "No. of cores",
      value: coreLabel,
      tag: "CHOICE",
      source: "order",
      trace: config.coreCount === 3.5 ? "Three full cores plus a reduced neutral" : "As ordered",
      editable: false,
    },
    {
      key: "cable.size",
      label: "Nominal conductor area",
      value: `${config.csaSqMm} sq mm`,
      tag: "CHOICE",
      source: "order",
      trace: "As ordered",
      editable: false,
    },
    {
      key: "cable.material",
      label: "Conductor material",
      value: config.material === "AL" ? "Aluminium" : "Copper",
      tag: "CHOICE",
      source: "order",
      trace: "As ordered",
      editable: false,
    },
    {
      key: "cable.ratedVoltage",
      label: "Rated voltage",
      value: `${IS7098_1_RATED_VOLTAGE.acMaxV} V a.c. / ${IS7098_1_RATED_VOLTAGE.dcMaxV} V d.c.`,
      tag: "FIXED",
      source: "is-table",
      trace: `${standardRef}, §1.2`,
      editable: false,
    },
  );

  // ── Thermal ─────────────────────────────────────────────────────────────────────────────
  const thermal = isXlpe ? IS7098_1_THERMAL : IS1554_1_THERMAL.generalPurpose;
  fields.push(
    {
      key: "cable.maxTempContinuous",
      label: "Max conductor temp (continuous)",
      value: `${thermal.maxContinuousConductorTempC} °C`,
      tag: "FIXED",
      source: "is-table",
      trace: isXlpe ? IS7098_1_THERMAL.ref : IS1554_1_THERMAL.ref,
      editable: false,
    },
    {
      key: "cable.maxTempShortCircuit",
      label: "Max conductor temp (short circuit)",
      value: `${thermal.maxShortCircuitConductorTempC} °C`,
      tag: "FIXED",
      source: "is-table",
      trace: isXlpe ? IS7098_1_THERMAL.ref : IS1554_1_THERMAL.ref,
      editable: false,
    },
  );

  // ── The build-up chain, step by step ────────────────────────────────────────────────────
  // Each step keeps its `keyedBy` in the trace: on this cable type the sheath thicknesses are
  // driven by calculated diameters, and a reviewer must be able to follow that.
  for (const step of chain.steps) {
    const isCalc = step.id.startsWith("calc.");
    fields.push({
      key: `lt.${step.id}`,
      label: step.label,
      value: withUnit(step.value, step.unit),
      tag: isCalc ? "CALC" : "LOOKUP",
      source: isCalc ? "calc" : "is-table",
      trace: step.keyedBy ? `${step.ref} — keyed by ${step.keyedBy}` : step.ref,
      editable: false,
    });
  }

  // ── Insulation tolerance (a printed requirement, not a derived dimension) ────────────────
  fields.push({
    key: "lt.insulationTolerance",
    label: "Insulation thickness, min at any point",
    value: `${insulationToleranceFloorMm(chain.insulationThicknessMm).toFixed(2)} mm`,
    tag: "CALC",
    source: "calc",
    trace: `${standardRef}, §10.3 — nominal ${chain.insulationThicknessMm} − (0.1 + 0.1 × ${chain.insulationThicknessMm})`,
    editable: false,
  });

  // ── Armour ──────────────────────────────────────────────────────────────────────────────
  if (config.armoured) {
    fields.push({
      key: "lt.armourCoverage",
      label: "Armour coverage",
      value: "90% minimum",
      tag: "FIXED",
      source: "is-table",
      trace: `${standardRef}, §14.1.2 (measured per Annex C)`,
      editable: false,
    });
  } else {
    fields.push({
      key: "lt.armour",
      label: "Armour",
      value: "Unarmoured",
      tag: "CHOICE",
      source: "order",
      trace: "As ordered",
      editable: false,
    });
  }

  // ── Marking ─────────────────────────────────────────────────────────────────────────────
  if (!isXlpe) {
    // §17.2 — PVC cables to IS 1554-1 must carry this word, to tell them from telephone cable.
    fields.push({
      key: "mark.legend",
      label: "Mandatory legend",
      value: IS1554_1_MANDATORY_LEGEND,
      tag: "FIXED",
      source: "is-table",
      trace: "IS 1554 (Part 1) : 1988, §17.2",
      editable: false,
    });
  }

  fields.push({
    key: "cert.standard",
    label: "Conforms to",
    value: standardRef,
    tag: "FIXED",
    source: "is-table",
    trace: opts.customerName ? `For ${opts.customerName}` : "Standards conformance",
    editable: false,
  });

  return fields;
}

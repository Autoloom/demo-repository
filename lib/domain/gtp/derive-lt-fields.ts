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
import { coreIdentification } from "@/lib/domain/standards/core-identification";
import { fictitiousDiameterCaveat } from "@/lib/domain/standards/is10462-1-1983";
import { insulationToleranceFloorMm } from "@/lib/domain/standards/protective-coverings";

import { deriveLtCable } from "./derive-lt";
import type { LtCableConfig } from "./derive-lt";
import type { DerivationQuirks } from "./derive";
import { deriveLtMass, isMassGap } from "./mass";
import { bandTolerance, floorTolerance, notApplicable, withMandatoryTolerance } from "./tolerance";
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
export function deriveLtFields(
  config: LtCableConfig,
  opts: { customerName?: string; quirks?: DerivationQuirks } = {},
): ResolvedField[] {
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
  // The insulation clause differs between the two standards this engine serves: IS 7098-1 puts
  // the thickness tolerance at §10.3, IS 1554-1 at §9.3. Citing one for both would send an
  // inspector to a clause about something else.
  const insulationToleranceClause = isXlpe ? "§10.3" : "§9.3";

  // Some discoms print thicknesses as "(Min)" rather than a nominal ±. The floor below already
  // IS a minimum, so their phrasing and the standard agree — this only records whose convention
  // it matches, and never changes the number.
  const phrasingNote =
    opts.quirks?.tolerancePhrasing === "min"
      ? ` — ${opts.quirks.customerName ?? opts.customerName ?? "Customer"} prints thicknesses as "(Min)"`
      : "";

  for (const step of chain.steps) {
    const isCalc = step.id.startsWith("calc.");
    fields.push({
      key: `lt.${step.id}`,
      label: step.label,
      value: withUnit(step.value, step.unit),
      tag: isCalc ? "CALC" : "LOOKUP",
      source: isCalc ? "calc" : "is-table",
      // §0.4: a fictitious diameter selects sheath and armour rows; it is NOT the finished
      // cable's diameter, which "should be calculated separately". Saying so on the row stops a
      // reader taking D_X for the cable they will put on a drum — which matters most on sector
      // conductors, where the real cable is appreciably smaller than the fictitious figure.
      trace: isCalc
        ? `${step.keyedBy ? `${step.ref} — keyed by ${step.keyedBy}` : step.ref}. ${fictitiousDiameterCaveat}`
        : step.keyedBy
          ? `${step.ref} — keyed by ${step.keyedBy}`
          : step.ref,
      editable: false,
      // Only the insulation carries a tolerance. The inner and outer sheath values this chain
      // prints are ALREADY minima from the protective-coverings tables, so attaching a floor to
      // them would be a floor on a floor. Do not "fix" this by reusing the insulation rule:
      // IS 17293 proves insulation and sheath coefficients genuinely differ (0.1 vs 0.15), and
      // IS 7098-1 / IS 1554-1 publish no sheath tolerance for us to encode.
      tolerance:
        step.id === "insulation"
          ? floorTolerance(
              step.value,
              insulationToleranceFloorMm(step.value),
              `${standardRef}, ${insulationToleranceClause} — nominal ${step.value} − (0.1 + 0.1 × ${step.value})${phrasingNote}`,
            )
          : step.id === "innerSheath" || step.id === "outerSheath"
            ? notApplicable(`${standardRef} publishes this as a minimum — a tolerance on a minimum would be a second, lower limit`)
            : undefined,
    });
  }

  // ── Conductor form ──────────────────────────────────────────────────────────────────────
  // A stated construction particular an inspector checks against the cable. LT power aluminium
  // is generally sector-shaped and compacted; IS 8130 §3.3 permits solid, circular, shaped,
  // compacted, stranded or bunched "as required by the appropriate cable specification", and
  // §5.3 covers compacted circular and shaped conductors under one clause with one wire-count
  // table. This row does NOT move any dimension — see the note on LtCableConfig.shape.
  {
    const shape = config.shape ?? (config.material === "AL" ? "sector" : "circular");
    fields.push({
      key: "lt.conductorForm",
      label: "Form of conductor",
      value: shape === "sector" ? "Shaped (sector), compacted" : "Circular, compacted",
      tag: "CHOICE",
      source: "order",
      trace:
        "IS 8130 : 2013, §3.3 (form as required by the cable specification); §5.3 covers " +
        "compacted circular and shaped conductors together, with the same minimum wire count " +
        "and the same maximum resistance",
      editable: true,
    });
  }

  // ── Core identification ─────────────────────────────────────────────────────────────────
  // A particular an inspector checks against the drum, so it is derived from the standard's own
  // clause rather than left to a customer profile. A profile may still override it below.
  if (!opts.quirks?.coreIdentification) {
    const ident = coreIdentification(config.standard, config.coreCount);
    fields.push({
      key: "cable.identification",
      label: "Core identification",
      value: ident.printed,
      tag: "LOOKUP",
      source: "is-table",
      trace: ident.alternative ? `${ident.ref}. ${ident.alternative}` : ident.ref,
      editable: true,
    });
  }

  // ── Armour ──────────────────────────────────────────────────────────────────────────────
  if (config.armoured) {
    // The size as a buyer writes it. The chain already carries thickness and width as separate
    // traced steps; this row is the pair read back in the form the manufacturer asked for
    // ("Galvanised Steel Strip Armour size 4 × 0.8 mm"), so a GTP does not make a reader
    // assemble it from two rows.
    if (chain.armourForm === "formed-wire" && chain.armourDiaOrThicknessMm != null) {
      const size =
        chain.armourWidthMm != null
          ? `${chain.armourWidthMm} × ${chain.armourDiaOrThicknessMm} mm`
          : `${chain.armourDiaOrThicknessMm} mm thick`;
      fields.push({
        key: "lt.armourSize",
        label: "Armour size (galvanised steel strip)",
        value: size,
        tag: "LOOKUP",
        source: "is-table",
        trace: `${standardRef}, Table 6 — method ${chain.armourMethod ?? "A"}; width nominal, it takes no part in the build-up`,
        editable: false,
      });
    } else if (chain.armourForm === "round-wire" && chain.armourDiaOrThicknessMm != null) {
      fields.push({
        key: "lt.armourSize",
        label: "Armour size (galvanised round steel wire)",
        value: `${chain.armourDiaOrThicknessMm} mm dia`,
        tag: "LOOKUP",
        source: "is-table",
        trace: `${standardRef}, Table 6 — keyed by the calculated diameter under armour`,
        editable: false,
      });
    }
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

  // ── Customer quirks ─────────────────────────────────────────────────────────────────────
  // Only the quirks that MEAN something on this cable type are applied. Sag and messenger
  // construction are AB concepts — an underground armoured cable has neither — so they are
  // deliberately absent rather than rendered as empty rows.
  const quirks = opts.quirks;
  if (quirks?.markingLegend) {
    fields.push({
      key: "mark.customerLegend",
      label: "Marking legend",
      value: quirks.markingLegend,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? opts.customerName ?? "Customer"} profile — verbatim as demanded`,
      editable: true,
    });
  }
  if (quirks?.embossingIntervalM != null) {
    fields.push({
      key: "mark.interval",
      label: "Embossing interval",
      value: `${quirks.embossingIntervalM} m`,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile`,
      editable: true,
    });
  }
  if (quirks?.coreIdentification) {
    fields.push({
      key: "cable.identification",
      label: "Core identification",
      value: quirks.coreIdentification,
      tag: "QUIRK",
      source: "profile",
      trace: `${quirks.customerName ?? "Customer"} profile`,
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
  // A `lt.tolerancePhrasing` row used to sit here, explaining that thicknesses were minima rather
  // than nominal ±. It existed only because this engine had nowhere to put a tolerance. The
  // tolerance column now says "min 1.52 mm" on the row itself, so the explanatory row would be a
  // legend for something already visible. The customer's phrasing survives in the insulation
  // tolerance's trace.

  fields.push({
    key: "cert.standard",
    label: "Conforms to",
    value: standardRef,
    tag: "FIXED",
    source: "is-table",
    trace: opts.customerName ? `For ${opts.customerName}` : "Standards conformance",
    editable: false,
  });

  // ── Finished mass ─────────────────────────────────────────────────────────────────────────
  // Derived from this same chain, layer by layer, so a printed dimension and a priced mass can
  // never disagree. The quote reads this field; before it existed the quote estimated from
  // coefficients and was ~35% out on a comparable cable.
  const massResult = deriveLtMass(config);
  if (isMassGap(massResult)) {
    // A missing dimension is stated, never guessed. `gap: true` blocks a real GTP and tells the
    // quote it must not price this cable.
    fields.push({
      key: "fin.totalMass",
      label: "Total mass (approx.)",
      value: "—",
      tag: "CALC",
      source: "calc",
      trace: `Cannot derive: ${massResult.missing}`,
      editable: false,
      gap: true,
    });
  } else {
    fields.push({
      key: "fin.totalMass",
      label: "Total mass (approx.)",
      value: `${massResult.totalKgPerKm.toFixed(0)} kg/km`,
      tag: "CALC",
      source: "calc",
      trace: massResult.workings,
      editable: false,
      tolerance: bandTolerance(
        "±5%",
        "works-estimate",
        "Works spread on a mass derived from the IS build-up chain — see the trace for each layer",
      ),
    });
  }

  // Tolerance is a mandatory column — see withMandatoryTolerance.
  return withMandatoryTolerance(fields);
}

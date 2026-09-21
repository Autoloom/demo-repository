"use client";

/**
 * Builder for the armoured / standard families — LT XLPE, LT PVC power, control cable.
 *
 * These share one shape: a single conductor size across N cores, with armour and
 * sheathing. That's exactly what the existing `CableSpec` models and what
 * `computeLine()` already costs, so this screen is a thin form over machinery Sales
 * already relies on — no second costing engine, no divergent arithmetic.
 *
 * (Aerial bunched can't use this: its cores are different sizes from each other, which
 * is why it has its own per-core editor.)
 *
 * WHAT CHANGED AFTER THE CLIENT REVIEW (Laxmikant Shete, Daksha Cable, Sept 2026)
 *  - Armour carries a SIZE, not just a type. Strip defaults to 4 × 0.8 mm GI, and the
 *    cable's dimensions and weight follow from it — see lib/domain/dimensions.ts.
 *  - Core identification is stated, from IS 1554 / IS 7098 cl. 10 rather than invented.
 *  - The reduced neutral comes from IS 7098 Table 2 instead of "half the phase size",
 *    which the standard contradicts at several sizes.
 *  - Control cable offers the full 2–27 core ladder at 1.5 / 2.5 sq mm.
 *
 * HONEST LIMITATION, STILL SHOWN IN THE UI
 * Where a dimensional build-up can be calculated the weights are real. Where it can't
 * — PVC insulation thickness, or core counts whose assembly coefficient we don't hold —
 * costing falls back to the old generic coefficient, and the banner says which you are
 * looking at. An estimate labelled as an estimate is useful; one dressed as approved is not.
 */

import { AlertTriangleIcon, InfoIcon, RulerIcon } from "lucide-react";
import * as React from "react";

import { Card } from "@/components/ui";
import {
  DEFAULT_STRIP_ARMOUR,
  STRIP_ARMOUR_SIZES,
  WIRE_ARMOUR_SIZES,
  checkArmourPermitted,
  defaultDimsFor,
  formatArmourDims,
  isStripArmour,
  type ArmourDims,
} from "@/lib/domain/armour";
import { coreIdentification } from "@/lib/domain/core-identification";
import { MARGIN_GATE_PCT, computeLine, ratesForSpec, type MaterialRates } from "@/lib/domain/costing";
import { buildUpDimensions, reducedNeutralFor } from "@/lib/domain/dimensions";
import { formatINR } from "@/lib/domain/format";
import type { CableFamilyDef } from "@/lib/domain/families";
import type {
  ArmourType,
  CableStandard,
  ConductorMaterial,
  CoreConfig,
  Insulation,
  Material,
  SheathType,
} from "@/lib/services/types";
import { cn } from "@/lib/utils";

/** Power-cable core configurations. */
const POWER_CORE_CONFIGS: CoreConfig[] = ["1C", "2C", "3C", "3.5C", "4C", "5C"];
/** The control-cable ladder from IS 1554 (Part 1), up to the 27 core the client asked for. */
const CONTROL_CORE_CONFIGS: CoreConfig[] = [
  "2C", "3C", "4C", "5C", "6C", "7C", "8C", "10C", "12C", "14C", "16C", "19C", "21C", "24C", "27C", "37C",
];

const POWER_CONDUCTOR_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500];
/** Control cable is a two-size line — IS 1554 and the brochure both say 1.5 and 2.5. */
const CONTROL_CONDUCTOR_SIZES = [1.5, 2.5];

const ARMOURS: ArmourType[] = ["Unarmoured", "GI round wire (GSW)", "GI strip (GSS)", "Aluminium wire (AWA)", "Aluminium strip"];
const INSULATIONS: Insulation[] = ["XLPE", "PVC (Type A)", "PVC (Type C)", "EPR", "XLPO (solar/UV)"];
const SHEATHS: SheathType[] = ["PVC (ST1)", "PVC (ST2)", "FR PVC", "FRLS PVC", "Zero-halogen (ZHFR/LSZH)", "HDPE"];

const isControl = (family: CableFamilyDef) => family.id === "CONTROL_1_1KV";

/** Sensible starting point per family, from the brochure's own description of each line. */
function defaultsForFamily(family: CableFamilyDef) {
  if (family.id === "CONTROL_1_1KV") {
    return {
      conductorMaterial: "Copper" as ConductorMaterial,
      cores: "7C" as CoreConfig,
      conductorSizeSqMm: 2.5,
      armour: "GI round wire (GSW)" as ArmourType,
      insulation: "PVC (Type A)" as Insulation,
      sheath: "PVC (ST1)" as SheathType,
      standard: "IS 1554-1" as CableStandard,
    };
  }
  if (family.id === "LT_PVC_POWER") {
    return {
      conductorMaterial: "Aluminium" as ConductorMaterial,
      cores: "3.5C" as CoreConfig,
      conductorSizeSqMm: 95,
      armour: "GI strip (GSS)" as ArmourType,
      insulation: "PVC (Type A)" as Insulation,
      sheath: "PVC (ST1)" as SheathType,
      standard: "IS 1554-1" as CableStandard,
    };
  }
  // LT XLPE — the flagship line. Strip armour on 3.5 core is the client's stated norm.
  return {
    conductorMaterial: "Aluminium" as ConductorMaterial,
    cores: "3.5C" as CoreConfig,
    conductorSizeSqMm: 240,
    armour: "GI strip (GSS)" as ArmourType,
    insulation: "XLPE" as Insulation,
    sheath: "PVC (ST2)" as SheathType,
    standard: "IS 7098-1" as CableStandard,
  };
}

export function StandardBuilder({ family, materials }: { family: CableFamilyDef; materials: Material[] }) {
  const defaults = React.useMemo(() => defaultsForFamily(family), [family]);

  const [conductorMaterial, setConductorMaterial] = React.useState<ConductorMaterial>(defaults.conductorMaterial);
  const [cores, setCores] = React.useState<CoreConfig>(defaults.cores);
  const [conductorSizeSqMm, setConductorSizeSqMm] = React.useState(defaults.conductorSizeSqMm);
  const [neutralSizeSqMm, setNeutralSizeSqMm] = React.useState<number>(
    () => reducedNeutralFor(defaults.conductorSizeSqMm) ?? defaults.conductorSizeSqMm / 2,
  );
  const [armour, setArmour] = React.useState<ArmourType>(defaults.armour);
  const [insulation, setInsulation] = React.useState<Insulation>(defaults.insulation);
  const [sheath, setSheath] = React.useState<SheathType>(defaults.sheath);
  const [lengthM, setLengthM] = React.useState(1000);
  const [marginPct, setMarginPct] = React.useState(14);
  /** null = let the standard pick the armour size for this diameter. */
  const [armourOverride, setArmourOverride] = React.useState<ArmourDims | null>(null);

  // No re-seeding effect here on purpose. Switching family must reset every field, and
  // the React-idiomatic way to reset all state on a prop change is to remount — the
  // caller passes key={family.id}. Doing it with an effect would setState synchronously
  // in the effect body and cascade renders.

  const coreOptions = isControl(family) ? CONTROL_CORE_CONFIGS : POWER_CORE_CONFIGS;
  const sizeOptions = isControl(family) ? CONTROL_CONDUCTOR_SIZES : POWER_CONDUCTOR_SIZES;

  // Two passes. The armour size the standard picks depends on the diameter under
  // armour, which itself depends on everything below the armour — so build once to
  // learn that diameter, then again with the resolved armour.
  const dimensionResult = React.useMemo(
    () =>
      buildUpDimensions({
        cores,
        conductorSizeSqMm,
        insulation,
        armour,
        armourDimsOverride: armourOverride ?? undefined,
      }),
    [cores, conductorSizeSqMm, insulation, armour, armourOverride],
  );
  const dims = dimensionResult.dimensions;

  const armourCheck = React.useMemo(
    () => checkArmourPermitted(armour, dims?.diaUnderArmourMm ?? 0),
    [armour, dims?.diaUnderArmourMm],
  );

  const identification = React.useMemo(
    () => coreIdentification(cores, defaults.standard),
    [cores, defaults.standard],
  );

  // Resolved per-spec, not once for the page: insulation and armour choice decide which
  // rows of the materials table apply, so XLPE and PVC must not price off the same rate.
  const effectiveRates: MaterialRates | null = React.useMemo(() => {
    if (!materials.length) return null;
    return ratesForSpec({ conductorMaterial, insulation, armour, sheath }, materials);
  }, [materials, conductorMaterial, insulation, armour, sheath]);

  const costing = React.useMemo(() => {
    if (!effectiveRates) return null;
    return computeLine({
      spec: { cores, conductorMaterial, conductorSizeSqMm, neutralSizeSqMm, armour, insulation },
      lengthM,
      marginPct,
      rates: effectiveRates,
      dimensions: dims,
    });
  }, [effectiveRates, cores, conductorMaterial, conductorSizeSqMm, neutralSizeSqMm, armour, insulation, lengthM, marginPct, dims]);

  const isHalfCore = cores === "3.5C";
  const belowGate = marginPct < MARGIN_GATE_PCT;
  const armourDims = dims?.armourDims ?? defaultDimsFor(armour);
  const armourText =
    armour === "Unarmoured"
      ? "unarmoured"
      : `${armour}${armourDims ? ` ${formatArmourDims(armourDims)}` : ""}`;
  const designation = `${cores} × ${conductorSizeSqMm} sq mm ${conductorMaterial}${isHalfCore ? ` + ${neutralSizeSqMm} sq mm N` : ""}, ${insulation}, ${armourText}, ${sheath}`;

  /** Changing the phase size re-derives the standard's reduced neutral for it. */
  const onSizeChange = (v: string) => {
    const size = Number(v);
    setConductorSizeSqMm(size);
    setNeutralSizeSqMm(reducedNeutralFor(size) ?? size / 2);
  };

  const armourSizeOptions: ArmourDims[] = isStripArmour(armour)
    ? [...STRIP_ARMOUR_SIZES]
    : [...WIRE_ARMOUR_SIZES];

  return (
    <div className="space-y-4">
      {/* ── Weight provenance: calculated from the standard, or the old coefficient ── */}
      {costing?.weightBasis === "calculated" ? (
        <div className="rounded-md border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <RulerIcon className="size-4" />
            Dimensions and weight calculated from the standard
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Built layer by layer off IS 7098 (Part 1) Tables 3, 5, 6 and 8, entered with calculated
            diameters per IS 10462 (Part 1). Change the armour and the diameter and weight move with it.
            These are <strong>calculated</strong> figures — still to be checked against the brochure&rsquo;s
            approved weight table before a GTP goes out as final.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangleIcon className="size-4" />
            Costed on estimated weights
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {dimensionResult.unavailableReason ??
              family.blockedOn ??
              "No verified dimension table for this family yet, so weight comes from a generic density coefficient."}
          </p>
        </div>
      )}

      {/* ── Armour not permitted at this diameter (cl. 13.2) ── */}
      {!armourCheck.permitted ? (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertTriangleIcon className="size-4" />
            Armour not permitted at this size
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {armourCheck.reason} <span className="font-mono">{armourCheck.clause}</span>
          </p>
        </div>
      ) : null}

      <Card className="rounded-md p-4">
        <p className="text-xs uppercase text-muted-foreground">Designation (generated)</p>
        <p className="mt-1 font-medium">{designation}</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {family.standards.length ? family.standards.join(" · ") : "Standards not recorded for this family"}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-md p-4 lg:col-span-1">
          <h2 className="font-medium">Construction</h2>
          <div className="mt-4 space-y-3">
            <Select
              id="material"
              label="Conductor material"
              value={conductorMaterial}
              options={["Aluminium", "Copper"]}
              onChange={(v) => setConductorMaterial(v as ConductorMaterial)}
            />
            <Select id="cores" label="Cores" value={cores} options={coreOptions} onChange={(v) => setCores(v as CoreConfig)} />
            <Select
              id="size"
              label="Conductor size (sq mm)"
              value={String(conductorSizeSqMm)}
              options={sizeOptions.map(String)}
              onChange={onSizeChange}
            />
            {isHalfCore ? (
              <Select
                id="neutral"
                label="Reduced neutral (sq mm)"
                value={String(neutralSizeSqMm)}
                options={POWER_CONDUCTOR_SIZES.map(String)}
                onChange={(v) => setNeutralSizeSqMm(Number(v))}
                hint={
                  reducedNeutralFor(conductorSizeSqMm) === neutralSizeSqMm
                    ? "IS 7098 (Part 1) Table 2"
                    : "Differs from IS 7098 (Part 1) Table 2"
                }
              />
            ) : null}
            <Select id="insulation" label="Insulation" value={insulation} options={INSULATIONS} onChange={(v) => setInsulation(v as Insulation)} />
            <Select
              id="armour"
              label="Armour"
              value={armour}
              options={ARMOURS}
              onChange={(v) => {
                setArmour(v as ArmourType);
                setArmourOverride(null); // let the standard re-pick the size
              }}
            />
            {armour !== "Unarmoured" ? (
              <Select
                id="armourSize"
                label="Armour size"
                value={armourOverride ? formatArmourDims(armourOverride) : "Standard selection"}
                options={["Standard selection", ...armourSizeOptions.map(formatArmourDims)]}
                onChange={(v) => {
                  if (v === "Standard selection") return setArmourOverride(null);
                  setArmourOverride(armourSizeOptions.find((d) => formatArmourDims(d) === v) ?? null);
                }}
                hint={
                  armourDims
                    ? `In use: ${formatArmourDims(armourDims)}${
                        armourDims.kind === "strip" &&
                        armourDims.thicknessMm === DEFAULT_STRIP_ARMOUR.thicknessMm
                          ? " — IS 7098 Table 6 method (a)"
                          : " — IS 7098 Table 6"
                      }`
                    : undefined
                }
              />
            ) : null}
            <Select id="sheath" label="Outer sheath" value={sheath} options={SHEATHS} onChange={(v) => setSheath(v as SheathType)} />
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* ── Core identification — a GTP particular the customer checks ── */}
          <Card className="rounded-md p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Core identification</h2>
                <p className="mt-1 text-sm">{identification.printed}</p>
                {identification.note ? (
                  <p className="mt-1 text-xs text-muted-foreground">{identification.note}</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-muted-foreground">
                {identification.method}
              </span>
            </div>
            {identification.phaseColours.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {identification.phaseColours.map((c) => (
                  <ColourChip key={c} colour={c} />
                ))}
                {identification.reducedNeutralColour ? (
                  <ColourChip colour={identification.reducedNeutralColour} label="Reduced neutral" />
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 font-mono text-xs text-muted-foreground">{identification.clause}</p>
          </Card>

          {/* ── Dimensional build-up ── */}
          {dims ? (
            <Card className="rounded-md p-0">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h2 className="font-medium">Dimensions</h2>
                  <p className="text-sm text-muted-foreground">Layer by layer, off the standard&rsquo;s tables.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-muted-foreground">Overall dia</p>
                  <p className="font-mono text-xl font-semibold">{dims.overallDiaMm.toFixed(1)} mm</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <th className="p-3 font-medium">Layer</th>
                      <th className="p-3 text-right font-medium">Wall (mm)</th>
                      <th className="p-3 text-right font-medium">Dia over (mm)</th>
                      <th className="p-3 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dims.layers.map((l) => (
                      <tr key={l.label} className="border-b last:border-0">
                        <td className="p-3">{l.label}</td>
                        <td className="p-3 text-right font-mono">{l.thicknessMm ? l.thicknessMm.toFixed(2) : "—"}</td>
                        <td className="p-3 text-right font-mono">{l.diaOverMm.toFixed(2)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{l.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2 border-t p-3 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  Diameter under armour is <span className="font-mono">{dims.diaUnderArmourMm.toFixed(2)} mm</span>
                  {dims.armour ? (
                    <>
                      {" "}— {dims.armour.count} ×{" "}
                      {dims.armourDims ? formatArmourDims(dims.armourDims) : ""}, steel area{" "}
                      <span className="font-mono">{dims.armour.steelAreaSqMm.toFixed(1)} mm²</span> (
                      <span className="font-mono">{dims.armour.kgPerM.toFixed(3)} kg/m</span>). Excludes helical
                      lay take-up, which is a production parameter we don&rsquo;t hold.
                    </>
                  ) : null}
                </p>
              </div>
            </Card>
          ) : null}

          <Card className="rounded-md p-0">
            <div className="border-b p-4">
              <h2 className="font-medium">Cost breakdown</h2>
              <p className="text-sm text-muted-foreground">Same engine the Quote Builder uses.</p>
            </div>
            <div className="grid gap-3 border-b p-4 sm:grid-cols-2">
              <NumField id="lengthM" label="Length (m)" value={lengthM} step={100} onChange={setLengthM} />
              <NumField
                id="marginPct"
                label="Margin (%)"
                value={marginPct}
                step={0.5}
                onChange={setMarginPct}
                warn={belowGate}
                hint={belowGate ? `Below the ${MARGIN_GATE_PCT}% gate — needs owner approval.` : undefined}
              />
            </div>
            {costing ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                        <th className="p-3 font-medium">Component</th>
                        <th className="p-3 text-right font-medium">kg/m</th>
                        <th className="p-3 text-right font-medium">₹/kg</th>
                        <th className="p-3 text-right font-medium">₹/m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costing.components.map((c) => (
                        <tr key={c.label} className="border-b last:border-0">
                          <td className="p-3">{c.label}</td>
                          <td className="p-3 text-right font-mono">{c.kgPerM ? c.kgPerM.toFixed(4) : "—"}</td>
                          <td className="p-3 text-right font-mono">{c.ratePerKg ? formatINR(c.ratePerKg) : "—"}</td>
                          <td className="p-3 text-right font-mono">{formatINR(c.costPerM)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 border-t p-4 sm:grid-cols-4">
                  <Metric label="Weight / m" value={`${costing.totalWeightKgPerM.toFixed(3)} kg`} />
                  <Metric label="Cost / m" value={formatINR(costing.baseCostPerM)} />
                  <Metric label={`Margin (${marginPct}%)`} value={formatINR(costing.lineMarginInr)} />
                  <Metric label="Line total" value={formatINR(costing.lineTotalInr)} emphasis />
                </div>
              </>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Loading material rates…</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Colour swatch for a core. Tailwind can't build class names at runtime, so map explicitly. */
const COLOUR_SWATCH: Record<string, string> = {
  Red: "bg-red-500",
  Yellow: "bg-yellow-400",
  Blue: "bg-blue-600",
  Black: "bg-black",
  Grey: "bg-gray-400",
  Natural: "bg-neutral-200",
};

function ColourChip({ colour, label }: { colour: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
      <span className={cn("size-3 rounded-full border", COLOUR_SWATCH[colour] ?? "bg-muted")} />
      {colour}
      {label ? <span className="text-muted-foreground">· {label}</span> : null}
    </span>
  );
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs uppercase text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  step = 1,
  hint,
  warn,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs uppercase text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className={cn(
          "mt-1 h-9 w-full rounded-md border bg-background px-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          warn && "border-warning",
        )}
      />
      {hint ? <p className={cn("mt-1 text-xs", warn ? "text-warning" : "text-muted-foreground")}>{hint}</p> : null}
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono", emphasis ? "text-xl font-semibold" : "text-base")}>{value}</p>
    </div>
  );
}

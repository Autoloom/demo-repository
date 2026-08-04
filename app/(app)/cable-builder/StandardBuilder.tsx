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
 * HONEST LIMITATION, SHOWN IN THE UI
 * The brochure publishes dimension tables with approved weights per size. Those are not
 * transcribed yet, so weight here comes from the generic density coefficient — which on
 * the one cable we can check ran ~16% heavy against the approved figure. The banner
 * says so. An estimate labelled as an estimate is useful; one dressed as approved is not.
 */

import { AlertTriangleIcon } from "lucide-react";
import * as React from "react";

import { Card } from "@/components/ui";
import { MARGIN_GATE_PCT, computeLine, ratesForSpec, type MaterialRates } from "@/lib/domain/costing";
import { formatINR } from "@/lib/domain/format";
import type { CableFamilyDef } from "@/lib/domain/families";
import type {
  ArmourType,
  ConductorMaterial,
  CoreConfig,
  Insulation,
  Material,
  SheathType,
} from "@/lib/services/types";
import { cn } from "@/lib/utils";

const CORE_CONFIGS: CoreConfig[] = ["1C", "2C", "3C", "3.5C", "4C", "5C", "7C", "12C", "19C", "27C", "37C"];
const CONDUCTOR_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500];
const ARMOURS: ArmourType[] = ["Unarmoured", "GI round wire (GSW)", "GI strip (GSS)", "Aluminium wire (AWA)", "Aluminium strip"];
const INSULATIONS: Insulation[] = ["XLPE", "PVC (Type A)", "PVC (Type C)", "EPR", "XLPO (solar/UV)"];
const SHEATHS: SheathType[] = ["PVC (ST1)", "PVC (ST2)", "FR PVC", "FRLS PVC", "Zero-halogen (ZHFR/LSZH)", "HDPE"];

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
    };
  }
  // LT XLPE — the flagship line
  return {
    conductorMaterial: "Aluminium" as ConductorMaterial,
    cores: "3.5C" as CoreConfig,
    conductorSizeSqMm: 240,
    armour: "GI strip (GSS)" as ArmourType,
    insulation: "XLPE" as Insulation,
    sheath: "PVC (ST2)" as SheathType,
  };
}

export function StandardBuilder({ family, materials }: { family: CableFamilyDef; materials: Material[] }) {
  const defaults = React.useMemo(() => defaultsForFamily(family), [family]);

  const [conductorMaterial, setConductorMaterial] = React.useState<ConductorMaterial>(defaults.conductorMaterial);
  const [cores, setCores] = React.useState<CoreConfig>(defaults.cores);
  const [conductorSizeSqMm, setConductorSizeSqMm] = React.useState(defaults.conductorSizeSqMm);
  const [neutralSizeSqMm, setNeutralSizeSqMm] = React.useState<number>(defaults.conductorSizeSqMm / 2);
  const [armour, setArmour] = React.useState<ArmourType>(defaults.armour);
  const [insulation, setInsulation] = React.useState<Insulation>(defaults.insulation);
  const [sheath, setSheath] = React.useState<SheathType>(defaults.sheath);
  const [lengthM, setLengthM] = React.useState(1000);
  const [marginPct, setMarginPct] = React.useState(14);

  // No re-seeding effect here on purpose. Switching family must reset every field, and
  // the React-idiomatic way to reset all state on a prop change is to remount — the
  // caller passes key={family.id}. Doing it with an effect would setState synchronously
  // in the effect body and cascade renders.

  // Resolved per-spec, not once for the page: insulation and armour choice decide which
  // rows of the materials table apply, so XLPE and PVC must not price off the same rate.
  const effectiveRates: MaterialRates | null = React.useMemo(() => {
    if (!materials.length) return null;
    return ratesForSpec({ conductorMaterial, insulation, armour, sheath }, materials);
  }, [materials, conductorMaterial, insulation, armour, sheath]);

  const costing = React.useMemo(() => {
    if (!effectiveRates) return null;
    return computeLine({
      spec: { cores, conductorMaterial, conductorSizeSqMm, neutralSizeSqMm, armour },
      lengthM,
      marginPct,
      rates: effectiveRates,
    });
  }, [effectiveRates, cores, conductorMaterial, conductorSizeSqMm, neutralSizeSqMm, armour, lengthM, marginPct]);

  const isHalfCore = cores === "3.5C";
  const belowGate = marginPct < MARGIN_GATE_PCT;
  const designation = `${cores} × ${conductorSizeSqMm} sq mm ${conductorMaterial}${isHalfCore ? ` + ${neutralSizeSqMm} sq mm N` : ""}, ${insulation}, ${armour === "Unarmoured" ? "unarmoured" : armour}, ${sheath}`;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-warning">
          <AlertTriangleIcon className="size-4" />
          Costed on estimated weights
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {family.blockedOn ??
            "No verified dimension table for this family yet, so weight comes from a generic density coefficient."}
        </p>
      </div>

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
            <Select id="cores" label="Cores" value={cores} options={CORE_CONFIGS} onChange={(v) => setCores(v as CoreConfig)} />
            <Select
              id="size"
              label="Conductor size (sq mm)"
              value={String(conductorSizeSqMm)}
              options={CONDUCTOR_SIZES.map(String)}
              onChange={(v) => setConductorSizeSqMm(Number(v))}
            />
            {isHalfCore ? (
              <Select
                id="neutral"
                label="Reduced neutral (sq mm)"
                value={String(neutralSizeSqMm)}
                options={CONDUCTOR_SIZES.map(String)}
                onChange={(v) => setNeutralSizeSqMm(Number(v))}
              />
            ) : null}
            <Select id="insulation" label="Insulation" value={insulation} options={INSULATIONS} onChange={(v) => setInsulation(v as Insulation)} />
            <Select id="armour" label="Armour" value={armour} options={ARMOURS} onChange={(v) => setArmour(v as ArmourType)} />
            <Select id="sheath" label="Outer sheath" value={sheath} options={SHEATHS} onChange={(v) => setSheath(v as SheathType)} />
          </div>
        </Card>

        <Card className="rounded-md p-0 lg:col-span-2">
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
              <div className="grid gap-3 border-t p-4 sm:grid-cols-3">
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
  );
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
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

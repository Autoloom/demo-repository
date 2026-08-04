"use client";

/**
 * Cable Builder — aerial bunched (ABC) family.
 *
 * Deliberately a separate route from /quote. The Quote Builder models the armoured
 * family, where one conductor size applies across N identical cores. An ABC cable is
 * three different cables laid up together, so its form is a per-core table, not a
 * single size field.
 *
 * TWO IDEAS DRIVE THIS SCREEN
 *
 * 1. Deviation from approved. The seeded spec is a GTP that WBSEDCL actually approved.
 *    The moment a value is edited, the cable being costed is no longer the cable that
 *    was approved — which is a compliance problem, not a UI detail. Every changed field
 *    is marked, a banner counts them, and "Reset to approved" is always one click away.
 *
 * 2. Say which number you used. Conductor mass either comes from the GTP's approved
 *    figure or falls back to a generic density coefficient that runs ~16% heavy. Each
 *    core shows which, because a quote built on an estimate should not look identical
 *    to one built on an approved mass.
 *
 * Costing runs through the existing engine (computeAbcLine → same CostingResult shape
 * as computeLine), so the breakdown is arithmetic Sales already trusts.
 */

import {
  AlertTriangleIcon,
  CableIcon,
  FileTextIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button, Card } from "@/components/ui";
import { FamilyNotModelled, FamilyPicker } from "./FamilyPicker";
import { StandardBuilder } from "./StandardBuilder";
import { CABLE_FAMILIES, getFamily, type CableFamilyId } from "@/lib/domain/families";
import type { Material } from "@/lib/services/types";
import {
  abcConductorKgPerM,
  abcConductorLengthM,
  abcTotalConductorKgPerM,
  buildAbcDesignation,
  buildAbcSize,
  computeAbcLine,
  coreTypeLabel,
  type AbcCableSpec,
  type AbcCore,
  type AbcCoreType,
} from "@/lib/domain/abc";
import { MARGIN_GATE_PCT, ratesForSpec, type MaterialRates } from "@/lib/domain/costing";
import { formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import { abcSampleGtp, abcSampleSpec } from "@/lib/seed/abc-gtp-sample";
import { dataService } from "@/lib/services";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

/** ABC has no armour and no overall outer sheath, so those rate lookups resolve to unused rows. */
const RATE_SHIM = {
  conductorMaterial: "Aluminium",
  insulation: "XLPE",
  armour: "Unarmoured",
  sheath: "PVC (ST2)",
} as const;

const CORE_TYPES: AbcCoreType[] = ["POWER", "NEUTRAL_MESSENGER", "STREET_LIGHTING"];

/** A new core starts empty rather than pre-filled — invented numbers are the thing to avoid. */
function blankCore(coreType: AbcCoreType): AbcCore {
  const base = {
    numCores: 1,
    nominalCsaSqMm: 0,
    numStrands: 0,
    strandDiaMm: { value: 0, unit: "mm", qualifier: "Min" as const, note: "before compacting" },
    compactedConductorDiaMm: { value: 0, unit: "mm", tolerancePct: 5 },
    insulationMinThicknessMm: { value: 0, unit: "mm", qualifier: "Min" as const },
    approxDiaOverInsulationMm: { value: 0, unit: "mm" },
    continuousCurrentRatingAmp: { value: 0, unit: "A" },
    currentRatingAmbientTempC: 40,
    maxDcResistanceOhmPerKm: 0,
    approxConductorMassKgPerKm: { value: 0, unit: "Kg/Km", tolerancePct: 3 },
    identification: "",
  };
  if (coreType === "NEUTRAL_MESSENGER") {
    return {
      ...base,
      coreType,
      minBreakingLoadKn: 0,
      modulusOfElasticityKgPerCm2: 0,
      coefficientLinearExpansionPerC: 0,
    };
  }
  return { ...base, coreType } as AbcCore;
}

export default function CableBuilderPage() {
  const role = useSessionStore((state) => state.role);
  const canView = can(role, "view", "quote");
  const canEdit = can(role, "create", "quote");

  const approved = abcSampleSpec;

  const [cores, setCores] = React.useState<AbcCore[]>(() => structuredClone(approved.cores));
  const [completedWeightKgPerKm, setCompletedWeightKgPerKm] = React.useState(
    approved.completedCable.approxWeightKgPerKm.value,
  );
  const [drumLengthM, setDrumLengthM] = React.useState(approved.drum.standardLengthM.value);
  const [drumCount, setDrumCount] = React.useState(1);
  const [marginPct, setMarginPct] = React.useState(14);
  const [wastagePct, setWastagePct] = React.useState(0);
  const [metalRateOverride, setMetalRateOverride] = React.useState<number | null>(null);

  const [rates, setRates] = React.useState<MaterialRates | null>(null);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [familyId, setFamilyId] = React.useState<CableFamilyId>("ABC_AERIAL_BUNCHED");

  const family = getFamily(familyId);
  const isAbc = familyId === "ABC_AERIAL_BUNCHED";

  /** Manual refresh. Called from an event handler, so synchronous setState is fine here. */
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const store = await dataService.read();
      setRates(ratesForSpec(RATE_SHIM, store.materials));
      setMaterials(store.materials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Material rates could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load. Deliberately does NOT call load() — that would setState synchronously
  // inside the effect body and trip react-hooks/set-state-in-effect.
  React.useEffect(() => {
    let active = true;
    dataService
      .read()
      .then((store) => {
        if (!active) return;
        setRates(ratesForSpec(RATE_SHIM, store.materials));
        setMaterials(store.materials);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Material rates could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /** The spec as currently edited. Designation and size regenerate from the cores. */
  const workingSpec: AbcCableSpec = React.useMemo(
    () => ({
      ...approved,
      cores,
      size: buildAbcSize(cores),
      designation: buildAbcDesignation({ cores, serviceVoltageV: approved.serviceVoltageV }),
      completedCable: {
        ...approved.completedCable,
        approxWeightKgPerKm: { ...approved.completedCable.approxWeightKgPerKm, value: completedWeightKgPerKm },
      },
    }),
    [approved, cores, completedWeightKgPerKm],
  );

  const effectiveRates: MaterialRates | null = React.useMemo(() => {
    if (!rates) return null;
    return metalRateOverride !== null ? { ...rates, conductorPerKg: metalRateOverride } : rates;
  }, [rates, metalRateOverride]);

  const costing = React.useMemo(() => {
    if (!effectiveRates) return null;
    return computeAbcLine({ spec: workingSpec, lengthM: drumLengthM, marginPct, rates: effectiveRates, wastagePct });
  }, [effectiveRates, workingSpec, drumLengthM, marginPct, wastagePct]);

  // ── Deviation from the approved GTP ──
  const deviations = React.useMemo(() => {
    const out: string[] = [];
    if (cores.length !== approved.cores.length) out.push("Core count changed");
    cores.forEach((core, i) => {
      const ref = approved.cores[i];
      if (!ref) {
        out.push(`Added ${coreTypeLabel(core.coreType)} core`);
        return;
      }
      const label = coreTypeLabel(core.coreType);
      if (core.numCores !== ref.numCores) out.push(`${label}: no. of cores`);
      if (core.nominalCsaSqMm !== ref.nominalCsaSqMm) out.push(`${label}: cross-section`);
      if (core.numStrands !== ref.numStrands) out.push(`${label}: strand count`);
      if (core.compactedConductorDiaMm.value !== ref.compactedConductorDiaMm.value)
        out.push(`${label}: compacted dia`);
      if (core.insulationMinThicknessMm.value !== ref.insulationMinThicknessMm.value)
        out.push(`${label}: insulation thickness`);
      if (core.approxConductorMassKgPerKm.value !== ref.approxConductorMassKgPerKm.value)
        out.push(`${label}: conductor mass`);
    });
    if (completedWeightKgPerKm !== approved.completedCable.approxWeightKgPerKm.value)
      out.push("Completed cable weight");
    return out;
  }, [cores, approved, completedWeightKgPerKm]);

  function updateCore(index: number, patch: Partial<AbcCore>) {
    setCores((prev) => prev.map((c, i) => (i === index ? ({ ...c, ...patch } as AbcCore) : c)));
  }

  /**
   * Editing conductor GEOMETRY invalidates the approved mass.
   *
   * The GTP's 196 kg/km was approved for a 70 sq mm conductor. Change the cross-section
   * to 95 and that figure is simply wrong — but because costing prefers an approved mass
   * over the density coefficient, it would keep quoting 70 sq mm metal for a 95 sq mm
   * cable and the total wouldn't move at all. So changing size or strand count clears the
   * mass back to 0, which flips the row to "Estimated" and lets the coefficient take over
   * until someone enters a real figure.
   */
  function updateCoreGeometry(index: number, patch: Partial<AbcCore>) {
    setCores((prev) =>
      prev.map((c, i) =>
        i === index
          ? ({
              ...c,
              ...patch,
              approxConductorMassKgPerKm: { ...c.approxConductorMassKgPerKm, value: 0 },
            } as AbcCore)
          : c,
      ),
    );
  }

  function updateCoreValue(index: number, field: keyof AbcCore, value: number) {
    setCores((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const current = c[field] as { value: number };
        return { ...c, [field]: { ...current, value } } as AbcCore;
      }),
    );
  }

  function resetToApproved() {
    setCores(structuredClone(approved.cores));
    setCompletedWeightKgPerKm(approved.completedCable.approxWeightKgPerKm.value);
    setDrumLengthM(approved.drum.standardLengthM.value);
    setMetalRateOverride(null);
    setWastagePct(0);
  }

  const conductorLengthM = abcConductorLengthM(workingSpec, drumLengthM);
  const onDrumKg = abcTotalConductorKgPerM(workingSpec) * drumLengthM;
  const toProcureKg = onDrumKg * (1 + wastagePct / 100) * drumCount;
  const belowGate = marginPct < MARGIN_GATE_PCT;
  const orderTotal = costing ? costing.lineTotalInr * drumCount : 0;

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        You do not have access to the cable builder.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <CableIcon className="size-4" />
            Engineering · {family?.shortLabel ?? "Cable"}
          </div>
          <h1 className="text-2xl font-semibold">Cable Builder</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {isAbc
              ? "Spec an aerial bunched cable core by core and cost it live. Starts from the approved GTP — anything you change is tracked against it."
              : (family?.description ?? "Choose a cable family to begin.")}
          </p>
        </div>
        {isAbc ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={resetToApproved} disabled={deviations.length === 0}>
              <RotateCcwIcon className="mr-2 size-4" />
              Reset to approved
            </Button>
            <Button asChild>
              <Link href="/cable-builder/gtp">
                <FileTextIcon className="mr-2 size-4" />
                View GTP
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      {/* Whole product range, including lines we haven't modelled — a salesperson should
          find their cable and be told what's missing, not conclude the tool can't do it. */}
      <div>
        <p className="mb-2 text-xs uppercase text-muted-foreground">Cable family — {CABLE_FAMILIES.length} product lines</p>
        <FamilyPicker selected={familyId} onSelect={setFamilyId} />
      </div>

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangleIcon className="size-4" />
            {error}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {/* Non-ABC families branch here. Armoured/standard lines reuse the existing
          CableSpec + computeLine; unmodelled lines say what they need. */}
      {!isAbc && family ? (
        family.schema === "armoured" ? (
          <StandardBuilder key={family.id} family={family} materials={materials} />
        ) : (
          <FamilyNotModelled family={family} />
        )
      ) : null}

      {/* ── Deviation banner: the compliance signal ── */}
      {isAbc && deviations.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <TriangleAlertIcon className="size-4" />
            {deviations.length} change{deviations.length === 1 ? "" : "s"} from the approved GTP
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This is no longer the cable WBSEDCL approved. Re-approval is required before manufacturing
            to this spec: {deviations.join(" · ")}
          </p>
        </div>
      ) : isAbc ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          Matches the approved GTP exactly.
        </div>
      ) : null}

      {/* ── ABC-only from here down ── */}
      {isAbc ? (
      <>
      {/* ── Identity, regenerated live ── */}
      <Card className="rounded-md p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted-foreground">Designation (generated)</p>
            <p className="mt-1 font-medium">{workingSpec.designation}</p>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{workingSpec.size}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-muted-foreground">Voltage grade</p>
            <p className="mt-1 font-mono text-sm">
              {workingSpec.serviceVoltageV} V / {workingSpec.neutralToPhaseVoltageV} V
            </p>
          </div>
        </div>
      </Card>

      {/* ── Editable cores ── */}
      <Card className="rounded-md p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-medium">Cores</h2>
            <p className="text-sm text-muted-foreground">
              Each core is its own conductor. Edited values are highlighted against the approved GTP.
            </p>
          </div>
          {canEdit ? (
            <div className="flex gap-2">
              {CORE_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCores((prev) => [...prev, blankCore(t)])}
                >
                  <PlusIcon className="mr-1 size-3" />
                  {coreTypeLabel(t)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-3 font-medium">Core</th>
                <th className="p-3 font-medium">Nos</th>
                <th className="p-3 font-medium">Sq mm</th>
                <th className="p-3 font-medium">Strands</th>
                <th className="p-3 font-medium">Compacted dia</th>
                <th className="p-3 font-medium">Insul. mm</th>
                <th className="p-3 font-medium">Rating A</th>
                <th className="p-3 font-medium">Mass kg/km</th>
                <th className="p-3 font-medium">Source</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {cores.map((core, i) => {
                const ref = approved.cores[i];
                const approvedMass = core.approxConductorMassKgPerKm.value > 0;
                return (
                  <tr key={`${core.coreType}-${i}`} className="border-b last:border-0">
                    <td className="p-3 font-medium">{coreTypeLabel(core.coreType)}</td>
                    <NumCell
                      value={core.numCores}
                      changed={!!ref && core.numCores !== ref.numCores}
                      onChange={(v) => updateCore(i, { numCores: v } as Partial<AbcCore>)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.nominalCsaSqMm}
                      changed={!!ref && core.nominalCsaSqMm !== ref.nominalCsaSqMm}
                      onChange={(v) => updateCoreGeometry(i, { nominalCsaSqMm: v } as Partial<AbcCore>)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.numStrands}
                      changed={!!ref && core.numStrands !== ref.numStrands}
                      onChange={(v) => updateCoreGeometry(i, { numStrands: v } as Partial<AbcCore>)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.compactedConductorDiaMm.value}
                      step={0.01}
                      changed={!!ref && core.compactedConductorDiaMm.value !== ref.compactedConductorDiaMm.value}
                      onChange={(v) => updateCoreValue(i, "compactedConductorDiaMm", v)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.insulationMinThicknessMm.value}
                      step={0.1}
                      changed={!!ref && core.insulationMinThicknessMm.value !== ref.insulationMinThicknessMm.value}
                      onChange={(v) => updateCoreValue(i, "insulationMinThicknessMm", v)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.continuousCurrentRatingAmp.value}
                      changed={!!ref && core.continuousCurrentRatingAmp.value !== ref.continuousCurrentRatingAmp.value}
                      onChange={(v) => updateCoreValue(i, "continuousCurrentRatingAmp", v)}
                      disabled={!canEdit}
                    />
                    <NumCell
                      value={core.approxConductorMassKgPerKm.value}
                      changed={!!ref && core.approxConductorMassKgPerKm.value !== ref.approxConductorMassKgPerKm.value}
                      onChange={(v) => updateCoreValue(i, "approxConductorMassKgPerKm", v)}
                      disabled={!canEdit}
                    />
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
                          approvedMass
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-warning/30 bg-warning/10 text-warning",
                        )}
                        title={
                          approvedMass
                            ? "Costed on the GTP's approved conductor mass."
                            : "No approved mass for this geometry — costed on a generic density coefficient, which runs about 16% heavy. Enter the real mass once known."
                        }
                      >
                        {approvedMass ? "Approved" : "Estimated"}
                      </span>
                    </td>
                    <td className="p-3">
                      {canEdit && cores.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove ${coreTypeLabel(core.coreType)} core`}
                          onClick={() => setCores((prev) => prev.filter((_, idx) => idx !== i))}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t p-3 text-xs text-muted-foreground">
          Per-core weight now:{" "}
          {cores
            .map((c) => `${coreTypeLabel(c.coreType)} ${abcConductorKgPerM(c, workingSpec.conductorMaterial).toFixed(3)} kg/m`)
            .join(" · ")}
        </div>
      </Card>

      {/* ── Order + costing ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-md p-4 lg:col-span-1">
          <h2 className="font-medium">Order</h2>
          <div className="mt-4 space-y-4">
            <Field
              id="drumLengthM"
              label="Drum length (m)"
              value={drumLengthM}
              step={100}
              onChange={setDrumLengthM}
              hint={`Conductor length ${conductorLengthM.toFixed(1)} m — lay-ratio ${workingSpec.layRatioMultiplyingFactor} (GTP item 16).`}
            />
            <Field id="drumCount" label="Number of drums" value={drumCount} step={1} onChange={setDrumCount} />
            <Field
              id="completedWeight"
              label="Completed cable weight (kg/km)"
              value={completedWeightKgPerKm}
              step={1}
              onChange={setCompletedWeightKgPerKm}
              hint="Insulation weight is derived from this minus conductor mass — it is not a guessed coefficient."
            />
            <Field
              id="metalRate"
              label="Metal rate ₹/kg (MCX)"
              value={metalRateOverride ?? rates?.conductorPerKg ?? 0}
              step={1}
              onChange={setMetalRateOverride}
              hint={
                metalRateOverride !== null
                  ? "Manual override — not the live indexed rate."
                  : "From the materials table."
              }
              warn={metalRateOverride !== null}
            />
            <Field
              id="wastagePct"
              label="Scrap / wastage (%)"
              value={wastagePct}
              step={0.5}
              onChange={setWastagePct}
              hint="Applied to material only, never labour. Defaults to 0 — enter the real figure once production confirms it."
            />
            <Field
              id="marginPct"
              label="Margin (%)"
              value={marginPct}
              step={0.5}
              onChange={setMarginPct}
              warn={belowGate}
              hint={belowGate ? `Below the ${MARGIN_GATE_PCT}% gate — needs owner approval.` : undefined}
            />
          </div>
        </Card>

        <Card className="rounded-md p-0 lg:col-span-2">
          <div className="border-b p-4">
            <h2 className="font-medium">Cost breakdown</h2>
            <p className="text-sm text-muted-foreground">Per core, off approved masses where they exist.</p>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading material rates…</div>
          ) : costing ? (
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
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Cost / m" value={formatINR(costing.baseCostPerM)} />
                <Metric label={`Margin (${marginPct}%)`} value={formatINR(costing.lineMarginInr)} />
                <Metric label="Per drum" value={formatINR(costing.lineTotalInr)} />
                <Metric label={`Order total (${drumCount} drum${drumCount === 1 ? "" : "s"})`} value={formatINR(orderTotal)} emphasis />
              </div>
              <div className="grid gap-3 border-t p-4 text-xs sm:grid-cols-2">
                <div>
                  <p className="uppercase text-muted-foreground">Metal on drum</p>
                  <p className="mt-1 font-mono">{onDrumKg.toFixed(1)} kg</p>
                </div>
                <div>
                  <p className="uppercase text-muted-foreground">Metal to procure ({drumCount} drum{drumCount === 1 ? "" : "s"}, incl. {wastagePct}% scrap)</p>
                  <p className="mt-1 font-mono">{toProcureKg.toFixed(1)} kg</p>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Rates unavailable.</div>
          )}
        </Card>
      </div>

      {abcSampleGtp.footnotes?.length ? (
        <Card className="rounded-md border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangleIcon className="size-4" />
            Open items on the approved GTP
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {abcSampleGtp.footnotes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      </>
      ) : null}
    </div>
  );
}

/** Numeric table cell. Highlights when the value differs from the approved GTP. */
function NumCell({
  value,
  onChange,
  changed,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  changed?: boolean;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <td className="p-2">
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className={cn(
          "h-8 w-20 rounded-md border bg-background px-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          changed && "border-warning bg-warning/10",
        )}
      />
    </td>
  );
}

function Field({
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

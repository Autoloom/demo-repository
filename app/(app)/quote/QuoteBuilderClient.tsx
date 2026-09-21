"use client";

/**
 * Quote builder — prices the cable a GTP already derived.
 *
 * Cable OS 3 keeps only the direction BUILD_PLAN_GTP_QUOTE.md settled on: the GTP owns the
 * cable; the quote prices what it derived. There is no blank-slate line editor here — every
 * quote is required to start from `?gtpId=`, seeded from that GTP's stored `CableSpec`
 * (`gtpService.get` -> `specsService.get`). Construction fields (material, insulation, armour,
 * size) are read-only: they are the standard's answer, not a choice to relitigate on the
 * commercial screen. Only length, metal rate, overhead and margin are editable.
 *
 * This does not create Orders/Dispatches/Invoices — Cable OS 3 has no pages for them. A quote
 * saves as Draft or, if the margin is below policy, Review. That is the whole lifecycle here.
 */
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileCheckIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { now } from "@/lib/domain/clock";
import { computeGst, MARGIN_CATEGORIES, MARGIN_GATE_PCT, defaultMarginByCategory, ratesForSpec } from "@/lib/domain/costing";
import type { CostingResult, MarginCategory } from "@/lib/domain/costing";
import { appendAuditEntry } from "@/lib/domain/gtp/audit-log";
import { buildSpecFromFields, targetsFromBuild, type BuildSpec } from "@/lib/domain/gtp/build-spec";
import { costCable, quoteBuild } from "@/lib/domain/gtp/quote-costing";
import { formatINR } from "@/lib/domain/format";
import { downloadPdf } from "@/lib/domain/pdf";
import { quotePdfDocument } from "@/lib/domain/quote-pdf";
import { can, requiresApproval } from "@/lib/rbac";
import {
  dataService,
  materialsService,
  quotesService,
  specsService,
  type CableSpec,
  type Customer,
  type Gtp,
  type GtpDerivedField,
  type Material,
  type Quote,
  type QuoteLine,
  type QuoteStatus,
  type Role,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const toneClass: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};
function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium", toneClass[tone])}>
      {children}
    </span>
  );
}
function MoneyCell({ amount }: { amount: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amount)}</span>;
}

/** Commercial terms only — construction comes from the GTP-derived spec and is not editable here. */
interface Commercial {
  lengthM: number;
  metalRatePerKg: number;
  overheadPerM: number;
  /** Margin %, independent per material — conductor, insulation, armour and sheath move with
   *  different markets, and a buyer's leverage often differs by material. */
  marginPctByCategory: Record<MarginCategory, number>;
  buildSpec?: BuildSpec;
}

function validUntilIso(): string {
  const date = now();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function nextQuoteId(): string {
  const stamp = now().toISOString();
  return `Q-${stamp.slice(2, 4)}${stamp.slice(5, 7)}-${Math.floor(100 + Math.random() * 900)}`;
}

function lineFromCommercial(spec: CableSpec, commercial: Commercial, materials: Material[], lineId: string): { line: QuoteLine; costing: CostingResult } {
  const costing = costCable(spec, commercial, materials, commercial.buildSpec);
  const buildSpec = spec.gtpSource ? quoteBuild(spec, commercial.buildSpec).build : undefined;
  const line: QuoteLine = {
    id: lineId,
    specId: spec.id,
    buildSpec,
    specSnapshot: spec,
    lengthM: commercial.lengthM,
    metalRatePerKg: commercial.metalRatePerKg,
    overheadPerM: commercial.overheadPerM,
    marginPctByCategory: commercial.marginPctByCategory,
    marginPct: costing.blendedMarginPct,
    metalCostPerM: costing.conductorCostPerM,
    baseCostPerM: costing.baseCostPerM,
    lineSubtotalInr: costing.lineSubtotalInr,
    lineMarginInr: costing.lineMarginInr,
    lineTotalInr: costing.lineTotalInr,
    hsnCode: "8544",
    gstRatePct: 18,
  };
  return { line, costing };
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="h-72 animate-pulse rounded-md border bg-muted lg:col-span-2" />
      <div className="h-72 animate-pulse rounded-md border bg-muted" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangleIcon className="size-4" />
        {message}
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      ) : (
        <Link href="/quote" className="mt-3 inline-flex text-xs underline underline-offset-4">
          Back to Quotation
        </Link>
      )}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  step,
  suffix,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={min}
          step={step ?? 1}
          value={value}
          disabled={disabled}
          className="font-mono"
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The GTP's own carried parameters — read-only, for provenance. Collapsed by default: it's the
 *  standard's working, not something a commercial screen needs open to be usable. */
function GtpParametersPanel({ gtpId, fields }: { gtpId: string; fields: GtpDerivedField[] }) {
  const printed = fields.filter((field) => !field.gap);
  return (
    <AccordionItem value="gtp-parameters" className="rounded-md border bg-card px-4">
      <AccordionTrigger className="text-sm font-medium hover:no-underline">
        <span className="flex items-center gap-2">
          Parameters from {gtpId}
          <span className="font-normal text-muted-foreground">({printed.length})</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Parameter</th>
                <th scope="col" className="px-3 py-2 font-medium">Value</th>
                <th scope="col" className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {printed.map((field) => (
                <tr key={field.key} className="border-t border-border align-top">
                  <td className="px-3 py-2">{field.label}</td>
                  <td className="px-3 py-2 font-mono">{String(field.value)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{field.trace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function CostingRow({ label, detail, amount, emphasis }: { label: string; detail?: string; amount: number; emphasis?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", emphasis && "font-semibold")}>
      <span className={cn(emphasis ? "text-foreground" : "text-muted-foreground")}>
        {label}
        {detail ? <span className="ml-1.5 font-mono text-xs text-muted-foreground/80">{detail}</span> : null}
      </span>
      <MoneyCell amount={amount} />
    </div>
  );
}

function CostingBreakdown({ costing, line, gstSplit }: { costing: CostingResult; line: QuoteLine; gstSplit: ReturnType<typeof computeGst> }) {
  return (
    <section className="space-y-4 rounded-md border bg-card p-4 text-sm">
      <div>
        <h3 className="font-medium">Price</h3>
        <p className="text-xs text-muted-foreground">Each material carries its own margin, scaled to {line.lengthM} m.</p>
      </div>

      <div className="space-y-1.5">
        {costing.components.map((component) => (
          <CostingRow
            key={component.label}
            label={component.label}
            detail={`${component.kgPerM > 0 ? `${component.kgPerM.toFixed(3)} kg × ${formatINR(component.ratePerKg)} · ` : ""}+${component.marginPct}% margin`}
            amount={Math.round(component.totalInr)}
          />
        ))}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <CostingRow label="Cost (before margin)" amount={Math.round(costing.lineSubtotalInr)} />
        <CostingRow label={`Margin (blended ${costing.blendedMarginPct.toFixed(1)}%)`} amount={Math.round(costing.lineMarginInr)} />
        <div className="border-t border-border pt-1.5">
          <CostingRow label="Line total" amount={line.lineTotalInr} emphasis />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <CostingRow label="Subtotal" amount={line.lineTotalInr} />
        {gstSplit.interstate ? (
          <CostingRow label="IGST 18%" amount={gstSplit.gstInr} />
        ) : (
          <>
            <CostingRow label="CGST 9%" amount={gstSplit.cgstInr ?? 0} />
            <CostingRow label="SGST 9%" amount={gstSplit.sgstInr ?? 0} />
          </>
        )}
        <div className="border-t border-border pt-1.5">
          <CostingRow label="Grand total" amount={line.lineTotalInr + gstSplit.gstInr} emphasis />
        </div>
      </div>
    </section>
  );
}

/**
 * Internal manufacturing build target — the works may build toward the tolerance floor to save
 * metal. Never printed: BUILD_PLAN_GTP_QUOTE.md §6/§8 (build-plan-v2 D10) require the declared
 * value on both the GTP and this quote's PDF, never what the works actually builds to.
 */
function BuildTargetPanel({
  spec,
  commercial,
  readOnly,
  onChange,
}: {
  spec: CableSpec;
  commercial: Commercial;
  readOnly: boolean;
  onChange: (commercial: Commercial) => void;
}) {
  const user = useSessionStore((state) => state.user);
  const [pending, setPending] = React.useState<Record<string, string>>({});
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!spec.gtpSource) return null;
  let resolved: ReturnType<typeof quoteBuild>;
  try {
    resolved = quoteBuild(spec, commercial.buildSpec);
  } catch {
    return null;
  }
  const { source, build } = resolved;
  const savingKgPerKm = build.massAtDeclaredKgPerKm - build.massAtBuiltKgPerKm;
  const hasBelowFloorPending = build.layers.some((layer) => {
    if (layer.floorMm === null) return false;
    const typed = pending[layer.layer];
    if (typed === undefined) return false;
    const typedMm = Number(typed);
    return Number.isFinite(typedMm) && typedMm < layer.floorMm;
  });

  function apply() {
    try {
      if (!reason.trim()) throw new Error("Record why this build target was chosen.");
      const targets = { ...targetsFromBuild(build) };
      for (const [key, value] of Object.entries(pending)) {
        if (!value.trim()) throw new Error("Enter a build thickness in mm.");
        targets[key] = Number(value);
      }
      const next = buildSpecFromFields(build.specId, source, targets);
      for (const layer of next.layers) {
        const previous = build.layers.find((entry) => entry.layer === layer.layer);
        if (!previous || previous.builtMm === layer.builtMm) continue;
        appendAuditEntry({
          gtpId: build.specId,
          fieldKey: `build.${layer.layer}`,
          fieldLabel: `Build target: ${layer.layer}`,
          action: "override",
          previousValue: String(previous.builtMm),
          newValue: String(layer.builtMm),
          reason: reason.trim(),
          actor: user.name,
          context: { designation: spec.designation },
        });
      }
      onChange({ ...commercial, buildSpec: next });
      setPending({});
      setReason("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <AccordionItem value="build-target" className="rounded-md border bg-card px-4" aria-label="Internal build target">
      <AccordionTrigger className="text-sm font-medium hover:no-underline">
        <span className="flex items-center gap-2">
          Internal build target
          <Badge tone="neutral">Never printed</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The GTP declares nominal dimensions. A build target below nominal but within the
          standard&apos;s floor saves metal — this stays off both PDFs, in the audit log only.
        </p>
        <div className="divide-y divide-border rounded-md border">
          {build.layers.map((layer) => {
            const label = source.fields.find((field) => field.key === layer.layer)?.label ?? layer.layer;
            const typed = pending[layer.layer];
            const typedMm = typed !== undefined ? Number(typed) : null;
            // Live, before Apply: is what's typed actually buildable against the IS floor?
            const belowFloor =
              layer.floorMm !== null && typedMm !== null && Number.isFinite(typedMm) && typedMm < layer.floorMm;
            return (
              <div key={layer.layer} className="grid gap-3 p-3 sm:grid-cols-[1fr_9rem] sm:items-start">
                <div className="space-y-0.5">
                  <Label htmlFor={`build-${layer.layer}`}>{label}</Label>
                  <p className="text-xs text-muted-foreground">
                    Declared {layer.declaredMm.toFixed(2)} mm ·{" "}
                    {layer.floorMm === null ? "no published headroom" : `floor ${layer.floorMm.toFixed(2)} mm`}
                  </p>
                  <p className="text-xs text-muted-foreground">{layer.clause}</p>
                </div>
                {layer.floorMm !== null ? (
                  <div className="space-y-1">
                    <Input
                      id={`build-${layer.layer}`}
                      type="number"
                      step="0.01"
                      disabled={readOnly}
                      value={typed ?? String(layer.builtMm)}
                      aria-invalid={belowFloor}
                      className={cn(belowFloor && "border-danger focus-visible:ring-danger")}
                      onChange={(event) => setPending({ ...pending, [layer.layer]: event.target.value })}
                    />
                    {belowFloor ? (
                      <p className="flex items-center gap-1 text-xs text-danger">
                        <AlertTriangleIcon className="size-3 shrink-0" />
                        Below the {layer.floorMm.toFixed(2)} mm IS floor — not buildable
                      </p>
                    ) : typedMm !== null && Number.isFinite(typedMm) ? (
                      <p className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2Icon className="size-3 shrink-0" />
                        Within the {layer.floorMm.toFixed(2)} mm IS floor
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="font-mono text-sm">{layer.builtMm.toFixed(2)} mm</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <span>Declared <span className="font-mono">{build.massAtDeclaredKgPerKm.toFixed(2)} kg/km</span></span>
          <span>Built <span className="font-mono">{build.massAtBuiltKgPerKm.toFixed(2)} kg/km</span></span>
          <span>Saving <span className="font-mono">{savingKgPerKm.toFixed(2)} kg/km</span></span>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="build-reason">Reason for build change</Label>
          <Input
            id="build-reason"
            value={reason}
            disabled={readOnly}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Record the manufacturing decision"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">{error}</p>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={readOnly || Object.keys(pending).length === 0 || hasBelowFloorPending} onClick={apply}>
          Apply build target
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

export function QuoteBuilderClient({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useSessionStore((state) => state.role) as Role;
  const actor = actorFromSession();
  const gtpIdParam = searchParams.get("gtpId");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [materials, setMaterials] = React.useState<Material[]>([]);
  const [customer, setCustomer] = React.useState<Customer | undefined>(undefined);
  const [gtp, setGtp] = React.useState<Gtp | null>(null);
  const [spec, setSpec] = React.useState<CableSpec | null>(null);
  const [commercial, setCommercial] = React.useState<Commercial>({ lengthM: 1000, metalRatePerKg: 0, overheadPerM: 18, marginPctByCategory: defaultMarginByCategory() });
  const [status, setStatus] = React.useState<QuoteStatus>("Draft");
  const [existingQuoteId, setExistingQuoteId] = React.useState<string | undefined>(quoteId);
  const [feedback, setFeedback] = React.useState<{ tone: Tone; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [refreshingRate, setRefreshingRate] = React.useState(false);
  const [gtpChangedSinceQuote, setGtpChangedSinceQuote] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [store, loadedMaterials] = await Promise.all([dataService.read(), materialsService.list()]);
      setMaterials(loadedMaterials);

      if (quoteId) {
        const existing = store.quotes.find((entry) => entry.id === quoteId);
        if (!existing) throw new Error(`Quote ${quoteId} was not found.`);
        const existingSpec = existing.lines[0]?.specSnapshot ?? store.specs.find((entry) => entry.id === existing.lines[0]?.specId);
        if (!existingSpec) throw new Error("This quote's cable could not be found.");
        const linkedGtp = existing.gtpId ? (store.gtps.find((entry) => entry.id === existing.gtpId) ?? null) : null;
        setGtp(linkedGtp);
        setGtpChangedSinceQuote(
          Boolean(linkedGtp && existing.gtpVersionAtQuote !== undefined && linkedGtp.version !== existing.gtpVersionAtQuote),
        );
        setSpec(existingSpec);
        setCustomer(store.customers.find((entry) => entry.id === existing.customerId));
        const line = existing.lines[0];
        setCommercial({ lengthM: line.lengthM, metalRatePerKg: line.metalRatePerKg, overheadPerM: line.overheadPerM, marginPctByCategory: line.marginPctByCategory ?? defaultMarginByCategory(line.marginPct), buildSpec: line.buildSpec });
        setStatus(existing.status);
        setExistingQuoteId(existing.id);
        return;
      }

      if (!gtpIdParam) throw new Error("A quote must start from a GTP. Open one from Quotation.");
      const foundGtp = store.gtps.find((entry) => entry.id === gtpIdParam);
      if (!foundGtp) throw new Error(`GTP ${gtpIdParam} was not found.`);
      // Sign-off gates production, not pricing — a quote may start from a Draft or Submitted
      // GTP as readily as an Approved one; only an unresolved parameter blocks quoting (below).
      if (foundGtp.isTemplate) throw new Error(`${foundGtp.id} is a reusable format template, not an order's GTP — it cannot be priced.`);
      const foundSpec = store.specs.find((entry) => entry.id === foundGtp.specId);
      if (!foundSpec) throw new Error(`GTP ${foundGtp.id} has no linked cable to price.`);
      if (foundSpec.gtpSource?.fields.some((field) => field.gap)) throw new Error(`${foundGtp.id} has an unresolved parameter — resolve it on the GTP before quoting.`);
      const alreadyQuoted = store.quotes.find((entry) => entry.gtpId === foundGtp.id);
      if (alreadyQuoted) {
        router.replace(`/quote/${alreadyQuoted.id}`);
        return;
      }
      setGtp(foundGtp);
      setGtpChangedSinceQuote(false);
      setSpec(foundSpec);
      setCustomer(foundGtp.customerId ? store.customers.find((entry) => entry.id === foundGtp.customerId) : undefined);
      const rates = ratesForSpec(foundSpec, loadedMaterials);
      const totalLengthM = foundGtp.orderQuantities?.totalLengthM;
      setCommercial((current) => ({ ...current, metalRatePerKg: rates.conductorPerKg || current.metalRatePerKg, lengthM: totalLengthM ?? current.lengthM }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the quote.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, gtpIdParam]);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  React.useEffect(() => {
    if (!feedback) return;
    const handle = window.setTimeout(() => setFeedback(null), 6000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  const readOnly = !can(role, "edit", "quote");
  const canCreate = can(role, "create", "quote");

  const priced = React.useMemo(() => {
    if (!spec) return null;
    try {
      return lineFromCommercial(spec, commercial, materials, existingQuoteId ? `${existingQuoteId}-L1` : "QL-DRAFT-1");
    } catch (err) {
      return { error: err instanceof Error ? err.message : "This cable could not be priced." };
    }
  }, [spec, commercial, materials, existingQuoteId]);

  const gstSplit = React.useMemo(() => computeGst(priced && "line" in priced ? priced.line.lineTotalInr : 0, customer?.stateCode), [priced, customer]);
  const blendedMarginPct = priced && "costing" in priced ? priced.costing.blendedMarginPct : 0;
  const marginGate = blendedMarginPct < MARGIN_GATE_PCT;
  const permissionCtx = { record: { marginReviewRequired: marginGate } };
  const needsApproval = requiresApproval(role, "transition", "quote", permissionCtx);

  async function refreshMarketRate() {
    if (!spec) return;
    setRefreshingRate(true);
    try {
      const updated = await materialsService.refreshMcx(actor);
      setMaterials(updated);
      const rates = ratesForSpec(spec, updated);
      if (rates.conductorPerKg) setCommercial((current) => ({ ...current, metalRatePerKg: rates.conductorPerKg }));
      setFeedback({ tone: "info", message: "Market metal rate refreshed from MCX." });
    } catch {
      setFeedback({ tone: "danger", message: "Could not refresh the market rate." });
    } finally {
      setRefreshingRate(false);
    }
  }

  async function save(nextStatus: QuoteStatus) {
    if (!spec || !priced || "error" in priced) return;
    if (!canCreate && !existingQuoteId) return;
    setSaving(true);
    try {
      await specsService.upsert(spec);
      const quoteRecord: Quote = {
        id: existingQuoteId ?? nextQuoteId(),
        gtpId: gtp?.id,
        gtpVersionAtQuote: gtp?.version,
        customerId: customer?.id ?? "CUS-PENDING",
        lines: [priced.line],
        subtotalInr: priced.line.lineTotalInr,
        gstInr: gstSplit.gstInr,
        totalInr: priced.line.lineTotalInr + gstSplit.gstInr,
        status: nextStatus,
        validUntil: validUntilIso(),
        marginReviewRequired: marginGate,
        createdAt: now().toISOString(),
      };
      const saved = await quotesService.saveDraft(quoteRecord, actor);
      setExistingQuoteId(saved.id);
      setStatus(saved.status);
      setFeedback({
        tone: "success",
        message: nextStatus === "Review" ? `${saved.id} saved and sent for owner review.` : `${saved.id} saved as a draft.`,
      });
      if (!quoteId) router.replace(`/quote/${saved.id}`);
    } catch {
      setFeedback({ tone: "danger", message: "Could not save the quote." });
    } finally {
      setSaving(false);
    }
  }

  function downloadQuotePdf() {
    if (!spec || !priced || "error" in priced) return;
    downloadPdf(
      `${existingQuoteId ?? "quote-draft"}.pdf`,
      quotePdfDocument({
        quoteId: existingQuoteId,
        customerName: customer?.name ?? "Customer pending",
        selectedCustomer: customer,
        lines: [{ line: priced.line, spec, costing: priced.costing }],
        subtotalInr: priced.line.lineTotalInr,
        gstSplit,
        totalInr: priced.line.lineTotalInr + gstSplit.gstInr,
        validUntil: validUntilIso(),
      }),
    );
  }

  if (loading) return <main className="min-h-screen bg-background p-6"><LoadingState /></main>;
  if (error) return <main className="min-h-screen bg-background p-6"><ErrorState message={error} onRetry={quoteId ? () => void load() : undefined} /></main>;
  if (!spec) return <main className="min-h-screen bg-background p-6"><ErrorState message="No cable to quote." /></main>;

  const gapFields = spec.gtpSource?.fields ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link href="/quote" className="flex w-fit items-center gap-1 text-xs font-medium uppercase text-muted-foreground underline-offset-4 hover:underline">
            <ArrowLeftIcon className="size-3.5" />
            Quotation
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{existingQuoteId ?? "New quote"}</h1>
            <p className="text-sm text-muted-foreground">{spec.designation}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "Approved" ? "success" : status === "Review" ? "warning" : "neutral"}>{status}</Badge>
            {gtp ? (
              <Badge tone={gtp.status === "Approved" ? "info" : "warning"}>
                <FileCheckIcon className="size-3" />
                {gtp.id} · {gtp.status === "Approved" ? "Stamped" : gtp.status}
              </Badge>
            ) : (
              <Badge tone="neutral">No linked GTP</Badge>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={downloadQuotePdf} disabled={!priced || "error" in priced}>
          <DownloadIcon className="mr-2 size-4" />
          Download quote PDF
        </Button>
      </header>

      {feedback || gtpChangedSinceQuote ? (
        <div className="space-y-3">
          {feedback ? (
            <div
              role="status"
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                feedback.tone === "success"
                  ? "border-success/30 bg-success/10 text-success"
                  : feedback.tone === "danger"
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : "border-info/30 bg-info/10 text-info",
              )}
            >
              {feedback.tone === "success" ? <CheckCircle2Icon className="size-4" /> : <AlertTriangleIcon className="size-4" />}
              {feedback.message}
            </div>
          ) : null}
          {gtpChangedSinceQuote && gtp ? (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              <ShieldAlertIcon className="size-4 shrink-0" />
              {gtp.id} has changed since this quote was priced — the cable below may no longer match what the GTP now declares. Reopen it from Quotation to reprice against the current values.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-4 rounded-md border bg-card p-4">
            <h3 className="font-medium">Cable</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Standard</dt><dd className="font-mono">{spec.standard}</dd></div>
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Cores</dt><dd className="font-mono">{spec.cores}</dd></div>
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Conductor</dt><dd className="font-mono">{spec.conductorSizeSqMm} sq mm {spec.conductorMaterial}</dd></div>
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Insulation</dt><dd className="font-mono">{spec.insulation}</dd></div>
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Armour</dt><dd className="font-mono">{spec.armour}</dd></div>
              <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">Sheath</dt><dd className="font-mono">{spec.sheath}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Construction is fixed by the GTP — to change the cable, resolve it on the GTP and quote again.
            </p>
          </section>

          <section className="space-y-4 rounded-md border bg-card p-4">
            <div>
              <h3 className="font-medium">Commercial terms</h3>
              <p className="text-xs text-muted-foreground">
                Length is yours to set. Metal rate seeds from the materials table and moves with the market.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="lengthM"
                label="Length"
                suffix="m"
                min={1}
                value={commercial.lengthM}
                disabled={readOnly}
                onChange={(value) => setCommercial((current) => ({ ...current, lengthM: value }))}
              />
              <div className="space-y-1.5">
                <Label htmlFor="metalRatePerKg">{spec.conductorMaterial} rate</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="metalRatePerKg"
                      type="number"
                      min={0}
                      className="font-mono"
                      value={commercial.metalRatePerKg}
                      disabled={readOnly}
                      onChange={(event) => setCommercial((current) => ({ ...current, metalRatePerKg: Number(event.target.value) }))}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">₹/kg</span>
                  </div>
                  <Button type="button" variant="outline" size="icon" disabled={readOnly || refreshingRate} onClick={() => void refreshMarketRate()} title={`Refresh ${spec.conductorMaterial} market rate`}>
                    <RefreshCwIcon className={cn("size-4", refreshingRate && "animate-spin")} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This cable&apos;s conductor is {spec.conductorMaterial.toLowerCase()} — the price per kg for that metal, seeded from the Materials table.
                </p>
              </div>
              <NumberField
                id="overheadPerM"
                label="Overhead"
                suffix="₹/m"
                min={0}
                value={commercial.overheadPerM}
                disabled={readOnly}
                onChange={(value) => setCommercial((current) => ({ ...current, overheadPerM: value }))}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-md border bg-card p-4">
            <div>
              <h3 className="font-medium">Margin</h3>
              <p className="text-xs text-muted-foreground">
                Set independently per material — prices move differently, and so does your leverage on each.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {MARGIN_CATEGORIES.map((category) => (
                <NumberField
                  key={category}
                  id={`margin-${category}`}
                  label={category === "Labour" ? "Labour & overhead" : category}
                  suffix="%"
                  min={0}
                  step={0.5}
                  value={commercial.marginPctByCategory[category]}
                  disabled={readOnly}
                  onChange={(value) =>
                    setCommercial((current) => ({ ...current, marginPctByCategory: { ...current.marginPctByCategory, [category]: value } }))
                  }
                />
              ))}
            </div>
            {marginGate ? (
              <p className="flex items-center gap-2 text-xs text-warning">
                <ShieldAlertIcon className="size-3.5 shrink-0" />
                Blended margin is below the company minimum ({MARGIN_GATE_PCT}%) — saving this will need owner review.
              </p>
            ) : null}
          </section>

          <Accordion type="multiple" className="space-y-4">
            {gapFields.length > 0 && gtp ? <GtpParametersPanel gtpId={gtp.id} fields={gapFields} /> : null}
            <BuildTargetPanel spec={spec} commercial={commercial} readOnly={readOnly} onChange={setCommercial} />
          </Accordion>
        </div>

        <div className="space-y-6">
          {priced && "error" in priced ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangleIcon className="size-4" />
                Cannot price this cable
              </div>
              <p className="mt-2">{priced.error}</p>
            </div>
          ) : priced ? (
            <CostingBreakdown costing={priced.costing} line={priced.line} gstSplit={gstSplit} />
          ) : null}

          <section className="space-y-3 rounded-md border bg-card p-4">
            <div>
              <h3 className="font-medium">Save</h3>
              <p className="text-xs text-muted-foreground">
                {needsApproval
                  ? `Below ${MARGIN_GATE_PCT}% margin — saves for owner review, not sent anywhere automatically.`
                  : "Saves as a draft. No order is created — Cable OS 3 stops at the priced quote."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                disabled={readOnly || saving || !priced || "error" in priced}
                onClick={() => void save(needsApproval ? "Review" : "Draft")}
              >
                <SaveIcon className="mr-2 size-4" />
                {needsApproval ? "Save for owner review" : "Save draft"}
              </Button>
              {status !== "Approved" && !needsApproval && role === "Owner" && existingQuoteId ? (
                <Button type="button" variant="outline" disabled={saving || !priced || "error" in priced} onClick={() => void save("Approved")}>
                  Mark approved
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

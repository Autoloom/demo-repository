"use client";

import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon, FileDownIcon, PhoneCallIcon, SaveIcon, XCircleIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defaultPromisedDate, orderGtp, type BoardCard } from "@/lib/domain/board";
import { now } from "@/lib/domain/clock";
import { formatDate } from "@/lib/domain/format";
import { inspectionCallBlockers } from "@/lib/domain/inspection";
import {
  blankRows,
  buildInspectionReport,
  checklistFromGtp,
  evaluateChecklist,
  inspectionBlockers,
  type ChecklistDraftRow,
  type ChecklistResult,
} from "@/lib/domain/inspection-checklist";
import { inspectionChecklistDocument } from "@/lib/domain/inspection-pdf";
import { downloadOnLetterhead, loadLetterhead } from "@/lib/domain/offer/letterhead";
import { inspectionService, type CableStore } from "@/lib/services";
import { actorFromSession } from "@/lib/store/session";
import { cn } from "@/lib/utils";

const RESULTS: ChecklistResult[] = ["Pending", "Pass", "Fail", "N/A"];

/**
 * Inspection, where the order is: the call, the document the inspector carries, and the result.
 *
 * ── Why it lives on the order panel ────────────────────────────────────────────
 * Moving past production is gated on a passed inspection with dispatch clearance, and in this build
 * nothing could record one — so a card reached "In production" and stopped, with the gate telling
 * it what it needed and no way to supply it. This is that way.
 *
 * The checklist is the stamped GTP read back (see lib/domain/inspection-checklist.ts): the
 * inspector tests against the GTP the customer approved and nothing else.
 */
export function InspectionSection({
  store,
  card,
  canEdit,
  onChanged,
  onError,
}: {
  store: CableStore;
  card: BoardCard;
  canEdit: boolean;
  onChanged: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const order = store.orders.find((entry) => entry.id === card.orderId)!;
  const gtp = orderGtp(store, order);
  const reports = store.inspectionReports
    .filter((entry) => entry.orderId === order.id)
    .sort((a, b) => Date.parse(b.inspectedAt) - Date.parse(a.inspectedAt));
  const active = card.stage === "In Production" || card.stage === "Ready for Dispatch";
  const gtpBlockers = inspectionBlockers(gtp);
  // Not memoised: `gtp` belongs to the store and is replaced on every load, and this is a filter
  // over thirty rows.
  const items = gtp ? checklistFromGtp(gtp) : [];
  const callBlockers = inspectionCallBlockers(store.finishedCableQc, order.id);
  const latest = reports[0];

  function downloadChecklist() {
    if (!gtp) return;
    downloadOnLetterhead(
      `${order.id}-inspection-checklist.pdf`,
      inspectionChecklistDocument({
        gtp,
        orderId: order.id,
        customerName: card.customerName,
        cables: card.cables.map((cable) => cable.label),
        items,
        companyName: loadLetterhead().companyName,
      }),
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="inspection-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="inspection-heading" className="text-sm font-medium">
          Inspection
        </h3>
        <StatusPill latest={latest} called={order.inspectionStatus === "Called"} />
      </div>

      {gtpBlockers.length > 0 && active ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {gtpBlockers[0]}
        </p>
      ) : null}

      {active ? (
        <>
          <CallStep
            store={store}
            card={card}
            canEdit={canEdit}
            callBlockers={callBlockers}
            onChanged={onChanged}
            onError={onError}
          />

          <div className="space-y-1.5">
            <Button type="button" variant="outline" size="sm" disabled={!gtp || gtpBlockers.length > 0} onClick={downloadChecklist}>
              <FileDownIcon className="mr-2 size-4" />
              Download inspection checklist (PDF)
            </Button>
            <p className="text-xs text-muted-foreground">
              The stamped GTP as a form for the inspector to carry and sign — {items.length} parameters, with the value and tolerance
              the customer approved. He tests against this, not against the IS value where the two differ.
            </p>
          </div>

          {canEdit && gtp && gtpBlockers.length === 0 ? (
            <RecordResult
              key={`${order.id}-${reports.length}`}
              orderId={order.id}
              items={items}
              gtp={gtp}
              drumHint={store.jobCards.find((entry) => entry.orderId === order.id)?.drumPlan.map((drum) => drum.drumNo).join(", ") ?? ""}
              onChanged={onChanged}
              onError={onError}
            />
          ) : !canEdit ? (
            <p className="text-xs text-muted-foreground">Recording an inspection is for Operations.</p>
          ) : null}
        </>
      ) : null}

      {reports.length > 0 ? <History reports={reports} /> : null}
      {!active && reports.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inspection starts once the order is in production.</p>
      ) : null}
    </section>
  );
}

function StatusPill({ latest, called }: { latest?: CableStore["inspectionReports"][number]; called: boolean }) {
  if (latest) {
    const ok = latest.result === "Passed" && latest.clearanceIssued;
    const tone = latest.result === "Failed" ? "border-danger/30 bg-danger/10 text-danger" : ok ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning";
    const Icon = latest.result === "Failed" ? XCircleIcon : ok ? CheckCircle2Icon : ClockIcon;
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium", tone)}>
        <Icon className="size-3" aria-hidden="true" />
        {latest.result === "Failed" ? "Failed" : ok ? "Passed · cleared for dispatch" : "Passed · no clearance yet"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
      {called ? "Inspector called" : "Not inspected"}
    </span>
  );
}

// ── The call ──────────────────────────────────────────────────────────────────

function CallStep({
  store,
  card,
  canEdit,
  callBlockers,
  onChanged,
  onError,
}: {
  store: CableStore;
  card: BoardCard;
  canEdit: boolean;
  callBlockers: string[];
  onChanged: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const order = store.orders.find((entry) => entry.id === card.orderId)!;
  const [ready, setReady] = React.useState(order.estimatedCompletionDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = React.useState(false);
  const call = card.inspectionCall;
  const called = order.inspectionStatus === "Called";
  const readyChanged = ready !== (order.estimatedCompletionDate?.slice(0, 10) ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(ready);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await action();
      await onChanged(done);
    } catch (err) {
      onError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <p className="text-sm font-medium">Call the inspector</p>
      <p className="text-xs text-muted-foreground">
        The call goes in about ten days before the cable is ready, and the inspector takes around eleven days to arrive. A late call leaves
        finished cable waiting on the floor.
      </p>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ready-date" className="text-xs">
              Cable will be ready on
            </Label>
            <Input id="ready-date" type="date" value={ready} onChange={(event) => setReady(event.target.value)} className="w-44" />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!readyChanged || busy}
            onClick={() =>
              void run(
                () => inspectionService.setEstimatedCompletion(order.id, ready, actorFromSession()),
                `${order.id} ready date set to ${formatDate(ready)}.`,
              )
            }
          >
            <SaveIcon className="mr-2 size-4" />
            Save date
          </Button>
        </div>
      ) : order.estimatedCompletionDate ? (
        <p className="text-xs text-muted-foreground">Ready on {formatDate(order.estimatedCompletionDate)}.</p>
      ) : null}

      {called ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2Icon className="size-4" aria-hidden="true" />
          Called{order.inspectionCallDate ? ` on ${formatDate(order.inspectionCallDate)}` : ""} — inspector expected by{" "}
          {order.inspectorEtaDate ? formatDate(order.inspectorEtaDate) : "—"}.
        </p>
      ) : (
        <>
          {call.state === "overdue" ? (
            <p className="text-sm font-medium text-danger">
              Call was due {formatDate(call.callBy!)} — {-(call.days ?? 0)} day{call.days === -1 ? "" : "s"} overdue.
            </p>
          ) : call.state === "due" ? (
            <p className="text-sm font-medium text-warning">Call the inspector by {formatDate(call.callBy!)}.</p>
          ) : call.state === "scheduled" ? (
            <p className="text-xs text-muted-foreground">Call the inspector by {formatDate(call.callBy!)}.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Set when the cable will be ready and the board will say when to call.</p>
          )}
          {callBlockers.length > 0 ? (
            <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {callBlockers[0]}
            </p>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant={call.state === "overdue" || call.state === "due" ? "default" : "outline"}
              aria-disabled={callBlockers.length > 0}
              disabled={busy}
              onClick={() => {
                // Said in words rather than greyed out: the reason is printed above.
                if (callBlockers.length > 0) return onError(callBlockers[0]);
                void run(() => inspectionService.placeCall(order.id, actorFromSession()), `Inspection call placed for ${order.id}.`);
              }}
            >
              <PhoneCallIcon className="mr-2 size-4" />
              Record that the inspector was called
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── The result ────────────────────────────────────────────────────────────────

function RecordResult({
  orderId,
  items,
  gtp,
  drumHint,
  onChanged,
  onError,
}: {
  orderId: string;
  items: ReturnType<typeof checklistFromGtp>;
  gtp: NonNullable<ReturnType<typeof orderGtp>>;
  drumHint: string;
  onChanged: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [rows, setRows] = React.useState<ChecklistDraftRow[]>(() => blankRows(items));
  const [inspectorName, setInspectorName] = React.useState("");
  const [inspectorOrg, setInspectorOrg] = React.useState("");
  const [inspectedOn, setInspectedOn] = React.useState(() => defaultPromisedDate(now(), 0));
  const [drums, setDrums] = React.useState(drumHint);
  const [clearance, setClearance] = React.useState(false);
  const [diRef, setDiRef] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const evaluation = evaluateChecklist(rows);
  const answered = rows.length - evaluation.pending;

  function setRow(index: number, patch: Partial<ChecklistDraftRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setProblem(null);
  }

  async function save() {
    const built = buildInspectionReport({
      order: { id: orderId },
      gtp,
      rows,
      inspectorName,
      inspectorOrg,
      inspectedOn,
      drums,
      clearanceIssued: clearance,
      diRef,
    });
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    setSaving(true);
    try {
      await inspectionService.logReport(built.report, actorFromSession());
      const r = built.report;
      await onChanged(
        r.result === "Failed"
          ? `Inspection failed on ${orderId} — ${r.nonConformances?.length ?? 0} non-conformance${r.nonConformances?.length === 1 ? "" : "s"} recorded. It stays in production until it is re-inspected.`
          : r.clearanceIssued
            ? `Inspection passed on ${orderId} and dispatch clearance recorded — it can move to Ready for dispatch.`
            : `Inspection passed on ${orderId}, but no dispatch clearance yet — it stays in production until one is issued.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not record the inspection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-md border bg-background">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">Record the inspection result</summary>
      <div className="space-y-4 border-t p-3">
        <p className="text-xs text-muted-foreground">
          Against {gtp.id}, version {gtp.version}. Mark every row Pass, Fail or N/A. N/A means not checked at this visit — it is recorded as
          a decision, not left blank.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="insp-name" className="text-xs">Inspector</Label>
            <Input id="insp-name" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="insp-org" className="text-xs">From (board or agency)</Label>
            <Input id="insp-org" value={inspectorOrg} onChange={(e) => setInspectorOrg(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="insp-date" className="text-xs">Date of inspection</Label>
            <Input id="insp-date" type="date" value={inspectedOn} onChange={(e) => setInspectedOn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="insp-drums" className="text-xs">Drums checked</Label>
            <Input id="insp-drums" value={drums} onChange={(e) => setDrums(e.target.value)} placeholder="e.g. 1, 2, 3" />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {answered} of {rows.length} answered
          </span>
          <span
            className={cn(
              "font-medium",
              evaluation.outcome === "Passed" && "text-success",
              evaluation.outcome === "Failed" && "text-danger",
            )}
          >
            {evaluation.outcome === "Incomplete" ? "Not finished" : evaluation.outcome === "Passed" ? "All clear" : `${evaluation.failures.length} failed`}
          </span>
        </div>

        <ul className="space-y-1.5">
          {rows.map((row, index) => (
            <li key={row.key} className="space-y-1.5 rounded-md border p-2">
              <div>
                <p className="text-sm">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  GTP: <span className="font-mono text-foreground">{row.gtpValue}</span>
                  {row.tolerance !== "N/A" ? <> · tolerance {row.tolerance}</> : null}
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label={`${row.label} — measured`}
                  placeholder="Measured"
                  value={row.measured}
                  onChange={(event) => setRow(index, { measured: event.target.value })}
                  className="h-8 flex-1 text-xs"
                />
                <select
                  aria-label={`${row.label} — result`}
                  value={row.result}
                  onChange={(event) => setRow(index, { result: event.target.value as ChecklistResult })}
                  className={cn(
                    "h-8 w-24 rounded-md border border-input bg-background px-2 text-xs",
                    row.result === "Pass" && "text-success",
                    row.result === "Fail" && "text-danger",
                  )}
                >
                  {RESULTS.map((result) => (
                    <option key={result} value={result}>
                      {result}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <label className={cn("flex items-center gap-2 text-sm", evaluation.outcome !== "Passed" && "opacity-60")}>
            <input
              type="checkbox"
              checked={clearance && evaluation.outcome === "Passed"}
              disabled={evaluation.outcome !== "Passed"}
              onChange={(event) => setClearance(event.target.checked)}
            />
            Dispatch clearance issued
          </label>
          {evaluation.outcome !== "Passed" ? (
            <p className="text-xs text-muted-foreground">
              {evaluation.outcome === "Failed" ? "A failed inspection cannot carry a dispatch clearance." : "Available once every row is answered and none failed."}
            </p>
          ) : null}
          {clearance && evaluation.outcome === "Passed" ? (
            <div className="space-y-1">
              <Label htmlFor="insp-di" className="text-xs">DI reference</Label>
              <Input id="insp-di" value={diRef} onChange={(e) => setDiRef(e.target.value)} placeholder="Dispatch instruction number" />
            </div>
          ) : null}
        </div>

        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
        <Button type="button" disabled={saving} onClick={() => void save()}>
          <SaveIcon className="mr-2 size-4" />
          Record inspection
        </Button>
      </div>
    </details>
  );
}

// ── History ───────────────────────────────────────────────────────────────────

function History({ reports }: { reports: CableStore["inspectionReports"] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">Inspection history</p>
      <ul className="space-y-2">
        {reports.map((report) => (
          <li key={report.id} className="rounded-md border bg-background p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{report.id}</span>
              <span className={cn("text-xs font-medium", report.result === "Passed" ? "text-success" : "text-danger")}>
                {report.result}
                {report.result === "Passed" ? (report.clearanceIssued ? ` · DI ${report.diRef ?? "issued"}` : " · no clearance") : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.inspectorName}, {report.inspectorOrg} · {formatDate(report.inspectedAt)}
              {report.gtpId ? ` · against ${report.gtpId} v${report.gtpVersion ?? "?"}` : ""}
            </p>
            {report.nonConformances && report.nonConformances.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-danger">
                {report.nonConformances.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

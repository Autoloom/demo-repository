/*  Implements dispatch management, dispatch cards, 
    logistics information, checklist progress, order/customer lookup,
    loading states, and dispatch interactions. */

"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  FileTextIcon,
  InboxIcon,
  MegaphoneIcon,
  PackageCheckIcon,
  PencilIcon,
  RefreshCwIcon,
  TruckIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { INSPECTOR_ARRIVAL_DAYS, inspectionCallUrgency } from "@/lib/domain/inspection";
import { can } from "@/lib/rbac";
import {
  dataService,
  dispatchService,
  inspectionService,
  integrationsService,
  type CableStore,
  type Dispatch,
  type InspectionReport,
  type Order,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { lookup } from "dns/promises"
import { cn } from "@/lib/utils";

type LoadState = {
  dispatches: Dispatch[];
  store: CableStore | null;
};

type Tone = "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-border bg-muted text-muted-foreground",
};

function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[0, 1].map((item) => (
        <div key={item} className="animate-pulse rounded-md border bg-card p-4">
          <div className="h-5 w-40 rounded-sm bg-muted" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-14 rounded-md bg-muted" />
            <div className="h-14 rounded-md bg-muted" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function requiredProgress(dispatch: Dispatch) {
  const required = dispatch.checklist.filter((item) => item.required);
  const done = required.filter((item) => item.done).length;
  return { done, total: required.length, ready: required.length > 0 && done === required.length };
}

function orderFor(store: CableStore | null, dispatch: Dispatch): Order | undefined {
  return store?.orders.find((order) => order.id === dispatch.orderId);
}

function customerName(store: CableStore | null, customerId?: string) {
  return store?.customers.find((customer) => customer.id === customerId)?.name ?? customerId ?? "Unlinked customer";
}

/** Drums planned on the job card — the set the inspector checks and certs are issued against. */
function plannedDrumsFor(store: CableStore | null, dispatch: Dispatch): string[] {
  const jobCard = store?.jobCards.find((card) => card.orderId === dispatch.orderId);
  return jobCard?.drumPlan.map((item) => item.drumNo) ?? [];
}

function reportsFor(store: CableStore | null, dispatch: Dispatch): InspectionReport[] {
  return store?.inspectionReports.filter((report) => report.orderId === dispatch.orderId) ?? [];
}

async function fetchDispatchPageData(): Promise<LoadState> {
  const [dispatches, store] = await Promise.all([dispatchService.list(), dataService.read()]);
  return { dispatches, store };
}

function LogisticsField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-sm", mono && "font-mono")}>{value || "Pending"}</p>
    </div>
  );
}

/**
 * Third-party inspection: the call countdown, and the digital log that replaces
 * the QC manager's diary (kamble-meeting-improvements.md §4).
 *
 * The call must go out ~10 days before completion and the inspector takes ~11 days
 * to arrive, so the countdown is the point of the panel — a late call leaves finished
 * cable idling on the floor. Logging a Pass with clearance auto-ticks the dispatch
 * "Inspection clearance" item, which is why this lives on the dispatch card.
 */
function InspectionPanel({
  order,
  reports,
  editable,
  busy,
  plannedDrums,
  onPlaceCall,
  onLogReport,
}: {
  order: Order;
  reports: InspectionReport[];
  editable: boolean;
  busy: boolean;
  plannedDrums: string[];
  onPlaceCall: () => void;
  onLogReport: (input: Omit<InspectionReport, "id">) => void;
}) {
  const urgency = inspectionCallUrgency(order);
  const status = order.inspectionStatus ?? "Not called";
  const called = status !== "Not called";
  // `null` = form closed. Opening it seeds today's date and every planned drum,
  // since the inspector normally checks the whole consignment.
  const [draft, setDraft] = React.useState<{
    inspectorName: string;
    inspectorOrg: string;
    inspectedAt: string;
    drumsChecked: string[];
    result: InspectionReport["result"];
    nonConformances: string;
    clearanceIssued: boolean;
    diRef: string;
  } | null>(null);

  const urgencyTone: Tone =
    urgency.state === "overdue" ? "danger" : urgency.state === "due" ? "warning" : "neutral";

  const statusTone: Tone =
    status === "Passed" ? "success" : status === "Failed" ? "danger" : called ? "neutral" : "warning";

  function openForm() {
    setDraft({
      inspectorName: "",
      inspectorOrg: "",
      inspectedAt: now().toISOString().slice(0, 10),
      drumsChecked: plannedDrums,
      result: "Passed",
      nonConformances: "",
      clearanceIssued: true,
      diRef: "",
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const passed = draft.result === "Passed";
    // A failed inspection issues no clearance, and the non-conformances are the
    // record of why — the service keeps the order in production on a Fail.
    const nonConformances = draft.nonConformances
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    onLogReport({
      orderId: order.id,
      inspectorName: draft.inspectorName.trim(),
      inspectorOrg: draft.inspectorOrg.trim(),
      inspectedAt: draft.inspectedAt,
      drumsChecked: draft.drumsChecked,
      result: draft.result,
      nonConformances: passed ? undefined : nonConformances,
      clearanceIssued: passed && draft.clearanceIssued,
      diRef: passed && draft.clearanceIssued && draft.diRef.trim() ? draft.diRef.trim() : undefined,
    });
    setDraft(null);
  }

  return (
    <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Third-party inspection</p>
        <Badge tone={statusTone}>{status}</Badge>
      </div>

      {/* Call countdown — the expensive mistake this panel exists to prevent */}
      {urgency.state === "none" ? (
        <p className="mt-2 text-muted-foreground">
          {called
            ? `Call placed ${formatDate(order.inspectionCallDate ?? "")} · inspector expected ${formatDate(order.inspectorEtaDate ?? "")}`
            : "No estimated completion date set on the job card — the call countdown starts once it is."}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={urgencyTone}>
            <AlertTriangleIcon className="size-3" />
            {urgency.state === "overdue"
              ? `Call overdue by ${urgency.overdueBy} day(s)`
              : `Call due in ${urgency.daysLeft} day(s)`}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Call by {formatDate(urgency.callBy)} · inspector needs ~{INSPECTOR_ARRIVAL_DAYS} days to arrive
          </span>
        </div>
      )}

      {!called ? (
        <Button
          type="button"
          size="sm"
          variant={urgency.state === "overdue" ? "default" : "outline"}
          className="mt-3"
          disabled={!editable || busy}
          onClick={onPlaceCall}
        >
          <MegaphoneIcon className="mr-2 size-4" />
          {busy ? "Placing…" : "Place inspection call"}
        </Button>
      ) : null}

      {/* Digital inspection log */}
      <div className="mt-3 space-y-1.5">
        {reports.length === 0 ? (
          <p className="text-muted-foreground">No inspection logged yet.</p>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="rounded-md border bg-background px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {report.result === "Passed" ? (
                    <CheckCircle2Icon className="size-3.5 text-success" />
                  ) : (
                    <AlertTriangleIcon className="size-3.5 text-danger" />
                  )}
                  <span className="font-medium">{report.result}</span>
                  <span className="text-xs text-muted-foreground">
                    {report.inspectorName}
                    {report.inspectorOrg ? ` · ${report.inspectorOrg}` : ""} · {formatDate(report.inspectedAt)}
                  </span>
                </span>
                {report.clearanceIssued ? (
                  <Badge tone="success">Clearance{report.diRef ? ` · ${report.diRef}` : ""}</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.drumsChecked.length} drum(s) checked
                {report.drumsChecked.length > 0 ? `: ${report.drumsChecked.join(", ")}` : ""}
              </p>
              {report.nonConformances && report.nonConformances.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-danger">
                  {report.nonConformances.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      {draft ? (
        <form className="mt-3 grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${order.id}-inspector`}>
              Inspector
            </label>
            <Input
              id={`${order.id}-inspector`}
              value={draft.inspectorName}
              onChange={(event) => setDraft({ ...draft, inspectorName: event.target.value })}
              placeholder="e.g. R. Kulkarni"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${order.id}-inspector-org`}>
              Agency
            </label>
            <Input
              id={`${order.id}-inspector-org`}
              value={draft.inspectorOrg}
              onChange={(event) => setDraft({ ...draft, inspectorOrg: event.target.value })}
              placeholder="e.g. RITES"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${order.id}-inspected-at`}>
              Inspected on
            </label>
            <Input
              id={`${order.id}-inspected-at`}
              type="date"
              value={draft.inspectedAt}
              onChange={(event) => setDraft({ ...draft, inspectedAt: event.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Result</span>
            <div className="flex gap-2">
              {(["Passed", "Failed"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={draft.result === option ? "default" : "outline"}
                  onClick={() => setDraft({ ...draft, result: option })}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <fieldset className="space-y-1.5 md:col-span-2">
            <legend className="text-xs font-medium text-muted-foreground">Drums checked</legend>
            {plannedDrums.length === 0 ? (
              <p className="text-xs text-muted-foreground">No drums planned on the job card yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {plannedDrums.map((drumNo) => {
                  const checked = draft.drumsChecked.includes(drumNo);
                  return (
                    <label
                      key={drumNo}
                      className={cn(
                        "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs",
                        checked ? "border-primary/40 bg-primary/10" : "bg-background",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            drumsChecked: event.target.checked
                              ? [...draft.drumsChecked, drumNo]
                              : draft.drumsChecked.filter((entry) => entry !== drumNo),
                          })
                        }
                        className="size-3.5 accent-primary"
                      />
                      <span className="font-mono">{drumNo}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          {draft.result === "Failed" ? (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`${order.id}-ncs`}>
                Non-conformances (one per line)
              </label>
              <textarea
                id={`${order.id}-ncs`}
                value={draft.nonConformances}
                onChange={(event) => setDraft({ ...draft, nonConformances: event.target.value })}
                rows={3}
                required
                placeholder="e.g. Drum D-002 insulation thickness below IS 14255 §7.3 floor"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1.5 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.clearanceIssued}
                  onChange={(event) => setDraft({ ...draft, clearanceIssued: event.target.checked })}
                  className="size-4 accent-primary"
                />
                Clearance issued — ticks the dispatch clearance item
              </label>
              {draft.clearanceIssued ? (
                <Input
                  value={draft.diRef}
                  onChange={(event) => setDraft({ ...draft, diRef: event.target.value })}
                  placeholder="Dispatch instruction ref (optional)"
                  className="font-mono"
                  aria-label="Dispatch instruction reference"
                />
              ) : null}
            </div>
          )}

          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Log inspection"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={!editable || busy}
          onClick={openForm}
        >
          <PencilIcon className="mr-2 size-4" />
          Log inspection result
        </Button>
      )}
    </div>
  );
}

function DispatchCard({
  dispatch,
  order,
  customer,
  plannedDrums,
  reports,
  editable,
  busyKey,
  onToggle,
  onGenerateEway,
  onSaveLogistics,
  onVerifyCert,
  onPlaceCall,
  onLogReport,
}: {
  dispatch: Dispatch;
  order?: Order;
  customer: string;
  plannedDrums: string[];
  reports: InspectionReport[];
  editable: boolean;
  busyKey: string | null;
  onToggle: (itemId: string, done: boolean) => void;
  onGenerateEway: () => void;
  onSaveLogistics: (patch: { transporter: string; vehicleNo: string }) => Promise<void>;
  onVerifyCert: (drumNo: string, verified: boolean) => void;
  onPlaceCall: () => void;
  onLogReport: (input: Omit<InspectionReport, "id">) => void;
}) {
  const progress = requiredProgress(dispatch);
  // `null` = not editing. When editing, holds the draft transporter/vehicle.
  const [draft, setDraft] = React.useState<{ transporter: string; vehicleNo: string } | null>(null);
  const editingLogistics = draft !== null;
  const savingLogistics = busyKey === `${dispatch.id}-logistics`;

  function beginEdit() {
    setDraft({ transporter: dispatch.transporter, vehicleNo: dispatch.vehicleNo });
  }

  return (
    <article
      className={cn(
        "rounded-md border bg-card p-4 shadow-sm",
        progress.ready && "border-success/40",
      )}
    >
      <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{order?.title ?? dispatch.orderId}</h2>
            <Badge tone={progress.ready ? "success" : "warning"}>
              {progress.ready ? <CheckCircle2Icon className="size-3" /> : null}
              {progress.ready ? "Ready" : `${progress.done}/${progress.total} ready`}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{customer}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {dispatch.id} · {dispatch.orderId}
          </p>
        </div>
        <div className="text-sm md:text-right">
          <p className="font-mono font-medium">{formatINR(order?.amountInr ?? 0)}</p>
          <p className="mt-1 text-muted-foreground">Created {formatDate(dispatch.createdAt)}</p>
        </div>
      </div>

      {/* Logistics — editable for Operations/Owner */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-muted-foreground">Logistics</p>
          {editable && !editingLogistics ? (
            <Button type="button" variant="ghost" size="sm" onClick={beginEdit}>
              <PencilIcon className="mr-1.5 size-3.5" />
              Edit
            </Button>
          ) : null}
        </div>
        {draft ? (
          <form
            className="mt-2 grid gap-3 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSaveLogistics({ transporter: draft.transporter.trim(), vehicleNo: draft.vehicleNo.trim() });
              setDraft(null);
            }}
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`${dispatch.id}-transporter`}>
                Transporter
              </label>
              <Input
                id={`${dispatch.id}-transporter`}
                value={draft.transporter}
                onChange={(event) => setDraft({ ...draft, transporter: event.target.value })}
                placeholder="e.g. BlueLine Logistics"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`${dispatch.id}-vehicle`}>
                Vehicle no.
              </label>
              <Input
                id={`${dispatch.id}-vehicle`}
                value={draft.vehicleNo}
                onChange={(event) => setDraft({ ...draft, vehicleNo: event.target.value })}
                placeholder="e.g. MH12 AB 4412"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" size="sm" disabled={savingLogistics}>
                {savingLogistics ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={savingLogistics} onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <LogisticsField label="Transporter" value={dispatch.transporter} />
            <LogisticsField label="Vehicle" value={dispatch.vehicleNo} mono />
          </div>
        )}
      </div>

      {/* Required-item progress bar */}
      <div
        className="mt-4 flex gap-1"
        role="progressbar"
        aria-valuenow={progress.done}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label={`${progress.done} of ${progress.total} required items complete`}
      >
        {dispatch.checklist
          .filter((item) => item.required)
          .map((item) => (
            <span key={item.id} className={cn("h-1 flex-1 rounded-sm", item.done ? "bg-success" : "bg-muted")} />
          ))}
      </div>

      {/* Checklist */}
      <div className="mt-4 space-y-2">
        {dispatch.checklist.map((item) => {
          const itemBusy = busyKey === `${dispatch.id}-${item.id}`;
          return (
            <label
              key={item.id}
              className={cn(
                "flex min-h-10 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm transition-colors",
                editable && "hover:bg-muted",
                !editable && "cursor-default",
              )}
            >
              <span className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2Icon className="size-4 text-success" />
                ) : (
                  <CircleIcon className="size-4 text-muted-foreground" />
                )}
                <span className={cn(item.done && "text-muted-foreground line-through")}>{item.label}</span>
                {!item.required ? <Badge>Optional</Badge> : null}
              </span>
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable || itemBusy}
                onChange={(event) => onToggle(item.id, event.target.checked)}
                className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={item.label}
              />
            </label>
          );
        })}
      </div>

      {/* E-way bill */}
      <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">E-way bill</p>
            <p className="mt-1 text-muted-foreground">
              {dispatch.ewayBillRequired ? "Required for this consignment (> ₹50,000)" : "Not required below threshold"}
              {dispatch.ewayBillNo ? (
                <>
                  {" · "}
                  <span className="font-mono text-foreground">{dispatch.ewayBillNo}</span>
                </>
              ) : null}
            </p>
          </div>
          {dispatch.ewayBillNo ? (
            <Badge tone="success">
              <CheckCircle2Icon className="size-3" />
              Generated
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!editable || !dispatch.ewayBillRequired || busyKey === `${dispatch.id}-eway`}
              onClick={onGenerateEway}
            >
              <PackageCheckIcon className="mr-2 size-4" />
              {busyKey === `${dispatch.id}-eway` ? "Generating…" : "Generate"}
            </Button>
          )}
        </div>
      </div>

      {/* Per-drum test certificates — generated from Finished Cable QC on the job card */}
      <div className="mt-4 rounded-md border bg-muted p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Test certificates (per drum)</p>
          <Badge tone={plannedDrums.length > 0 && plannedDrums.every((drumNo) => dispatch.drumTestCerts.some((cert) => cert.drumNo === drumNo && cert.verified)) ? "success" : "warning"}>
            {dispatch.drumTestCerts.filter((cert) => cert.verified).length}/{Math.max(plannedDrums.length, dispatch.drumTestCerts.length)} verified
          </Badge>
        </div>
        <div className="mt-2 space-y-1.5">
          {plannedDrums.length === 0 && dispatch.drumTestCerts.length === 0 ? (
            <p className="text-muted-foreground">No drums planned yet — certificates appear as finished cable QC passes.</p>
          ) : (
            (plannedDrums.length > 0 ? plannedDrums : dispatch.drumTestCerts.map((cert) => cert.drumNo)).map((drumNo) => {
              const cert = dispatch.drumTestCerts.find((entry) => entry.drumNo === drumNo);
              return (
                <div key={drumNo} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5">
                  <span className="flex items-center gap-2">
                    <FileTextIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{drumNo}</span>
                    {cert ? (
                      <span className="font-mono text-xs text-foreground">{cert.certRef}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">QC pending on job card</span>
                    )}
                  </span>
                  {cert ? (
                    <label className="flex items-center gap-1.5 text-xs">
                      Verified
                      <input
                        type="checkbox"
                        checked={cert.verified}
                        disabled={!editable || busyKey === `${dispatch.id}-cert-${drumNo}`}
                        onChange={(event) => onVerifyCert(drumNo, event.target.checked)}
                        className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Verify certificate for ${drumNo}`}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {order ? (
        <InspectionPanel
          order={order}
          reports={reports}
          editable={editable}
          busy={busyKey === `${dispatch.id}-inspection`}
          plannedDrums={plannedDrums}
          onPlaceCall={onPlaceCall}
          onLogReport={onLogReport}
        />
      ) : null}

      {dispatch.packingListRef ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-sm border bg-background px-2 py-1">
            <FileTextIcon className="size-3.5" />
            Packing list <span className="font-mono text-foreground">{dispatch.packingListRef}</span>
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders?orderId=${dispatch.orderId}`}>View order board</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/records/${dispatch.orderId}`}>View journey</Link>
        </Button>
      </div>
    </article>
  );
}

export function DispatchClient() {
  const role = useSessionStore((state) => state.role);
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [data, setData] = React.useState<LoadState>({ dispatches: [], store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const editable = can(role, "edit", "dispatch");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDispatchPageData());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dispatch checklist could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    fetchDispatchPageData()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Dispatch checklist could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!feedback) return;
    const handle = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  async function toggle(dispatchId: string, itemId: string, done: boolean) {
    setBusyKey(`${dispatchId}-${itemId}`);
    setError(null);
    try {
      const before = data.dispatches.find((item) => item.id === dispatchId);
      const wasReady = before ? requiredProgress(before).ready : false;
      const updated = await dispatchService.toggleChecklist(dispatchId, itemId, done, actorFromSession());
      await load();
      if (!wasReady && requiredProgress(updated).ready) {
        setFeedback({ tone: "success", text: `${dispatchId} cleared — order ready for dispatch, invoice ready to sync.` });
      }
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Checklist update failed." });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveLogistics(dispatchId: string, patch: { transporter: string; vehicleNo: string }) {
    setBusyKey(`${dispatchId}-logistics`);
    try {
      await dispatchService.updateLogistics(dispatchId, patch, actorFromSession());
      await load();
      setFeedback({ tone: "success", text: "Logistics updated." });
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not update logistics." });
    } finally {
      setBusyKey(null);
    }
  }

  async function generateEway(dispatchId: string) {
    setBusyKey(`${dispatchId}-eway`);
    try {
      await integrationsService.generateEwayBill(dispatchId, actorFromSession());
      await load();
      setFeedback({ tone: "success", text: "E-way bill generated and attached to the checklist." });
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "E-way bill generation failed." });
    } finally {
      setBusyKey(null);
    }
  }

  async function verifyCert(dispatchId: string, drumNo: string, verified: boolean) {
    setBusyKey(`${dispatchId}-cert-${drumNo}`);
    try {
      await dispatchService.setDrumCertVerified(dispatchId, drumNo, verified, actorFromSession());
      await load();
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not update the certificate." });
    } finally {
      setBusyKey(null);
    }
  }

  async function placeCall(dispatchId: string, targetOrderId: string) {
    setBusyKey(`${dispatchId}-inspection`);
    try {
      const order = await inspectionService.placeCall(targetOrderId, actorFromSession());
      await load();
      setFeedback({
        tone: "success",
        text: `Inspection call placed — inspector expected by ${formatDate(order.inspectorEtaDate ?? "")}.`,
      });
    } catch (err) {
      // The service refuses the call while any drum's finished-cable QC is still open.
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not place the inspection call." });
    } finally {
      setBusyKey(null);
    }
  }

  async function logReport(dispatchId: string, input: Omit<InspectionReport, "id">) {
    setBusyKey(`${dispatchId}-inspection`);
    try {
      const report = await inspectionService.logReport(input, actorFromSession());
      await load();
      setFeedback(
        report.result === "Passed"
          ? {
              tone: "success",
              text: report.clearanceIssued
                ? "Inspection passed — clearance issued and the dispatch item ticked."
                : "Inspection passed — clearance still pending.",
            }
          : { tone: "danger", text: "Inspection failed — order stays in production for re-inspection." },
      );
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not log the inspection." });
    } finally {
      setBusyKey(null);
    }
  }

  const visible = orderId
    ? data.dispatches.filter((dispatch) => dispatch.orderId === orderId)
    : data.dispatches;
  const readyCount = visible.filter((dispatch) => requiredProgress(dispatch).ready).length;
  const blockers = visible.length - readyCount;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <TruckIcon className="size-4" />
            Dispatch handoff
          </div>
          <h1 className="text-2xl font-semibold">Dispatch Checklist</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Clear drum marking, test certificate, packing list, invoice readiness, and e-way bill. Completing every required item is the Operations → Accounts handoff.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          <RefreshCwIcon className="mr-2 size-4" />
          Refresh
        </Button>
      </header>

      {orderId ? (
        <div className="flex items-center gap-2 rounded-md border border-stage-dispatch/30 bg-stage-dispatch/10 px-3 py-2 text-sm text-stage-dispatch">
          <span>
            Filtered to order <span className="font-mono">{orderId}</span>
          </span>
          <Button asChild variant="ghost" size="sm" className="ml-auto h-7 text-stage-dispatch hover:bg-stage-dispatch/15">
            <Link href="/dispatch">
              <XIcon className="mr-1 size-3.5" />
              Clear filter
            </Link>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Ready cards</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-success">{readyCount}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Open blockers</p>
          <p className={cn("mt-2 font-mono text-2xl font-semibold", blockers > 0 ? "text-warning" : "")}>{blockers}</p>
        </div>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">Edit access</p>
          <p className="mt-2 text-sm font-medium">
            {editable ? `${role} can complete checklist items` : `${role} is view-only`}
          </p>
        </div>
      </section>

      {feedback ? (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            feedback.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {feedback.tone === "success" ? <CheckCircle2Icon className="size-4" /> : <AlertTriangleIcon className="size-4" />}
          {feedback.text}
        </div>
      ) : null}

      {loading ? <SkeletonCards /> : null}

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

      {!loading && !error && visible.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center">
          <InboxIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-medium">{orderId ? "No dispatch for this order" : "No dispatch cards"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {orderId
              ? "This order has no dispatch record yet."
              : "Dispatch cards are created when quotes move to the order board."}
          </p>
          {orderId ? (
            <Button asChild variant="outline" className="mt-4">
              <Link href="/dispatch">View all dispatches</Link>
            </Button>
          ) : (
            <Button asChild className="mt-4">
              <Link href="/orders">Open order board</Link>
            </Button>
          )}
        </div>
      ) : null}

      {!loading && !error && visible.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {visible.map((dispatch) => (
            <DispatchCard
              key={dispatch.id}
              dispatch={dispatch}
              order={orderFor(data.store, dispatch)}
              customer={customerName(data.store, orderFor(data.store, dispatch)?.customerId)}
              plannedDrums={plannedDrumsFor(data.store, dispatch)}
              reports={reportsFor(data.store, dispatch)}
              editable={editable}
              busyKey={busyKey}
              onToggle={(itemId, done) => void toggle(dispatch.id, itemId, done)}
              onGenerateEway={() => void generateEway(dispatch.id)}
              onSaveLogistics={(patch) => saveLogistics(dispatch.id, patch)}
              onVerifyCert={(drumNo, verified) => void verifyCert(dispatch.id, drumNo, verified)}
              onPlaceCall={() => void placeCall(dispatch.id, dispatch.orderId)}
              onLogReport={(input) => void logReport(dispatch.id, input)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

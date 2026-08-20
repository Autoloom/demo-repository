"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileCheckIcon,
  InboxIcon,
  ListIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  SaveIcon,
  StampIcon,
  Table2Icon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/domain/format";
import { buildGtpTable } from "@/lib/domain/gtp-table";
import { downloadPdf, type PdfDocument } from "@/lib/domain/pdf";
import { can } from "@/lib/rbac";
import {
  dataService,
  gtpService,
  type CableSpec,
  type CableStore,
  type Gtp,
  type GtpSignOff,
  type GtpStatus,
  type Order,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { GtpHome } from "./GtpHome";
import { cn } from "@/lib/utils";

type LoadState = {
  store: CableStore | null;
};

const statusTone: Record<GtpStatus, string> = {
  Draft: "border-border bg-muted text-muted-foreground",
  "Pending sign-off": "border-warning/30 bg-warning/10 text-warning",
  Approved: "border-success/30 bg-success/10 text-success",
};

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

function orderForGtp(store: CableStore, gtp: Gtp): Order | undefined {
  return store.orders.find((order) => order.gtpId === gtp.id || order.id === gtp.orderId);
}

function initialParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function gtpPdfDocument(gtp: Gtp, spec: CableSpec): PdfDocument {
  const table = buildGtpTable(spec, gtp);
  return {
    title: table.title,
    subtitle: "Guaranteed Technical Particulars",
    meta: [
      table.tenderNo ? `Tender No.: ${table.tenderNo}` : undefined,
      `GTP: ${gtp.id} v${gtp.version}`,
      `Status: ${gtp.status}`,
      `Manufacturer: ${table.manufacturerName || "To be filled"}`,
      `Cable size: ${table.cableSizeLabel}`,
    ],
    sections: [
      {
        title: "Board format particulars",
        table: {
          headers: ["No.", "Particular", "Value"],
          widths: [36, 238, 240],
          rows: table.groups.flatMap((group) => {
            const single = group.items.length === 1 && !group.items[0].label;
            if (single) return [[group.no, group.label, group.items[0].value]];
            return [
              [group.no, group.label, ""],
              ...group.items.map((item) => ["", item.label, item.value]),
            ];
          }),
        },
      },
      {
        title: "Sign-offs",
        lines:
          gtp.signOffs.length > 0
            ? gtp.signOffs.map((stamp) => `${stamp.role}: ${stamp.name} - ${formatDate(stamp.stampedAt)}`)
            : ["Pending divisional engineer and assistant engineer stamps."],
      },
    ],
  };
}

export default function GtpPage() {
  const role = useSessionStore((state) => state.role);
  const [data, setData] = React.useState<LoadState>({ store: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState(() => initialParam("gtpId"));
  const [pendingOrderId] = React.useState(() => initialParam("orderId"));
  const [draft, setDraft] = React.useState<Gtp | null>(null);
  const [stampName, setStampName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [view, setView] = React.useState<"sections" | "sheet">("sections");

  const canView = can(role, "view", "gtp");
  const canEdit = can(role, "edit", "gtp");
  const canCreate = can(role, "create", "gtp");
  const canTransition = can(role, "transition", "gtp");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const store = await dataService.read();
      setData({ store });
    } catch (err) {
      setError(err instanceof Error ? err.message : "GTP records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(handle);
  }, [load]);

  // Deep link ?orderId= resolves to that order's GTP once data arrives.
  React.useEffect(() => {
    if (!pendingOrderId || selectedId || !data.store) return;
    const order = data.store.orders.find((entry) => entry.id === pendingOrderId);
    const gtp = order
      ? data.store.gtps.find((entry) => entry.id === order.gtpId || entry.orderId === order.id)
      : undefined;
    if (!gtp) return;
    const handle = window.setTimeout(() => setSelectedId(gtp.id), 0);
    return () => window.clearTimeout(handle);
  }, [pendingOrderId, selectedId, data.store]);

  React.useEffect(() => {
    if (!feedback) return;
    const handle = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  const store = data.store;
  const gtps = React.useMemo(() => store?.gtps ?? [], [store]);
  const records = gtps.filter((gtp) => !gtp.isTemplate);
  const templates = gtps.filter((gtp) => gtp.isTemplate);
  const stored = gtps.find((gtp) => gtp.id === selectedId) ?? null;
  const selected = draft && draft.id === selectedId ? draft : stored;
  const linkedOrder = store && selected ? orderForGtp(store, selected) : undefined;
  const selectedSpec =
    store && selected ? store.specs.find((entry) => entry.id === selected.specId) : undefined;
  const ordersWithoutGtp =
    store?.orders.filter(
      (order) =>
        order.stage !== "Quoted" &&
        !gtps.some((gtp) => gtp.id === order.gtpId || gtp.orderId === order.id),
    ) ?? [];
  const dirty = draft !== null && stored !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  // Client-mandated sections keep the board's exact wording — only Owner may touch them.
  const canEditSection = (source: "client-fixed" | "is-standard") =>
    canEdit && !selected?.isTemplate && (source === "is-standard" || role === "Owner");

  function choose(gtpId: string) {
    setSelectedId(gtpId);
    setDraft(null);
    setStampName("");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", gtpId ? `/gtp?gtpId=${gtpId}` : "/gtp");
    }
  }

  function patchSelected(patch: Partial<Gtp>) {
    setDraft((current) => {
      const base = current ?? stored;
      return base ? { ...base, ...patch } : current;
    });
  }

  function patchSection(index: number, value: string) {
    setDraft((current) => {
      const base = current ?? stored;
      if (!base) return current;
      return {
        ...base,
        sections: base.sections.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, value } : section,
        ),
      };
    });
  }

  async function run(action: () => Promise<unknown>, successText: string) {
    setBusy(true);
    try {
      await action();
      await load();
      setDraft(null);
      setFeedback({ tone: "success", text: successText });
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Action failed." });
    } finally {
      setBusy(false);
    }
  }

  async function createFor(orderId: string) {
    if (!orderId) return;
    setBusy(true);
    try {
      const gtp = await gtpService.createForOrder(orderId, actorFromSession());
      await load();
      choose(gtp.id);
      setFeedback({
        tone: "success",
        text:
          gtp.status === "Approved"
            ? `${gtp.id} reused from ${gtp.reusedFromGtpId} — already approved, zero re-entry.`
            : `${gtp.id} drafted${gtp.reusedFromGtpId ? ` (prefilled from ${gtp.reusedFromGtpId})` : " from the cable spec"}.`,
      });
    } catch (err) {
      setFeedback({ tone: "danger", text: err instanceof Error ? err.message : "Could not create GTP." });
    } finally {
      setBusy(false);
    }
  }

  function recordStamp(roleName: GtpSignOff["role"]) {
    if (!selected) return;
    const name = stampName.trim();
    if (!name) {
      setFeedback({ tone: "danger", text: "Enter the engineer's name before recording a stamp." });
      return;
    }
    void run(
      () => gtpService.recordStamp(selected.id, { role: roleName, name }, actorFromSession()),
      `${roleName} stamp recorded on ${selected.id}.`,
    );
    setStampName("");
  }

  function downloadSelectedGtpPdf() {
    if (!selected || !selectedSpec) {
      setFeedback({ tone: "danger", text: "Select a GTP with a linked cable spec before downloading the PDF." });
      return;
    }
    downloadPdf(`${selected.id}.pdf`, gtpPdfDocument(selected, selectedSpec));
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-sm text-danger">
        You do not have access to GTP records.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 print:hidden lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <FileCheckIcon className="size-4" />
            Production gate
          </div>
          <h1 className="text-2xl font-semibold">GTP Generator</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Guaranteed Technical Particulars per order. Production cannot begin until the divisional
            engineer and AE stamp the GTP — repeat orders for the same board reuse it with zero re-entry.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {canCreate && ordersWithoutGtp.length > 0 ? (
            <div className="min-w-64">
              <Label htmlFor="gtp-order">New GTP for order</Label>
              <select
                id="gtp-order"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
                disabled={busy}
                onChange={(event) => void createFor(event.target.value)}
              >
                <option value="">Select an order…</option>
                {ordersWithoutGtp.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.id} · {order.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCwIcon className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </header>

      {/* The three things people come to this tab to do. */}
      <GtpHome />

      {feedback ? (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm print:hidden",
            feedback.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {feedback.tone === "success" ? <CheckCircle2Icon className="size-4" /> : <AlertTriangleIcon className="size-4" />}
          {feedback.text}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-md border bg-muted" />
          <div className="h-72 animate-pulse rounded-md border bg-muted lg:col-span-2" />
        </div>
      ) : null}

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

      {!loading && !error && store ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <aside className="space-y-4 print:hidden">
            <section className="rounded-md border bg-card p-4">
              <h2 className="font-medium">Order GTPs</h2>
              <div className="mt-3 space-y-2">
                {records.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No GTPs yet. Create one for a won order to unblock production.
                  </p>
                ) : (
                  records.map((gtp) => (
                    <button
                      key={gtp.id}
                      type="button"
                      onClick={() => choose(gtp.id)}
                      className={cn(
                        "w-full rounded-md border bg-background p-3 text-left text-sm transition-colors hover:bg-muted",
                        selectedId === gtp.id && "border-primary ring-1 ring-primary",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{gtp.id}</span>
                        <Badge className={statusTone[gtp.status]}>{gtp.status}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{gtp.cableType}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {gtp.orderId ?? "Unlinked"} · v{gtp.version}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-md border bg-card p-4">
              <h2 className="font-medium">Public format templates</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pre-seeded board formats — new GTPs for a matching state/cable prefill from these.
              </p>
              <div className="mt-3 space-y-2">
                {templates.map((gtp) => (
                  <button
                    key={gtp.id}
                    type="button"
                    onClick={() => choose(gtp.id)}
                    className={cn(
                      "w-full rounded-md border bg-background p-3 text-left text-sm transition-colors hover:bg-muted",
                      selectedId === gtp.id && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{gtp.boardName}</span>
                      <Badge className="border-info/30 bg-info/10 text-info">Template</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {gtp.state} · {gtp.cableType}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          {!selected ? (
            <section className="rounded-md border bg-card p-8 text-center lg:col-span-2">
              <InboxIcon className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 font-medium">Select a GTP</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a record on the left, or create one for an order that has none.
              </p>
            </section>
          ) : (
            <section className="space-y-4 lg:col-span-2">
              <div className={cn("rounded-md border bg-card p-4", view === "sheet" && "print:hidden")}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-lg font-semibold">{selected.id}</h2>
                      <Badge className={statusTone[selected.status]}>{selected.status}</Badge>
                      <Badge className="border-border bg-muted text-muted-foreground">v{selected.version}</Badge>
                      {selected.isTemplate ? (
                        <Badge className="border-info/30 bg-info/10 text-info">Template (read-only)</Badge>
                      ) : null}
                      {selected.reusedFromGtpId ? (
                        <Badge className="border-info/30 bg-info/10 text-info">
                          <CopyIcon className="size-3" />
                          Reused from {selected.reusedFromGtpId}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{selected.cableType}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selected.boardName ?? "Board pending"} · {selected.state || "State pending"} ·{" "}
                      {selected.format === "client-fixed" ? "Client-fixed format" : "Self-generated format"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 print:hidden">
                    <div className="flex rounded-md border p-0.5">
                      <Button
                        type="button"
                        variant={view === "sections" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setView("sections")}
                      >
                        <ListIcon className="mr-2 size-4" />
                        Sections
                      </Button>
                      <Button
                        type="button"
                        variant={view === "sheet" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setView("sheet")}
                      >
                        <Table2Icon className="mr-2 size-4" />
                        Board format
                      </Button>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={!selectedSpec} onClick={downloadSelectedGtpPdf}>
                      <FileCheckIcon className="mr-2 size-4" />
                      Download GTP PDF
                    </Button>
                    {canEdit && !selected.isTemplate ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!dirty || busy}
                        onClick={() =>
                          void run(
                            () => gtpService.save(selected, actorFromSession()),
                            stored?.status === "Approved"
                              ? `${selected.id} saved — reopened as v${(stored?.version ?? 1) + 1}, stamps cleared.`
                              : `${selected.id} saved.`,
                          )
                        }
                      >
                        <SaveIcon className="mr-2 size-4" />
                        Save
                      </Button>
                    ) : null}
                  </div>
                </div>

                {linkedOrder && selected.status !== "Approved" ? (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning print:hidden">
                    <LockKeyholeIcon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Production is blocked for{" "}
                      <Link className="font-mono underline" href={`/records/${linkedOrder.id}`}>
                        {linkedOrder.id}
                      </Link>{" "}
                      until this GTP is approved.
                    </span>
                  </div>
                ) : null}
              </div>

              {view === "sheet" ? (
                <>
                  {canEdit && !selected.isTemplate ? (
                    <div className="rounded-md border bg-card p-4 print:hidden">
                      <h3 className="font-medium">Sheet header</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Printed at the top of the board-format GTP — save to persist.
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="gtp-manufacturer">Manufacturer name</Label>
                          <Input
                            id="gtp-manufacturer"
                            value={selected.manufacturerName ?? ""}
                            placeholder="e.g. Navya Cables Pvt. Ltd."
                            onChange={(event) => patchSelected({ manufacturerName: event.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="gtp-tender">Tender / PO no.</Label>
                          <Input
                            id="gtp-tender"
                            value={selected.tenderNo ?? ""}
                            placeholder="e.g. P-13/2016-17/PC-III"
                            onChange={(event) => patchSelected({ tenderNo: event.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {selectedSpec ? (
                    <GtpSheet gtp={selected} spec={selectedSpec} />
                  ) : (
                    <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                      No cable spec found for {selected.specId} — the board-format sheet needs the
                      contracted spec.
                    </div>
                  )}
                </>
              ) : (
              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Technical particulars</h3>
                  <span className="text-xs text-muted-foreground print:hidden">
                    Client-mandated rows keep the board&apos;s wording (Owner-only edits)
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {selected.sections.map((section, index) => (
                    <div key={section.id} className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[180px_1fr]">
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">{section.label}</p>
                        <Badge
                          className={cn(
                            "mt-2",
                            section.source === "client-fixed"
                              ? "border-highlight/30 bg-highlight/10 text-highlight"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          {section.source === "client-fixed" ? "Client-mandated" : "IS standard"}
                        </Badge>
                      </div>
                      {canEditSection(section.source) ? (
                        <textarea
                          aria-label={section.label}
                          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={section.value}
                          onChange={(event) => patchSection(index, event.target.value)}
                        />
                      ) : (
                        <p className="text-sm">{section.value}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )}

              {!selected.isTemplate ? (
                <div className="rounded-md border bg-card p-4 print:hidden">
                  <h3 className="font-medium">Sign-off tracker</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Divisional engineer + assistant engineer must both stamp before production begins.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(["Divisional Engineer", "Assistant Engineer"] as const).map((stampRole) => {
                      const stamp = selected.signOffs.find((entry) => entry.role === stampRole);
                      return (
                        <div key={stampRole} className="rounded-md border bg-background p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{stampRole}</span>
                            {stamp ? (
                              <Badge className="border-success/30 bg-success/10 text-success">
                                <CheckCircle2Icon className="size-3" />
                                Stamped
                              </Badge>
                            ) : (
                              <Badge className="border-border bg-muted text-muted-foreground">Pending</Badge>
                            )}
                          </div>
                          {stamp ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {stamp.name} · {formatDate(stamp.stampedAt)}
                            </p>
                          ) : selected.status === "Pending sign-off" && canTransition ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              disabled={busy}
                              onClick={() => recordStamp(stampRole)}
                            >
                              <StampIcon className="mr-2 size-4" />
                              Record stamp
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {selected.status === "Pending sign-off" && canTransition ? (
                    <div className="mt-3 max-w-sm space-y-1.5">
                      <Label htmlFor="stamp-name">Engineer name for the next stamp</Label>
                      <Input
                        id="stamp-name"
                        value={stampName}
                        placeholder="e.g. S. Kulkarni"
                        onChange={(event) => setStampName(event.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.status === "Draft" && canTransition ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || dirty}
                        onClick={() =>
                          void run(
                            () => gtpService.submitForSignOff(selected.id, actorFromSession()),
                            `${selected.id} sent for sign-off.`,
                          )
                        }
                      >
                        Submit for sign-off
                      </Button>
                    ) : null}
                    {selected.status === "Pending sign-off" && canTransition ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => gtpService.reject(selected.id, "Engineer requested changes", actorFromSession()),
                            `${selected.id} rejected — reopened as a new version.`,
                          )
                        }
                      >
                        <XCircleIcon className="mr-2 size-4" />
                        Record rejection
                      </Button>
                    ) : null}
                    {dirty ? (
                      <span className="self-center text-xs text-warning">Unsaved changes — save before submitting.</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Board-format GTP sheet — the fixed numbered table boards expect (WBSEDCL-style
 * layout). Values the spec cannot supply stay blank for manual fill — never fabricated.
 * PDF export is generated from the same table data, not from a browser print.
 */
function GtpSheet({ gtp, spec }: { gtp: Gtp; spec: CableSpec }) {
  const table = buildGtpTable(spec, gtp);
  const cell = "border border-black px-2 py-1.5 align-top";
  return (
    <div className="gtp-print-sheet overflow-x-auto rounded-md border bg-white p-6 text-black shadow-sm md:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="gtp-sheet-inner mx-auto min-w-[36rem] max-w-3xl font-serif">
        {table.tenderNo ? <p className="text-right text-xs">Tender No. {table.tenderNo}</p> : null}
        <h2 className="text-center text-sm font-bold uppercase tracking-wide underline">
          {table.title}
        </h2>
        <p className="mt-1 text-center text-xs">Detailed GTP in tabular form as per spec.</p>
        <table className="mt-4 w-full border-collapse text-xs leading-relaxed">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[42%]" />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={2} className={cn(cell, "font-bold uppercase")}>
                Name of Manufacturer
              </td>
              <td className={cell}>M/s. {table.manufacturerName || "—".repeat(20)}</td>
            </tr>
            <tr>
              <td colSpan={2} className={cn(cell, "font-bold")}>
                Cable Size:
              </td>
              <td className={cn(cell, "text-center font-bold")}>{table.cableSizeLabel}</td>
            </tr>
            {table.groups.map((group) => {
              const single = group.items.length === 1 && !group.items[0].label;
              if (single) {
                return (
                  <tr key={group.no}>
                    <td className={cn(cell, "text-center")}>{group.no}</td>
                    <td className={cn(cell, "font-bold")}>{group.label}</td>
                    <td className={cell}>{group.items[0].value || " "}</td>
                  </tr>
                );
              }
              return (
                <React.Fragment key={group.no}>
                  <tr>
                    <td rowSpan={group.items.length + 1} className={cn(cell, "text-center")}>
                      {group.no}
                    </td>
                    <td colSpan={2} className={cn(cell, "font-bold")}>
                      {group.label}
                    </td>
                  </tr>
                  {group.items.map((item) => (
                    <tr key={item.label}>
                      <td className={cell}>{item.label}</td>
                      <td className={cell}>{item.value || " "}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {gtp.signOffs.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
            {gtp.signOffs.map((stamp) => (
              <div key={stamp.role} className="text-center">
                <p className="font-semibold">{stamp.name}</p>
                <p className="mt-0.5">{formatDate(stamp.stampedAt)}</p>
                <div className="mx-auto mt-1 w-48 border-t border-black pt-1">
                  Signature &amp; Stamp — {stamp.role}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

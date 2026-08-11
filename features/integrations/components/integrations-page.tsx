/*  Integrations-management screen for connector metadata, 
    connection status, configuration values, logs, masking sensitive
    values, and integration actions. */

"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CheckCircle2,
  CircleAlert,
  CloudCog,
  DatabaseZap,
  FileCheck2,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate, formatINR } from "@/lib/domain/format";
import { can } from "@/lib/rbac";
import {
  dataService,
  integrationsService,
  invoicesService,
  type Actor,
  type CableStore,
  type ConnectorId,
  type ConnectorMeta,
  type ConnectionStatus,
  type Role,
  type SyncLog,
} from "@/lib/services";
import { hydrateSessionRole, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type HubData = {
  connectors: ConnectorMeta[];
  logs: SyncLog[];
  store: CableStore;
  rates: { aluminium: number; copper: number; at: string };
};

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type Feedback = { tone: Tone; message: string };

const fixedConnectorOrder: ConnectorId[] = ["zoho-books", "crm", "eway-bill", "mcx-index"];

const connectorDetails: Record<
  ConnectorId,
  {
    icon: LucideIcon;
    purpose: string;
    primaryAction: string;
    configTitle: string;
    specifics: string[];
  }
> = {
  "zoho-books": {
    icon: FileCheck2,
    purpose: "Push proforma and tax invoices into accounting once dispatch readiness is clean.",
    primaryAction: "Sync pending",
    configTitle: "Zoho organization",
    specifics: ["Org ID is masked", "Last invoice synced is tracked from sync history"],
  },
  crm: {
    icon: Building2,
    purpose: "Pull customer and inquiry records, then keep won sales context linked back to CRM.",
    primaryAction: "Import now",
    configTitle: "CRM endpoint",
    specifics: ["Field mapping is read-only in v1", "Imports create contacts with CRM IDs"],
  },
  "eway-bill": {
    icon: ShieldCheck,
    purpose: "Generate e-way bills for consignments above the policy threshold.",
    primaryAction: "Generate",
    configTitle: "GST portal credentials",
    specifics: ["Threshold comes from policy", "Recent EWB numbers are retained on dispatch"],
  },
  "mcx-index": {
    icon: DatabaseZap,
    purpose: "Pull pinned Aluminium and Copper rates for costing and manual fallback checks.",
    primaryAction: "Pull rates",
    configTitle: "Rate feed mode",
    specifics: ["Manual override remains Owner-only", "Rates feed Quote Builder costing"],
  },
};

const statusTone: Record<ConnectionStatus, Tone> = {
  Connected: "success",
  Disconnected: "neutral",
  Error: "danger",
  Syncing: "info",
};

const syncTone: Record<SyncLog["status"], Tone> = {
  success: "success",
  error: "danger",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

const toneTextClasses: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

function fixedConnectors(connectors: ConnectorMeta[]) {
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  return fixedConnectorOrder.flatMap((id) => {
    const connector = byId.get(id);
    return connector ? [connector] : [];
  });
}

async function loadHub(): Promise<HubData> {
  const [connectors, logs, store, rates] = await Promise.all([
    integrationsService.list(),
    integrationsService.logs(),
    dataService.read(),
    integrationsService.fetchMcxRates(),
  ]);

  return {
    connectors: fixedConnectors(connectors),
    logs,
    store,
    rates,
  };
}

function makeActor(user: { id: string; name: string; role: Role }): Actor {
  return { id: user.id, name: user.name, role: user.role };
}

function formatTimestamp(iso?: string) {
  if (!iso) return "Never";
  const date = iso.slice(0, 10);
  const time = iso.length > 15 ? iso.slice(11, 16) : "";
  return time ? `${formatDate(date)} / ${time}` : formatDate(date);
}

function directionLabel(direction: ConnectorMeta["direction"]) {
  if (direction === "in") return "Pull";
  if (direction === "out") return "Push";
  return "Pull + push";
}

function maskValue(value: string) {
  if (value.includes("*")) return value;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function latestLog(logs: SyncLog[], connectorId: ConnectorId, action?: SyncLog["action"]) {
  return logs.find((log) => log.connectorId === connectorId && (!action || log.action === action));
}

function findSyncTarget(connectorId: ConnectorId, store: CableStore) {
  if (connectorId === "zoho-books") {
    return (
      store.invoices.find((invoice) => invoice.syncStatus === "Ready to sync") ??
      store.invoices.find((invoice) => invoice.syncStatus !== "Synced to Zoho Books")
    );
  }

  if (connectorId === "eway-bill") {
    return (
      store.dispatches.find((dispatch) => dispatch.ewayBillRequired && !dispatch.ewayBillNo) ??
      store.dispatches.find((dispatch) => dispatch.ewayBillRequired)
    );
  }

  return null;
}

export default function IntegrationsPage() {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <IntegrationsHub />
    </QueryClientProvider>
  );
}

function IntegrationsHub() {
  const queryClient = useQueryClient();
  const role = useSessionStore((state) => state.role);
  const user = useSessionStore((state) => state.user);
  const [selectedConnector, setSelectedConnector] = React.useState<ConnectorMeta | null>(null);
  const [activeFilter, setActiveFilter] = React.useState<ConnectorId | "all">("all");
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);

  React.useEffect(() => {
    hydrateSessionRole();
  }, []);

  const actor = React.useMemo(() => makeActor(user), [user]);
  const canView = can(role, "view", "integrations");
  const canEdit = can(role, "edit", "integrations");

  const hubQuery = useQuery({
    queryKey: ["integrations-hub"],
    queryFn: loadHub,
  });

  const invalidateHub = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["integrations-hub"] });
  }, [queryClient]);

  const testMutation = useMutation({
    mutationFn: (connectorId: ConnectorId) => integrationsService.test(connectorId, actor),
    onSuccess: async (connector) => {
      setFeedback({ tone: "success", message: `${connector.name} connection test passed.` });
      await invalidateHub();
    },
    onError: (error) => {
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "Test failed." });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (connectorId: ConnectorId) => {
      const store = hubQuery.data?.store ?? (await dataService.read());
      if (connectorId === "zoho-books") {
        const invoice = findSyncTarget(connectorId, store);
        if (!invoice) throw new Error("No invoice is available for Zoho sync.");
        return invoicesService.sync(invoice.id, actor);
      }
      if (connectorId === "crm") return integrationsService.importFromCrm(actor);
      if (connectorId === "eway-bill") {
        const dispatch = findSyncTarget(connectorId, store);
        if (!dispatch) throw new Error("No dispatch needs an e-way bill.");
        return integrationsService.generateEwayBill(dispatch.id, actor);
      }
      return integrationsService.fetchMcxRates();
    },
    onSuccess: async (_result, connectorId) => {
      setFeedback({
        tone: "success",
        message: `${connectorDetails[connectorId].primaryAction} completed for ${connectorLabel(connectorId)}.`,
      });
      await invalidateHub();
    },
    onError: (error) => {
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "Sync failed." });
    },
  });

  const data = hubQuery.data;
  const connectors = data?.connectors ?? [];
  const filteredLogs =
    activeFilter === "all"
      ? data?.logs ?? []
      : (data?.logs ?? []).filter((log) => log.connectorId === activeFilter);

  if (!canView) {
    return (
      <StatePanel
        icon={LockKeyhole}
        title="Integrations are not available for this role"
        description="Switch to Owner or Accounts to monitor connector health and history."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="info" icon={CloudCog}>
                Fixed connector set
              </Pill>
              <span className="font-mono text-xs text-muted-foreground">4 connectors / no marketplace</span>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Integrations Hub</h1>
              <p className="text-sm text-muted-foreground">
                Monitor and configure the middleware links between Cable OS, accounting, CRM,
                compliance, and pricing.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={canEdit ? "success" : "neutral"} icon={canEdit ? Settings2 : LockKeyhole}>
              {canEdit ? "Owner editable" : "Accounts view-only"}
            </Pill>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => hubQuery.refetch()}
              disabled={hubQuery.isFetching}
            >
              <RefreshCw className={cn("mr-2 size-4", hubQuery.isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {feedback && (
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            toneClasses[feedback.tone],
          )}
        >
          <span>{feedback.message}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setFeedback(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {hubQuery.isLoading && <LoadingState />}

      {hubQuery.isError && (
        <StatePanel
          icon={CircleAlert}
          title="Integration data could not load"
          description={hubQuery.error instanceof Error ? hubQuery.error.message : "Retry the hub query."}
          action={
            <Button type="button" size="sm" onClick={() => hubQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {hubQuery.isSuccess && connectors.length === 0 && (
        <StatePanel
          icon={Unplug}
          title="No connectors configured"
          description="Cable OS expects exactly Zoho Books, CRM, E-way Bill, and MCX Index connectors."
        />
      )}

      {hubQuery.isSuccess && connectors.length > 0 && data && (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            {connectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                hubData={data}
                canEdit={canEdit}
                busy={testMutation.isPending || syncMutation.isPending}
                onConfigure={() => setSelectedConnector(connector)}
                onTest={() => testMutation.mutate(connector.id)}
                onSync={() => syncMutation.mutate(connector.id)}
              />
            ))}
          </section>

          <HistoryPanel
            logs={filteredLogs}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            allLogsCount={data.logs.length}
          />
        </>
      )}

      <ConfigSheet
        connector={selectedConnector}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) setSelectedConnector(null);
        }}
      />
    </div>
  );
}

function ConnectorCard({
  connector,
  hubData,
  canEdit,
  busy,
  onConfigure,
  onTest,
  onSync,
}: {
  connector: ConnectorMeta;
  hubData: HubData;
  canEdit: boolean;
  busy: boolean;
  onConfigure: () => void;
  onTest: () => void;
  onSync: () => void;
}) {
  const detail = connectorDetails[connector.id];
  const Icon = detail.icon;
  const healthTone = connector.health?.ok === false ? "danger" : statusTone[connector.status];
  const target = findSyncTarget(connector.id, hubData.store);
  const lastLog = latestLog(hubData.logs, connector.id);
  const syncDisabled =
    !canEdit ||
    busy ||
    (connector.id === "zoho-books" && !target) ||
    (connector.id === "eway-bill" && !target);

  return (
    <article className="flex min-h-full flex-col rounded-lg border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{connector.name}</h2>
              <Pill tone={statusTone[connector.status]}>{connector.status}</Pill>
            </div>
            <p className="text-sm text-muted-foreground">{detail.purpose}</p>
          </div>
        </div>
        <Pill tone="neutral">{connector.category}</Pill>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Metric label="Direction" value={directionLabel(connector.direction)} icon={connector.direction === "in" ? ArrowDownToLine : ArrowUpFromLine} />
        <Metric label="Last sync" value={formatTimestamp(connector.lastSyncAt)} mono />
        <Metric
          label="Health"
          value={connector.health?.message ?? "No health message"}
          icon={healthTone === "danger" ? CircleAlert : CheckCircle2}
          tone={healthTone}
        />
        <Metric label="Last log" value={lastLog ? lastLog.message : "No sync history yet"} />
      </div>

      <ConnectorSpecifics connector={connector} hubData={hubData} />

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t p-4">
        <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
          <Settings2 className="mr-2 size-4" />
          {canEdit ? "Configure" : "View config"}
        </Button>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onTest} disabled={busy}>
              <RefreshCw className="mr-2 size-4" />
              Test connection
            </Button>
            <Button type="button" size="sm" onClick={onSync} disabled={syncDisabled}>
              {detail.primaryAction}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function ConnectorSpecifics({ connector, hubData }: { connector: ConnectorMeta; hubData: HubData }) {
  if (connector.id === "zoho-books") {
    const lastInvoice = latestLog(hubData.logs, "zoho-books", "push");
    const pending = hubData.store.invoices.filter((invoice) => invoice.syncStatus !== "Synced to Zoho Books");
    return (
      <SpecificGrid>
        <Fact label="Pending invoices" value={String(pending.length)} />
        <Fact label="Last invoice synced" value={lastInvoice?.recordId ?? "None yet"} mono />
      </SpecificGrid>
    );
  }

  if (connector.id === "crm") {
    const linkedCustomers = hubData.store.customers.filter((customer) => Boolean(customer.crmId));
    return (
      <SpecificGrid>
        <Fact label="Linked customers" value={String(linkedCustomers.length)} />
        <Fact label="Field mapping" value="Read-only v1" />
      </SpecificGrid>
    );
  }

  if (connector.id === "eway-bill") {
    const generated = hubData.store.dispatches.filter((dispatch) => Boolean(dispatch.ewayBillNo));
    return (
      <SpecificGrid>
        <Fact label="Policy threshold" value={formatINR(hubData.store.policies.ewayThresholdInr)} mono />
        <Fact label="Recent EWBs" value={generated[0]?.ewayBillNo ?? "None generated"} mono />
      </SpecificGrid>
    );
  }

  return (
    <SpecificGrid>
      <Fact label="Aluminium" value={`${formatINR(hubData.rates.aluminium)} / kg`} mono />
      <Fact label="Copper" value={`${formatINR(hubData.rates.copper)} / kg`} mono />
      <Fact label="Rate timestamp" value={formatTimestamp(hubData.rates.at)} mono />
      <Fact label="Manual override" value="Owner-only fallback" />
    </SpecificGrid>
  );
}

function HistoryPanel({
  logs,
  activeFilter,
  onFilterChange,
  allLogsCount,
}: {
  logs: SyncLog[];
  activeFilter: ConnectorId | "all";
  onFilterChange: (filter: ConnectorId | "all") => void;
  allLogsCount: number;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Sync History</h2>
          <p className="text-sm text-muted-foreground">
            Connector tests, pushes, and pulls written by the integration services.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={activeFilter === "all"} onClick={() => onFilterChange("all")}>
            All {allLogsCount}
          </FilterButton>
          {fixedConnectorOrder.map((connectorId) => (
            <FilterButton
              key={connectorId}
              active={activeFilter === connectorId}
              onClick={() => onFilterChange(connectorId)}
            >
              {connectorLabel(connectorId)}
            </FilterButton>
          ))}
        </div>
      </div>

      {logs.length === 0 ? (
        <StatePanel
          compact
          icon={DatabaseZap}
          title="No sync rows for this filter"
          description="Run a test connection or connector action to add history."
        />
      ) : (
        <div className="portal-table-wrap">
          <div className="min-w-0">
            <div className="hidden grid-cols-6 gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Time</span>
              <span>Connector</span>
              <span>Action</span>
              <span>Record</span>
              <span>Status</span>
              <span>Message</span>
            </div>
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="grid min-w-0 grid-cols-1 gap-2 px-3 py-3 text-sm md:grid-cols-6 md:gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{formatTimestamp(log.at)}</span>
                  <span className="font-medium">{connectorLabel(log.connectorId)}</span>
                  <span className="font-mono text-xs">{log.action}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {log.recordType && log.recordId ? `${log.recordType}:${log.recordId}` : "None"}
                  </span>
                  <span>
                    <Pill tone={syncTone[log.status]}>{log.status}</Pill>
                  </span>
                  <span className="text-muted-foreground">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ConfigSheet({
  connector,
  canEdit,
  onOpenChange,
}: {
  connector: ConnectorMeta | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const entries = Object.entries(connector?.config ?? {});
  const detail = connector ? connectorDetails[connector.id] : null;

  return (
    <Sheet open={Boolean(connector)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{connector ? `${connector.name} configuration` : "Configuration"}</SheetTitle>
          <SheetDescription>
            {canEdit
              ? "Owner can edit masked connector settings. Secrets are never shown in full."
              : "Accounts can inspect connector configuration, but fields remain read-only."}
          </SheetDescription>
        </SheetHeader>

        {connector && detail && (
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="rounded-md border bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">{detail.configTitle}</p>
              <p className="mt-1 text-sm text-foreground">{connector.health?.message ?? "No health message"}</p>
            </div>

            <div className="grid gap-3">
              {entries.length === 0 ? (
                <StatePanel
                  compact
                  icon={Unplug}
                  title="No config fields"
                  description="This connector has no client-visible configuration."
                />
              ) : (
                entries.map(([key, value]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`${connector.id}-${key}`}>{key}</Label>
                    <Input
                      id={`${connector.id}-${key}`}
                      defaultValue={maskValue(value)}
                      readOnly={!canEdit}
                      disabled={!canEdit}
                      className="font-mono"
                    />
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-2 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Connector notes</p>
              {detail.specifics.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEdit && (
            <Button type="button" disabled>
              Save configuration
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {fixedConnectorOrder.map((id) => (
        <div key={id} className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="size-10 animate-pulse rounded-md bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-5 w-1/3 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatePanel({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-6 text-center shadow-sm", compact && "border-0 shadow-none")}>
      <div className="mx-auto flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="mx-auto mt-3 max-w-md space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

function SpecificGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 border-t bg-muted/40 p-4 sm:grid-cols-2">{children}</div>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-sm text-foreground", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  mono = false,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className={cn("size-4", toneTextClasses[tone])} />}
        <span>{label}</span>
      </div>
      <p className={cn("mt-2 line-clamp-2 text-sm text-foreground", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function Pill({
  tone = "neutral",
  icon: Icon,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

function connectorLabel(connectorId: ConnectorId) {
  if (connectorId === "zoho-books") return "Zoho Books";
  if (connectorId === "crm") return "CRM";
  if (connectorId === "eway-bill") return "E-way Bill";
  return "MCX Index";
}

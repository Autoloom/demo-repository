/*  Settings/admin screen handling organisation information, users, 
    roles, policies, permission overrides, forms, state boundaries,
    and administration UI. */

"use client";

import {
  AlertCircle,
  BadgeIndianRupee,
  Building2,
  Check,
  CheckCircle2,
  CircleSlash,
  Eye,
  FileKey2,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  Users,
  X,
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
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { formatINR } from "@/lib/domain/format";
import {
  dataService,
  settingsService,
  usersService,
  type OrgSettings,
  type PermissionKey,
  type Policies,
  type Role,
  type User,
} from "@/lib/services";
import { actorFromSession, useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

type SettingsTab = "organization" | "users" | "roles" | "policies";
type Feedback = { tone: "success" | "error" | "info"; message: string };
type UserMode = "edit" | "create";
type UserDraft = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  extraPermissions: PermissionKey[];
  deniedPermissions: PermissionKey[];
};

const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles & permissions", icon: ShieldCheck },
  { id: "policies", label: "Policies", icon: SlidersHorizontal },
];

const roles: Role[] = ["Owner", "Sales", "Operations", "Accounts"];
const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const permissionCatalog: PermissionKey[] = [
  "view:dashboard",
  "view:inquiry",
  "create:inquiry",
  "edit:inquiry",
  "transition:inquiry",
  "view:quote",
  "create:quote",
  "edit:quote",
  "transition:quote",
  "view:order",
  "edit:order",
  "transition:order",
  "view:jobcard",
  "edit:jobcard",
  "view:dispatch",
  "edit:dispatch",
  "view:invoice",
  "sync:invoice",
  "view:contact",
  "create:contact",
  "edit:contact",
  "view:compliance",
  "create:compliance",
  "edit:compliance",
  "transition:compliance",
  "approve:compliance",
  "view:approvals",
  "create:approvals",
  "approve:approvals",
  "view:integrations",
  "edit:integrations",
  "sync:integrations",
  "view:users",
  "edit:users",
  "view:settings",
  "edit:settings",
  "view:activity",
  "export:activity",
];

const rbacRows: Array<{
  resource: string;
  action: string;
  sales: AccessLevel;
  operations: AccessLevel;
  accounts: AccessLevel;
}> = [
  { resource: "inquiry", action: "view / create / edit / transition", sales: "full", operations: "none", accounts: "none" },
  { resource: "quote", action: "view", sales: "full", operations: "view", accounts: "none" },
  { resource: "quote", action: "create / edit", sales: "full", operations: "none", accounts: "none" },
  { resource: "quote", action: "transition to Approved", sales: "gated", operations: "none", accounts: "none" },
  { resource: "order", action: "view", sales: "view", operations: "full", accounts: "view" },
  { resource: "order", action: "transition", sales: "none", operations: "full", accounts: "gated" },
  { resource: "jobcard", action: "view / edit", sales: "none", operations: "full", accounts: "none" },
  { resource: "dispatch", action: "view", sales: "none", operations: "full", accounts: "view" },
  { resource: "dispatch", action: "edit checklist", sales: "none", operations: "full", accounts: "none" },
  { resource: "invoice", action: "view", sales: "none", operations: "view", accounts: "full" },
  { resource: "invoice", action: "sync to Zoho", sales: "none", operations: "none", accounts: "full" },
  { resource: "contact", action: "view", sales: "full", operations: "view", accounts: "view" },
  { resource: "contact", action: "create / edit", sales: "full", operations: "none", accounts: "none" },
  { resource: "compliance", action: "view", sales: "full", operations: "none", accounts: "view" },
  { resource: "compliance", action: "create / edit / transition", sales: "full", operations: "none", accounts: "none" },
  { resource: "compliance", action: "approve EMD/BG", sales: "none", operations: "none", accounts: "none" },
  { resource: "approvals", action: "view own / create", sales: "full", operations: "full", accounts: "full" },
  { resource: "approvals", action: "approve / reject", sales: "none", operations: "none", accounts: "none" },
  { resource: "integrations", action: "view", sales: "none", operations: "none", accounts: "view" },
  { resource: "integrations", action: "edit / connect", sales: "none", operations: "none", accounts: "none" },
  { resource: "users / settings", action: "all actions", sales: "none", operations: "none", accounts: "none" },
];

type AccessLevel = "full" | "view" | "gated" | "none";

const emptyUserDraft: UserDraft = {
  id: "",
  name: "",
  email: "",
  role: "Sales",
  active: true,
  extraPermissions: [],
  deniedPermissions: [],
};

function SettingsProvider() {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsPageContent />
    </QueryClientProvider>
  );
}

export default SettingsProvider;

function SettingsPageContent() {
  const queryClient = useQueryClient();
  const role = useSessionStore((state) => state.role);
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("organization");
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const [orgDraft, setOrgDraft] = React.useState<OrgSettings | null>(null);
  const [policyDraft, setPolicyDraft] = React.useState<Policies | null>(null);
  const [userSheet, setUserSheet] = React.useState<{ mode: UserMode; draft: UserDraft } | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["settings-admin"],
    queryFn: async () => {
      const [org, policies, users, store] = await Promise.all([
        settingsService.getOrg(),
        settingsService.getPolicies(),
        usersService.list(),
        dataService.read(),
      ]);

      return {
        org,
        policies,
        users,
        auditCount: store.activity.length,
        integrationCount: store.integrations.length,
      };
    },
  });

  const isOwner = role === "Owner";
  const effectiveOrg = orgDraft ?? settingsQuery.data?.org ?? null;
  const effectivePolicies = policyDraft ?? settingsQuery.data?.policies ?? null;

  const saveOrgMutation = useMutation({
    mutationFn: async () => {
      const nextOrg = effectiveOrg;
      if (!nextOrg) throw new Error("Organization settings are not loaded.");
      validateOrg(nextOrg);
      return settingsService.updateOrg(
        {
          ...nextOrg,
          gstin: nextOrg.gstin.toUpperCase().trim(),
          homeStateCode: nextOrg.gstin.slice(0, 2),
        },
        actorFromSession(),
      );
    },
    onSuccess: async (savedOrg) => {
      setOrgDraft(savedOrg);
      setFeedback({ tone: "success", message: "Organization settings saved." });
      await queryClient.invalidateQueries({ queryKey: ["settings-admin"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: messageFromError(error) }),
  });

  const savePoliciesMutation = useMutation({
    mutationFn: async () => {
      const nextPolicies = effectivePolicies;
      if (!nextPolicies) throw new Error("Policies are not loaded.");
      validatePolicies(nextPolicies);
      return settingsService.updatePolicies(nextPolicies, actorFromSession());
    },
    onSuccess: async (savedPolicies) => {
      setPolicyDraft(savedPolicies);
      setFeedback({ tone: "success", message: "Workflow policies saved." });
      await queryClient.invalidateQueries({ queryKey: ["settings-admin"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: messageFromError(error) }),
  });

  const saveUserMutation = useMutation({
    mutationFn: async (draft: UserDraft) => {
      if (userSheet?.mode === "create") {
        throw new Error("Add user is waiting on usersService.create in this scaffold.");
      }
      validateUserDraft(draft);
      return usersService.update(
        draft.id,
        {
          name: draft.name.trim(),
          email: draft.email.trim(),
          role: draft.role,
          active: draft.active,
          extraPermissions: draft.extraPermissions,
          deniedPermissions: draft.deniedPermissions,
        },
        actorFromSession(),
      );
    },
    onSuccess: async (savedUser) => {
      setFeedback({ tone: "success", message: `${savedUser.name} was updated.` });
      setUserSheet(null);
      await queryClient.invalidateQueries({ queryKey: ["settings-admin"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: messageFromError(error) }),
  });

  const content = settingsQuery.data;

  return (
    <section className="flex flex-col gap-6">
      <header className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="highlight" icon={Settings2}>
                Owner control center
              </Pill>
              <Pill tone={isOwner ? "success" : "warning"} icon={isOwner ? ShieldCheck : ShieldQuestion}>
                {role ? `${role} session` : "Owner demo"}
              </Pill>
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Settings & Admin</h1>
              <p className="text-sm text-muted-foreground">
                Organization defaults, user access, fixed RBAC, and workflow policies for Cable OS.
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground xl:min-w-64">
            <div className="rounded-md border bg-background p-3">
              <span className="font-medium text-foreground">Access note: </span>
              Owner-only by RBAC. If the current role is not hydrated yet, this page renders the
              Owner-oriented admin demo while the shell guard resolves access.
            </div>
            {content && (
              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Audit events" value={content.auditCount} />
                <StatTile label="Connectors" value={content.integrationCount} />
              </div>
            )}
          </div>
        </div>
      </header>

      {feedback && (
        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Settings sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              type="button"
              variant={activeTab === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="mr-2 size-4" />
              {tab.label}
            </Button>
          );
        })}
      </nav>

      <DataBoundary
        isLoading={settingsQuery.isLoading}
        isError={settingsQuery.isError}
        errorTitle="Settings could not load"
        errorDescription={messageFromError(settingsQuery.error)}
        onRetry={() => settingsQuery.refetch()}
      >
        {content && effectiveOrg && effectivePolicies && (
          <>
            {activeTab === "organization" && (
              <OrganizationPanel
                org={effectiveOrg}
                disabled={!isOwner || saveOrgMutation.isPending}
                saving={saveOrgMutation.isPending}
                onChange={setOrgDraft}
                onSave={() => saveOrgMutation.mutate()}
              />
            )}

            {activeTab === "users" && (
              <UsersPanel
                users={content.users}
                isOwner={isOwner}
                savingUserId={saveUserMutation.variables?.id}
                isSavingUser={saveUserMutation.isPending}
                onAdd={() => setUserSheet({ mode: "create", draft: emptyUserDraft })}
                onEdit={(selectedUser) => setUserSheet({ mode: "edit", draft: draftFromUser(selectedUser) })}
                onDeactivate={(selectedUser) => {
                  saveUserMutation.mutate({
                    ...draftFromUser(selectedUser),
                    active: false,
                  });
                }}
              />
            )}

            {activeTab === "roles" && <RolesPanel users={content.users} />}

            {activeTab === "policies" && (
              <PoliciesPanel
                policies={effectivePolicies}
                disabled={!isOwner || savePoliciesMutation.isPending}
                saving={savePoliciesMutation.isPending}
                onChange={setPolicyDraft}
                onSave={() => savePoliciesMutation.mutate()}
              />
            )}
          </>
        )}
      </DataBoundary>

      <UserSheet
        state={userSheet}
        isOwner={isOwner}
        saving={saveUserMutation.isPending}
        onClose={() => setUserSheet(null)}
        onChange={(draft) => setUserSheet((current) => (current ? { ...current, draft } : current))}
        onSave={(draft) => saveUserMutation.mutate(draft)}
      />
    </section>
  );
}

function OrganizationPanel({
  org,
  disabled,
  saving,
  onChange,
  onSave,
}: {
  org: OrgSettings;
  disabled: boolean;
  saving: boolean;
  onChange: (org: OrgSettings) => void;
  onSave: () => void;
}) {
  const derivedStateCode = org.gstin.trim().slice(0, 2) || org.homeStateCode;

  return (
    <Panel
      title="Organization"
      description="Home GSTIN drives state-code logic for future IGST versus CGST/SGST treatment."
      icon={Building2}
      action={
        <Button type="button" size="sm" disabled={disabled} onClick={onSave}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save org
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Company name" htmlFor="companyName">
          <Input
            id="companyName"
            value={org.companyName}
            disabled={disabled}
            onChange={(event) => onChange({ ...org, companyName: event.target.value })}
          />
        </Field>
        <Field label="Home GSTIN" htmlFor="gstin" hint="Machine data stays mono across the app.">
          <Input
            id="gstin"
            className="font-mono"
            value={org.gstin}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...org,
                gstin: event.target.value.toUpperCase(),
                homeStateCode: event.target.value.slice(0, 2),
              })
            }
          />
        </Field>
        <Field label="Home state code" htmlFor="homeStateCode">
          <Input
            id="homeStateCode"
            className="font-mono"
            value={derivedStateCode}
            disabled
            readOnly
          />
        </Field>
        <Field label="Timezone" htmlFor="timezone">
          <Input
            id="timezone"
            className="font-mono"
            value={org.timezone}
            disabled={disabled}
            onChange={(event) => onChange({ ...org, timezone: event.target.value })}
          />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Registered address" htmlFor="address">
            <Input
              id="address"
              value={org.address}
              disabled={disabled}
              onChange={(event) => onChange({ ...org, address: event.target.value })}
            />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-3">
            <PolicyFact label="Branding" value="Token controlled" icon={FileKey2} />
            <PolicyFact label="Pinned today" value="Demo clock" icon={CheckCircle2} />
            <PolicyFact label="State source" value={`GSTIN ${derivedStateCode}`} icon={BadgeIndianRupee} mono />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function UsersPanel({
  users,
  isOwner,
  isSavingUser,
  savingUserId,
  onAdd,
  onEdit,
  onDeactivate,
}: {
  users: User[];
  isOwner: boolean;
  isSavingUser: boolean;
  savingUserId?: string;
  onAdd: () => void;
  onEdit: (user: User) => void;
  onDeactivate: (user: User) => void;
}) {
  return (
    <Panel
      title="Users"
      description="Role assignments and per-user extra or denied permissions."
      icon={Users}
      action={
        <Button type="button" size="sm" disabled={!isOwner} onClick={onAdd}>
          <Plus className="mr-2 size-4" />
          Add user
        </Button>
      }
    >
      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Users created through the service layer will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-12 gap-3 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            <span className="col-span-4">User</span>
            <span className="col-span-2">Role</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-2">Overrides</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>
          <div className="divide-y divide-border">
            {users.map((item) => {
              const overrideCount =
                (item.extraPermissions?.length ?? 0) + (item.deniedPermissions?.length ?? 0);
              const savingThisUser = isSavingUser && savingUserId === item.id;

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 gap-3 px-3 py-3 text-sm lg:grid-cols-12 lg:items-center"
                >
                  <div className="lg:col-span-4">
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{item.email}</p>
                  </div>
                  <div className="lg:col-span-2">
                    <Pill tone="neutral">{item.role}</Pill>
                  </div>
                  <div className="lg:col-span-2">
                    <Pill tone={item.active ? "success" : "danger"}>
                      {item.active ? "Active" : "Inactive"}
                    </Pill>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground lg:col-span-2">
                    {overrideCount} configured
                  </div>
                  <div className="flex justify-start gap-2 lg:col-span-2 lg:justify-end">
                    <Button type="button" variant="outline" size="sm" disabled={!isOwner} onClick={() => onEdit(item)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!isOwner || !item.active || savingThisUser}
                      onClick={() => onDeactivate(item)}
                    >
                      {savingThisUser ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <CircleSlash className="mr-2 size-4" />
                      )}
                      Deactivate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function RolesPanel({ users }: { users: User[] }) {
  const usersByRole = roles.map((role) => ({
    role,
    count: users.filter((user) => user.role === role && user.active).length,
  }));

  return (
    <Panel
      title="Roles & permissions"
      description="Fixed v1 role model. Owner passes every check and resolves approval queues."
      icon={ShieldCheck}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        {usersByRole.map((item) => (
          <div key={item.role} className="rounded-md border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <Pill tone={item.role === "Owner" ? "highlight" : "neutral"}>{item.role}</Pill>
              <span className="font-mono text-lg font-semibold">{item.count}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Active users</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-12 gap-3 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="col-span-3">Resource</span>
          <span className="col-span-3">Action</span>
          <span className="col-span-1 text-center">Owner</span>
          <span className="col-span-1 text-center">Sales</span>
          <span className="col-span-2 text-center">Operations</span>
          <span className="col-span-2 text-center">Accounts</span>
        </div>
        <div className="divide-y divide-border">
          {rbacRows.map((row) => (
            <div key={`${row.resource}-${row.action}`} className="grid grid-cols-1 gap-3 px-3 py-3 text-sm lg:grid-cols-12 lg:items-center">
              <span className="font-mono text-xs text-foreground lg:col-span-3">{row.resource}</span>
              <span className="text-muted-foreground lg:col-span-3">{row.action}</span>
              <div className="lg:col-span-1 lg:text-center">
                <AccessBadge level="full" />
              </div>
              <div className="lg:col-span-1 lg:text-center">
                <AccessBadge level={row.sales} />
              </div>
              <div className="lg:col-span-2 lg:text-center">
                <AccessBadge level={row.operations} />
              </div>
              <div className="lg:col-span-2 lg:text-center">
                <AccessBadge level={row.accounts} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PoliciesPanel({
  policies,
  disabled,
  saving,
  onChange,
  onSave,
}: {
  policies: Policies;
  disabled: boolean;
  saving: boolean;
  onChange: (policies: Policies) => void;
  onSave: () => void;
}) {
  return (
    <Panel
      title="Policies"
      description="Governance defaults feed margin gates, e-way requirements, GST, and dispatch holds."
      icon={SlidersHorizontal}
      action={
        <Button type="button" size="sm" disabled={disabled} onClick={onSave}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save policies
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Margin-review threshold" htmlFor="marginThresholdPct" hint="Quotes below this need Owner approval.">
          <Input
            id="marginThresholdPct"
            type="number"
            value={policies.marginThresholdPct}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...policies, marginThresholdPct: Number(event.target.value) })
            }
          />
        </Field>
        <Field label="E-way threshold" htmlFor="ewayThresholdInr" hint="Dispatch checklist requires e-way above this value.">
          <Input
            id="ewayThresholdInr"
            type="number"
            value={policies.ewayThresholdInr}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...policies, ewayThresholdInr: Number(event.target.value) })
            }
          />
        </Field>
        <Field label="Default GST rate" htmlFor="gstRatePct" hint="Applied to new quote and invoice calculations.">
          <Input
            id="gstRatePct"
            type="number"
            value={policies.gstRatePct}
            disabled={disabled}
            onChange={(event) => onChange({ ...policies, gstRatePct: Number(event.target.value) })}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SegmentCard
          title="Credit-limit enforcement"
          description="Non-Owner actions that exceed credit limits create a credit override request."
          enabled={policies.creditLimitEnforced}
          disabled={disabled}
          onToggle={() =>
            onChange({ ...policies, creditLimitEnforced: !policies.creditLimitEnforced })
          }
        />
        <div className="rounded-md border bg-background p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Dispatch hold mode</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Soft warn raises approval. Hard block prevents physical dispatch.
              </p>
            </div>
            <div className="flex gap-2">
              {(["soft", "hard"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={policies.dispatchHoldMode === mode ? "default" : "outline"}
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange({ ...policies, dispatchHoldMode: mode })}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-3">
        <PolicyFact label="Margin gate" value={`${policies.marginThresholdPct}%`} icon={ShieldCheck} mono />
        <PolicyFact label="E-way gate" value={formatINR(policies.ewayThresholdInr)} icon={BadgeIndianRupee} mono />
        <PolicyFact label="Dispatch hold" value={policies.dispatchHoldMode} icon={LockKeyhole} />
      </div>
    </Panel>
  );
}

function UserSheet({
  state,
  isOwner,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  state: { mode: UserMode; draft: UserDraft } | null;
  isOwner: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: (draft: UserDraft) => void;
  onSave: (draft: UserDraft) => void;
}) {
  const draft = state?.draft;
  const mode = state?.mode ?? "edit";

  return (
    <Sheet open={Boolean(state)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "Add user" : "Edit user"}</SheetTitle>
          <SheetDescription>
            Assign one of the fixed roles, then add per-user extra or denied permission overrides.
          </SheetDescription>
        </SheetHeader>

        {draft && (
          <div className="flex flex-col gap-6 py-6">
            {mode === "create" && (
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                This scaffold exposes usersService.list and usersService.update only. The form is
                ready, but creating a new user needs usersService.create.
              </div>
            )}

            <div className="grid gap-4">
              <Field label="Name" htmlFor="userName">
                <Input
                  id="userName"
                  value={draft.name}
                  disabled={!isOwner || saving}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="userEmail">
                <Input
                  id="userEmail"
                  className="font-mono"
                  value={draft.email}
                  disabled={!isOwner || saving}
                  onChange={(event) => onChange({ ...draft, email: event.target.value })}
                />
              </Field>
              <div className="grid gap-2">
                <Label>Role</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant={draft.role === role ? "default" : "outline"}
                      size="sm"
                      disabled={!isOwner || saving}
                      onClick={() => onChange({ ...draft, role })}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
              </div>
              <SegmentCard
                title="Active account"
                description="Inactive users are removed from the usable role switcher in the mock."
                enabled={draft.active}
                disabled={!isOwner || saving}
                onToggle={() => onChange({ ...draft, active: !draft.active })}
              />
            </div>

            <div className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold">Permission overrides</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Extra permissions grant above the role default. Denied permissions remove a default grant.
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                {permissionCatalog.map((permission) => (
                  <PermissionOverrideRow
                    key={permission}
                    permission={permission}
                    role={draft.role}
                    extraPermissions={draft.extraPermissions}
                    deniedPermissions={draft.deniedPermissions}
                    disabled={!isOwner || saving}
                    onChange={(nextExtra, nextDenied) =>
                      onChange({ ...draft, extraPermissions: nextExtra, deniedPermissions: nextDenied })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <SheetFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => draft && onSave(draft)} disabled={!isOwner || saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Save user
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PermissionOverrideRow({
  permission,
  role,
  extraPermissions,
  deniedPermissions,
  disabled,
  onChange,
}: {
  permission: PermissionKey;
  role: Role;
  extraPermissions: PermissionKey[];
  deniedPermissions: PermissionKey[];
  disabled: boolean;
  onChange: (extra: PermissionKey[], denied: PermissionKey[]) => void;
}) {
  const defaultAllowed = hasDefaultPermission(role, permission);
  const extra = extraPermissions.includes(permission);
  const denied = deniedPermissions.includes(permission);

  return (
    <div className="grid grid-cols-1 gap-3 border-b px-3 py-3 text-sm last:border-b-0 md:grid-cols-12 md:items-center">
      <div className="md:col-span-5">
        <p className="font-mono text-xs text-foreground">{permission}</p>
        <p className="text-xs text-muted-foreground">
          Default: {defaultAllowed ? "allowed" : "denied"} for {role}
        </p>
      </div>
      <div className="md:col-span-2">
        <Pill tone={defaultAllowed ? "success" : "neutral"}>
          {defaultAllowed ? "Role grant" : "No grant"}
        </Pill>
      </div>
      <div className="flex gap-2 md:col-span-5 md:justify-end">
        <Button
          type="button"
          size="sm"
          variant={extra ? "default" : "outline"}
          disabled={disabled || denied}
          onClick={() =>
            onChange(togglePermission(extraPermissions, permission), withoutPermission(deniedPermissions, permission))
          }
        >
          Extra
        </Button>
        <Button
          type="button"
          size="sm"
          variant={denied ? "default" : "outline"}
          disabled={disabled || extra}
          onClick={() =>
            onChange(withoutPermission(extraPermissions, permission), togglePermission(deniedPermissions, permission))
          }
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md border bg-background p-2">
            <Icon className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DataBoundary({
  isLoading,
  isError,
  errorTitle,
  errorDescription,
  onRetry,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorTitle: string;
  errorDescription: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-4 h-8 rounded-md bg-muted" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-24 rounded-md bg-muted" />
            <div className="h-24 rounded-md bg-muted" />
            <div className="h-24 rounded-md bg-muted" />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="h-48 rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={errorTitle}
        description={errorDescription}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex size-12 items-center justify-center rounded-md border bg-background">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: Feedback;
  onDismiss: () => void;
}) {
  const toneClass =
    feedback.tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : feedback.tone === "error"
        ? "border-danger/30 bg-danger/10 text-danger"
        : "border-info/30 bg-info/10 text-info";
  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "error" ? AlertCircle : ShieldQuestion;

  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-md border p-3 text-sm", toneClass)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-1 size-4" />
        <span>{feedback.message}</span>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function Pill({
  tone = "neutral",
  icon: Icon,
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "highlight";
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const toneClass = {
    neutral: "border-border bg-muted text-muted-foreground",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    danger: "border-danger/30 bg-danger/10 text-danger",
    info: "border-info/30 bg-info/10 text-info",
    highlight: "border-highlight/30 bg-highlight/10 text-highlight",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-medium", toneClass)}>
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

function AccessBadge({ level }: { level: AccessLevel }) {
  const map: Record<AccessLevel, { label: string; tone: "success" | "warning" | "neutral" | "danger" | "info"; icon: LucideIcon }> = {
    full: { label: "Full", tone: "success", icon: Check },
    view: { label: "View", tone: "info", icon: Eye },
    gated: { label: "Gated", tone: "warning", icon: LockKeyhole },
    none: { label: "Denied", tone: "neutral", icon: X },
  };
  const config = map[level];

  return (
    <Pill tone={config.tone} icon={config.icon}>
      {config.label}
    </Pill>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function PolicyFact({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-md border bg-card p-2">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium text-foreground", mono && "font-mono")}>{value}</p>
      </div>
    </div>
  );
}

function SegmentCard({
  title,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant={enabled ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          onClick={onToggle}
        >
          {enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>
    </div>
  );
}

function draftFromUser(user: User): UserDraft {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    extraPermissions: user.extraPermissions ?? [],
    deniedPermissions: user.deniedPermissions ?? [],
  };
}

function hasDefaultPermission(role: Role, permission: PermissionKey) {
  if (role === "Owner") return true;
  return ROLE_PERMISSIONS[role].has(permission);
}

function togglePermission(permissions: PermissionKey[], permission: PermissionKey) {
  return permissions.includes(permission)
    ? permissions.filter((item) => item !== permission)
    : [...permissions, permission];
}

function withoutPermission(permissions: PermissionKey[], permission: PermissionKey) {
  return permissions.filter((item) => item !== permission);
}

function validateOrg(org: OrgSettings) {
  if (!org.companyName.trim()) throw new Error("Company name is required.");
  if (!gstinPattern.test(org.gstin.toUpperCase().trim())) throw new Error("Enter a valid GSTIN.");
  if (!org.address.trim()) throw new Error("Registered address is required.");
  if (!org.timezone.trim()) throw new Error("Timezone is required.");
}

function validatePolicies(policies: Policies) {
  if (policies.marginThresholdPct < 0 || policies.marginThresholdPct > 100) {
    throw new Error("Margin threshold must be between 0 and 100.");
  }
  if (policies.ewayThresholdInr < 0) throw new Error("E-way threshold cannot be negative.");
  if (policies.gstRatePct < 0 || policies.gstRatePct > 28) {
    throw new Error("GST rate must be between 0 and 28.");
  }
}

function validateUserDraft(draft: UserDraft) {
  if (!draft.name.trim()) throw new Error("User name is required.");
  if (!draft.email.trim() || !draft.email.includes("@")) throw new Error("Enter a valid email.");
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

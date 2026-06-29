"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CloudDownload,
  FileText,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { now } from "@/lib/domain/clock";
import { formatDate, formatINR } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

type Role = "Owner" | "Sales" | "Operations" | "Accounts";
type CustomerSegment =
  | "EPC contractor"
  | "Civil contractor"
  | "Solar installer"
  | "Utility distributor"
  | "OEM"
  | "Government/PSU"
  | "Trader/Dealer";

type Feedback = { tone: "success" | "error" | "info"; message: string };

interface Customer {
  id: string;
  name: string;
  segment: CustomerSegment;
  contactName: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress?: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  stateCode: string;
  paymentTerms: string;
  creditLimitInr: number;
  creditUsedInr?: number;
  msmeRegistered?: boolean;
  crmId?: string;
  createdAt: string;
}

const storageKey = "cableos2:v1:contacts";
const roles: Role[] = ["Owner", "Sales", "Operations", "Accounts"];
const segments = [
  "EPC contractor",
  "Civil contractor",
  "Solar installer",
  "Utility distributor",
  "OEM",
  "Government/PSU",
  "Trader/Dealer",
] as const satisfies readonly CustomerSegment[];
const visibleSegments: Array<"All" | CustomerSegment> = ["All", "EPC contractor", "Solar installer", "Utility distributor", "OEM"];
const gstinPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const stateNames: Record<string, string> = {
  "07": "Delhi",
  "24": "Gujarat",
  "27": "Maharashtra",
  "33": "Tamil Nadu",
};

const customerSchema = z.object({
  name: z.string().min(2, "Customer name is required"),
  segment: z.enum(segments),
  contactName: z.string().min(2, "Contact name is required"),
  phone: z.string().min(10, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  billingAddress: z.string().min(8, "Billing address is required"),
  shippingAddress: z.string().optional(),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid pincode"),
  gstin: z.string().transform((value) => value.toUpperCase().trim()).refine((value) => gstinPattern.test(value), "Enter a valid GSTIN"),
  paymentTerms: z.string().min(3, "Payment terms are required"),
  creditLimitInr: z.coerce.number().min(0, "Credit limit cannot be negative"),
  msmeRegistered: z.boolean(),
});

type CustomerFormInput = z.input<typeof customerSchema>;
type CustomerFormValues = z.output<typeof customerSchema>;

const seedCustomers: Customer[] = [
  {
    id: "CUS-2606-001",
    name: "Aarav Infra Projects",
    segment: "EPC contractor",
    contactName: "Meera Nair",
    phone: "+91 98765 21045",
    email: "meera@aaravinfra.example",
    billingAddress: "Plot 14, Industrial Area, Okhla Phase II",
    shippingAddress: "Site Store, Dwarka Expressway Package 3",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110020",
    gstin: "07AARCA4521K1Z5",
    stateCode: "07",
    paymentTerms: "30 days from invoice",
    creditLimitInr: 3200000,
    creditUsedInr: 1850000,
    crmId: "CRM-CUS-4219",
    createdAt: "2026-06-01",
  },
  {
    id: "CUS-2606-002",
    name: "Suryaline Solar EPC",
    segment: "Solar installer",
    contactName: "Rahul Shah",
    phone: "+91 98200 11440",
    email: "procurement@suryaline.example",
    billingAddress: "B-802, Sun Plaza, SG Highway",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380054",
    gstin: "24SURYA7312M1Z2",
    stateCode: "24",
    paymentTerms: "50% advance, balance before dispatch",
    creditLimitInr: 1800000,
    creditUsedInr: 2100000,
    msmeRegistered: true,
    createdAt: "2026-06-03",
  },
  {
    id: "CUS-2606-003",
    name: "Dakshin Utility Stores",
    segment: "Utility distributor",
    contactName: "Nandini Rao",
    phone: "+91 94444 33221",
    email: "nandini@dakshinutility.example",
    billingAddress: "No. 22, SIDCO Industrial Estate",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600032",
    gstin: "33DAKSH5924Q1Z7",
    stateCode: "33",
    paymentTerms: "45 days from GRN",
    creditLimitInr: 4500000,
    creditUsedInr: 1250000,
    crmId: "CRM-CUS-1098",
    createdAt: "2026-06-05",
  },
];

const crmCustomers: Customer[] = [
  {
    id: "CRM-TMP-001",
    name: "Western Grid Contractors",
    segment: "Civil contractor",
    contactName: "Karan Bedi",
    phone: "+91 99887 33441",
    email: "karan@westerngrid.example",
    billingAddress: "Gala 6, MIDC Andheri East",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400093",
    gstin: "27WESTG8147P1Z8",
    stateCode: "27",
    paymentTerms: "30 days from invoice",
    creditLimitInr: 2400000,
    creditUsedInr: 0,
    msmeRegistered: true,
    crmId: "CRM-CUS-7721",
    createdAt: "2026-06-18",
  },
  { ...seedCustomers[0] },
];

function can(role: Role, action: "view" | "create" | "edit", resource: "contact" | "integrations") {
  if (role === "Owner") return true;
  if (resource === "contact" && action === "view") return true;
  if (resource === "contact" && (action === "create" || action === "edit")) return role === "Sales";
  return false;
}

function deriveStateCode(gstin: string) {
  return gstin.slice(0, 2);
}

function stateFromGstin(gstin: string) {
  const stateCode = deriveStateCode(gstin);
  return `${stateCode} · ${stateNames[stateCode] ?? "Unknown state"}`;
}

function readCustomers(): Customer[] {
  if (typeof window === "undefined") return seedCustomers;
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    window.localStorage.setItem(storageKey, JSON.stringify(seedCustomers));
    return seedCustomers;
  }
  return JSON.parse(stored) as Customer[];
}

function writeCustomers(customers: Customer[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(customers));
}

function pause() {
  return new Promise((resolve) => window.setTimeout(resolve, 180));
}

function dateIdFragment() {
  const pinned = now();
  return `${String(pinned.getFullYear()).slice(2)}${String(pinned.getMonth() + 1).padStart(2, "0")}`;
}

function nextCustomerId(customers: Customer[]) {
  const next =
    customers
      .map((customer) => Number(customer.id.split("-").at(-1)))
      .filter(Number.isFinite)
      .reduce((highest, value) => Math.max(highest, value), 0) + 1;
  return `CUS-${dateIdFragment()}-${String(next).padStart(3, "0")}`;
}

function toCustomer(values: CustomerFormValues): Omit<Customer, "id" | "createdAt"> {
  const gstin = values.gstin.toUpperCase().trim();
  return {
    ...values,
    gstin,
    stateCode: deriveStateCode(gstin),
    shippingAddress: values.shippingAddress?.trim() || undefined,
    creditUsedInr: 0,
  };
}

const contactsService = {
  async list(query: { search: string; segment: "All" | CustomerSegment }) {
    await pause();
    const term = query.search.trim().toLowerCase();
    return readCustomers()
      .filter((customer) => query.segment === "All" || customer.segment === query.segment)
      .filter((customer) =>
        term
          ? [customer.name, customer.contactName, customer.email, customer.city, customer.state, customer.gstin].join(" ").toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async create(values: CustomerFormValues, role: Role): Promise<Customer> {
    await pause();
    if (!can(role, "create", "contact")) throw new Error("Your role can view contacts, but cannot create them.");
    const customers = readCustomers();
    const customerDraft = toCustomer(values);
    if (customers.some((customer) => customer.gstin === customerDraft.gstin)) throw new Error("A customer with this GSTIN already exists.");
    const customer: Customer = { ...customerDraft, id: nextCustomerId(customers), createdAt: now().toISOString().slice(0, 10) };
    writeCustomers([customer, ...customers]);
    return customer;
  },
  async update(id: string, values: CustomerFormValues, role: Role): Promise<Customer> {
    await pause();
    if (!can(role, "edit", "contact")) throw new Error("Your role can view contacts, but cannot edit them.");
    const customers = readCustomers();
    const customerDraft = toCustomer(values);
    if (customers.some((customer) => customer.id !== id && customer.gstin === customerDraft.gstin)) throw new Error("A different customer already uses this GSTIN.");
    const existing = customers.find((customer) => customer.id === id);
    if (!existing) throw new Error("Customer not found.");
    const updated: Customer = { ...existing, ...customerDraft, creditUsedInr: existing.creditUsedInr, crmId: existing.crmId };
    const nextCustomers = customers.map((customer) => {
      if (customer.id !== id) return customer;
      return updated;
    });
    writeCustomers(nextCustomers);
    return updated;
  },
  async creditUsage(id: string) {
    await pause();
    const customer = readCustomers().find((item) => item.id === id);
    if (!customer) throw new Error("Customer not found.");
    return { used: customer.creditUsedInr ?? 0, limit: customer.creditLimitInr };
  },
};

const integrationsService = {
  async importFromCrm(role: Role) {
    await pause();
    if (!can(role, "edit", "integrations")) throw new Error("CRM import requires integrations access.");
    const customers = readCustomers();
    const byGstin = new Map(customers.map((customer) => [customer.gstin, customer]));
    const nextCustomers = [...customers];
    const imported: Customer[] = [];
    let linked = 0;
    for (const crmCustomer of crmCustomers) {
      const existing = byGstin.get(crmCustomer.gstin);
      if (existing) {
        if (!existing.crmId && crmCustomer.crmId) {
          existing.crmId = crmCustomer.crmId;
          linked += 1;
        }
        continue;
      }
      const importedCustomer = { ...crmCustomer, id: nextCustomerId(nextCustomers), createdAt: now().toISOString().slice(0, 10) };
      imported.push(importedCustomer);
      nextCustomers.push(importedCustomer);
    }
    writeCustomers(nextCustomers);
    return { imported, linked };
  },
};

function ContactsPageContent() {
  const queryClient = useQueryClient();
  const [role, setRole] = React.useState<Role>("Sales");
  const [search, setSearch] = React.useState("");
  const [segment, setSegment] = React.useState<"All" | CustomerSegment>("All");
  const [selected, setSelected] = React.useState<Customer | null>(null);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);

  const customersQuery = useQuery({
    queryKey: ["contacts", search, segment],
    queryFn: () => contactsService.list({ search, segment }),
  });

  const createMutation = useMutation({
    mutationFn: (values: CustomerFormValues) => contactsService.create(values, role),
    onSuccess: async (customer) => {
      setFeedback({ tone: "success", message: `${customer.name} was added to contacts.` });
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Could not create customer." }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CustomerFormValues }) => contactsService.update(id, values, role),
    onSuccess: async (customer) => {
      setFeedback({ tone: "success", message: `${customer.name} was updated.` });
      setSelected(customer);
      setEditing(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Could not update customer." }),
  });

  const importMutation = useMutation({
    mutationFn: () => integrationsService.importFromCrm(role),
    onSuccess: async (result) => {
      setFeedback({ tone: "success", message: `CRM import added ${result.imported.length} customer(s) and linked ${result.linked}.` });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error) => setFeedback({ tone: "error", message: error instanceof Error ? error.message : "CRM import failed." }),
  });

  const customers = customersQuery.data ?? [];
  const canCreate = can(role, "create", "contact");
  const canEdit = can(role, "edit", "contact");
  const canImport = can(role, "edit", "contact") && can(role, "view", "integrations");

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background p-6 text-foreground">
      <section className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" aria-hidden="true" />
            <span>Sales · Customer truth</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Customer directory for quotes, inquiries, GSTIN tax state, credit exposure, and CRM linkage.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <RolePreview role={role} onChange={setRole} />
          {canImport ? (
            <Button type="button" variant="outline" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>
              {importMutation.isPending ? <RefreshCw className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <CloudDownload className="mr-2 size-4" aria-hidden="true" />}
              Import from CRM
            </Button>
          ) : null}
          {canCreate ? (
            <Button type="button" onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Add customer
            </Button>
          ) : null}
        </div>
      </section>

      {feedback ? <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} /> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Customers" value={String(customers.length)} />
        <MetricCard label="CRM linked" value={String(customers.filter((customer) => customer.crmId).length)} />
        <MetricCard label="MSME" value={String(customers.filter((customer) => customer.msmeRegistered).length)} />
        <MetricCard label="Over limit" value={String(customers.filter((customer) => creditRatio(customer) > 1).length)} tone="danger" />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input aria-label="Search contacts" className="pl-9" placeholder="Search name, contact, city, GSTIN" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <SegmentFilter value={segment} onChange={setSegment} />
        </div>
        {customersQuery.isLoading ? (
          <ContactsSkeleton />
        ) : customersQuery.isError ? (
          <ErrorState onRetry={() => void customersQuery.refetch()} />
        ) : customers.length === 0 ? (
          <EmptyState canCreate={canCreate} onAdd={() => setFormOpen(true)} canImport={canImport} onImport={() => importMutation.mutate()} />
        ) : (
          <ContactsTable
            customers={customers}
            canEdit={canEdit}
            onOpen={setSelected}
            onEdit={(customer) => {
              setEditing(customer);
              setFormOpen(true);
            }}
          />
        )}
      </section>

      <CustomerDetailSheet
        customer={selected}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onEdit={(customer) => {
          setEditing(customer);
          setFormOpen(true);
        }}
      />
      <CustomerFormSheet
        open={formOpen}
        customer={editing}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={(values) => {
          if (editing) updateMutation.mutate({ id: editing.id, values });
          else createMutation.mutate(values);
        }}
      />
    </main>
  );
}

export default function ContactsPage() {
  const [queryClient] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ContactsPageContent />
    </QueryClientProvider>
  );
}

function RolePreview({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1" aria-label="RBAC role preview">
      {roles.map((item) => (
        <Button key={item} type="button" size="sm" variant={role === item ? "default" : "ghost"} onClick={() => onChange(item)}>
          {item}
        </Button>
      ))}
    </div>
  );
}

function SegmentFilter({ value, onChange }: { value: "All" | CustomerSegment; onChange: (segment: "All" | CustomerSegment) => void }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Segment filter">
      {visibleSegments.map((item) => (
        <Button key={item} type="button" size="sm" variant={value === item ? "default" : "outline"} onClick={() => onChange(item)}>
          {item}
        </Button>
      ))}
    </div>
  );
}

function MetricCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-semibold", tone === "danger" ? "text-danger" : "text-foreground")}>{value}</p>
    </div>
  );
}

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const Icon = feedback.tone === "success" ? CheckCircle2 : feedback.tone === "error" ? AlertTriangle : ShieldCheck;
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border p-4 text-sm",
        feedback.tone === "success" && "border-success bg-success/10",
        feedback.tone === "error" && "border-danger bg-danger/10",
        feedback.tone === "info" && "border-info bg-info/10",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4" aria-hidden="true" />
        <span>{feedback.message}</span>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading contacts">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-6">
          <div className="h-5 rounded-md bg-muted" />
          <div className="h-5 rounded-md bg-muted md:col-span-2" />
          <div className="h-5 rounded-md bg-muted" />
          <div className="h-5 rounded-md bg-muted" />
          <div className="h-5 rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-12 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Contacts could not load</h2>
        <p className="text-sm text-muted-foreground">Retry the directory query. If local data is corrupt, reset the demo store.</p>
      </div>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 size-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function EmptyState({ canCreate, onAdd, canImport, onImport }: { canCreate: boolean; onAdd: () => void; canImport: boolean; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 p-12 text-center">
      <Building2 className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">No customers yet</h2>
        <p className="text-sm text-muted-foreground">Add one manually or import linked customers from CRM.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {canCreate ? (
          <Button type="button" onClick={onAdd}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Add customer
          </Button>
        ) : null}
        {canImport ? (
          <Button type="button" variant="outline" onClick={onImport}>
            <CloudDownload className="mr-2 size-4" aria-hidden="true" />
            Import from CRM
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ContactsTable({ customers, canEdit, onOpen, onEdit }: { customers: Customer[]; canEdit: boolean; onOpen: (customer: Customer) => void; onEdit: (customer: Customer) => void }) {
  return (
    <div>
      <div className="hidden md:block">
        <div className="portal-table-wrap">
          <table className="portal-table text-left text-sm">
            <caption className="sr-only">Customer contacts</caption>
            <thead className="border-b border-border bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="w-1/3 px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                <th scope="col" className="px-4 py-3 font-medium">Tax & place</th>
                <th scope="col" className="px-4 py-3 font-medium">Credit</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((customer) => (
                <tr key={customer.id} className="align-top transition-colors hover:bg-muted">
                  <td className="px-4 py-4">
                    <CustomerIdentity customer={customer} onOpen={onOpen} />
                  </td>
                  <td className="px-4 py-4">
                    <ContactBlock customer={customer} />
                  </td>
                  <td className="px-4 py-4">
                    <TaxLocationBlock customer={customer} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <CreditUsage customer={customer} />
                      <p className="text-xs text-muted-foreground">{customer.paymentTerms}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <RowActions customer={customer} canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 p-3 md:hidden">
        {customers.map((customer) => (
          <article key={customer.id} className="rounded-md border border-border bg-card p-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <CustomerIdentity customer={customer} onOpen={onOpen} />
                <RowActions compact customer={customer} canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} />
              </div>
              <ContactBlock customer={customer} />
              <TaxLocationBlock customer={customer} />
              <div className="space-y-2 border-t border-border pt-3">
                <CreditUsage customer={customer} />
                <p className="text-xs text-muted-foreground">{customer.paymentTerms}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CustomerIdentity({ customer, onOpen }: { customer: Customer; onOpen: (customer: Customer) => void }) {
  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        className="text-left text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(customer)}
      >
        {customer.name}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{customer.id}</span>
        <Badge tone="neutral">{customer.segment}</Badge>
      </div>
      <CustomerFlags customer={customer} />
    </div>
  );
}

function CustomerFlags({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-wrap gap-2">
      {customer.msmeRegistered ? <Badge tone="info">MSME</Badge> : null}
      {customer.crmId ? <Badge tone="success">CRM linked</Badge> : <Badge tone="neutral">No CRM</Badge>}
      {creditRatio(customer) > 1 ? <Badge tone="danger">Over limit</Badge> : null}
    </div>
  );
}

function ContactBlock({ customer }: { customer: Customer }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="font-medium text-foreground">{customer.contactName}</p>
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Phone className="size-3 shrink-0" aria-hidden="true" />
        <span>{customer.phone}</span>
      </p>
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Mail className="size-3 shrink-0" aria-hidden="true" />
        <span className="break-all">{customer.email}</span>
      </p>
    </div>
  );
}

function TaxLocationBlock({ customer }: { customer: Customer }) {
  return (
    <div className="min-w-0 space-y-2">
      <GstinBadge gstin={customer.gstin} />
      <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        <span>{customer.city}, {customer.state}</span>
      </p>
    </div>
  );
}

function RowActions({
  customer,
  canEdit,
  compact = false,
  onOpen,
  onEdit,
}: {
  customer: Customer;
  canEdit: boolean;
  compact?: boolean;
  onOpen: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
}) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2", compact && "shrink-0")}>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen(customer)}>
        Detail
      </Button>
      {canEdit ? (
        <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${customer.name}`} onClick={() => onEdit(customer)}>
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function creditRatio(customer: Customer) {
  if (customer.creditLimitInr === 0) return 1;
  return (customer.creditUsedInr ?? 0) / customer.creditLimitInr;
}

function creditWidthClass(customer: Customer) {
  const ratio = creditRatio(customer);
  if (ratio <= 0.25) return "w-1/4";
  if (ratio <= 0.5) return "w-1/2";
  if (ratio <= 0.75) return "w-3/4";
  return "w-full";
}

function CreditUsage({ customer }: { customer: Customer }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <MoneyCell amountInr={customer.creditUsedInr ?? 0} />
        <span className="font-mono text-xs text-muted-foreground">/ {formatINR(customer.creditLimitInr)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-md bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-md", creditRatio(customer) > 1 ? "bg-danger" : "bg-success", creditWidthClass(customer))} />
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "success" | "danger" | "info" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        tone === "success" && "border-success bg-success/10",
        tone === "danger" && "border-danger bg-danger/10",
        tone === "info" && "border-info bg-info/10",
      )}
    >
      {children}
    </span>
  );
}

function MoneyCell({ amountInr }: { amountInr: number }) {
  return <span className="font-mono tabular-nums">{formatINR(amountInr)}</span>;
}

function DateCell({ iso }: { iso: string }) {
  return <span className="font-mono tabular-nums">{formatDate(iso)}</span>;
}

function GstinBadge({ gstin }: { gstin: string }) {
  const valid = gstinPattern.test(gstin);
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-sm border px-2 py-1 font-mono text-xs", valid ? "border-success bg-success/10" : "border-danger bg-danger/10")}>
      {valid ? <ShieldCheck className="size-3" aria-hidden="true" /> : <AlertTriangle className="size-3" aria-hidden="true" />}
      <span className="break-all">{gstin}</span>
    </span>
  );
}

function CustomerDetailSheet({ customer, canEdit, onOpenChange, onEdit }: { customer: Customer | null; canEdit: boolean; onOpenChange: (open: boolean) => void; onEdit: (customer: Customer) => void }) {
  return (
    <Sheet open={Boolean(customer)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {customer ? (
          <>
            <SheetHeader>
              <SheetTitle>{customer.name}</SheetTitle>
              <SheetDescription>
                <span className="font-mono">{customer.id}</span> · Added <DateCell iso={customer.createdAt} />
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-6 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                <GstinBadge gstin={customer.gstin} />
                <Badge tone={customer.crmId ? "success" : "neutral"}>{customer.crmId ? "CRM linked" : "No CRM link"}</Badge>
                {customer.msmeRegistered ? <Badge tone="info">MSME registered</Badge> : null}
                {creditRatio(customer) > 1 ? <Badge tone="danger">Credit over limit</Badge> : null}
              </div>
              <DetailGrid
                items={[
                  ["Segment", customer.segment],
                  ["Contact", customer.contactName],
                  ["Phone", customer.phone],
                  ["Email", customer.email],
                  ["Tax state", stateFromGstin(customer.gstin)],
                  ["Payment terms", customer.paymentTerms],
                  ["Billing", `${customer.billingAddress}, ${customer.city}, ${customer.state} ${customer.pincode}`],
                  ["Shipping", customer.shippingAddress || "Same as billing"],
                ]}
              />
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Credit usage</h3>
                <CreditUsage customer={customer} />
              </section>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Open chain</h3>
                <div className="grid gap-2">
                  <RelatedLink href="/sales" icon={FileText} label="Inquiry INQ-2606-041" meta="Solar feeder cable · Quote due" />
                  <RelatedLink href="/orders" icon={ShoppingCart} label="Order ORD-7741" meta="Ready for Dispatch" />
                  <RelatedLink href="/accounting" icon={ReceiptText} label="Invoice INV-2606-118" meta="Awaiting balance" />
                </div>
              </section>
            </div>
            <SheetFooter>
              <Button asChild variant="outline"><Link href={`/records/${customer.id}`}>View journey</Link></Button>
              {canEdit ? (
                <Button type="button" onClick={() => onEdit(customer)}>
                  <Pencil className="mr-2 size-4" aria-hidden="true" />
                  Edit customer
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-3 rounded-lg border border-border bg-card p-4">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RelatedLink({ href, icon: Icon, label, meta }: { href: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; meta: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted">
      <span className="flex items-center gap-3">
        <Icon className="size-4 text-muted-foreground" aria-hidden={true} />
        <span>
          <span className="block font-mono text-sm">{label}</span>
          <span className="block text-xs text-muted-foreground">{meta}</span>
        </span>
      </span>
      <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function CustomerFormSheet({ open, customer, isSaving, onOpenChange, onSubmit }: { open: boolean; customer: Customer | null; isSaving: boolean; onOpenChange: (open: boolean) => void; onSubmit: (values: CustomerFormValues) => void }) {
  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    mode: "onChange",
    defaultValues: defaultFormValues(customer),
  });
  const gstin = useWatch({ control: form.control, name: "gstin" }) ?? "";
  const derivedState = gstin.length >= 2 ? stateFromGstin(gstin.toUpperCase()) : "Waiting for GSTIN";

  React.useEffect(() => {
    form.reset(defaultFormValues(customer));
  }, [customer, form, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{customer ? "Edit customer" : "Add customer"}</SheetTitle>
          <SheetDescription>Validated GSTIN derives the tax state code for future quote tax.</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <FormSection title="Identity">
              <Field label="Customer name" error={form.formState.errors.name?.message}><Input {...form.register("name")} aria-invalid={Boolean(form.formState.errors.name)} /></Field>
              <Field label="Segment" error={form.formState.errors.segment?.message}>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...form.register("segment")}>
                  {segments.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Contact name" error={form.formState.errors.contactName?.message}><Input {...form.register("contactName")} aria-invalid={Boolean(form.formState.errors.contactName)} /></Field>
                <Field label="Phone" error={form.formState.errors.phone?.message}><Input {...form.register("phone")} aria-invalid={Boolean(form.formState.errors.phone)} /></Field>
              </div>
              <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register("email")} aria-invalid={Boolean(form.formState.errors.email)} /></Field>
            </FormSection>
            <FormSection title="Tax and address">
              <Field label="GSTIN" helper={`Derived state: ${derivedState}`} error={form.formState.errors.gstin?.message}>
                <Input className="font-mono uppercase" {...form.register("gstin")} aria-invalid={Boolean(form.formState.errors.gstin)} />
              </Field>
              <Field label="Billing address" error={form.formState.errors.billingAddress?.message}><Input {...form.register("billingAddress")} aria-invalid={Boolean(form.formState.errors.billingAddress)} /></Field>
              <Field label="Shipping address" helper="Leave blank if same as billing" error={form.formState.errors.shippingAddress?.message}><Input {...form.register("shippingAddress")} /></Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="City" error={form.formState.errors.city?.message}><Input {...form.register("city")} aria-invalid={Boolean(form.formState.errors.city)} /></Field>
                <Field label="State" error={form.formState.errors.state?.message}><Input {...form.register("state")} aria-invalid={Boolean(form.formState.errors.state)} /></Field>
                <Field label="Pincode" error={form.formState.errors.pincode?.message}><Input inputMode="numeric" {...form.register("pincode")} aria-invalid={Boolean(form.formState.errors.pincode)} /></Field>
              </div>
            </FormSection>
            <FormSection title="Commercial">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Payment terms" error={form.formState.errors.paymentTerms?.message}><Input {...form.register("paymentTerms")} aria-invalid={Boolean(form.formState.errors.paymentTerms)} /></Field>
                <Field label="Credit limit" error={form.formState.errors.creditLimitInr?.message}><Input type="number" inputMode="numeric" {...form.register("creditLimitInr")} aria-invalid={Boolean(form.formState.errors.creditLimitInr)} /></Field>
              </div>
              <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                <input type="checkbox" className="size-4 rounded-sm border border-input" {...form.register("msmeRegistered")} />
                MSME registered
              </label>
            </FormSection>
          </div>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!form.formState.isValid || isSaving}>
              {isSaving ? <RefreshCw className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {customer ? "Save changes" : "Create customer"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function defaultFormValues(customer: Customer | null): CustomerFormInput {
  return {
    name: customer?.name ?? "",
    segment: customer?.segment ?? "EPC contractor",
    contactName: customer?.contactName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    billingAddress: customer?.billingAddress ?? "",
    shippingAddress: customer?.shippingAddress ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    pincode: customer?.pincode ?? "",
    gstin: customer?.gstin ?? "",
    paymentTerms: customer?.paymentTerms ?? "30 days from invoice",
    creditLimitInr: customer?.creditLimitInr ?? 0,
    msmeRegistered: customer?.msmeRegistered ?? false,
  };
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, helper, error, children }: { label: string; helper?: string; error?: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>, {
            id,
            "aria-describedby": error || helper ? `${id}-message` : undefined,
          })
        : children}
      {error || helper ? (
        <p id={`${id}-message`} className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}>
          {error ?? helper}
        </p>
      ) : null}
    </div>
  );
}

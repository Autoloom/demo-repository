"use client";

import { adapter } from "@/lib/adapters/mock-adapter";
import { now } from "@/lib/domain/clock";
import { COMPUTED_SIGNAL_TYPES, computeSalesSignals } from "@/lib/domain/signals";
import { cablePresets, type CablePreset } from "@/lib/seed/cable-presets";
import type {
  Actor,
  ActivityEvent,
  ApprovalRequest,
  Material,
  CableStore,
  Collection,
  ComplianceItem,
  ConnectorId,
  Customer,
  Dispatch,
  Inquiry,
  Invoice,
  JobCard,
  Order,
  Quote,
  Role,
  SyncLog,
  User,
} from "@/lib/services/types";

export * from "@/lib/services/types";

function isoNow() {
  return now().toISOString();
}

function id(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

function actorFor(role: Role): Actor {
  return {
    id: `USR-${role}`,
    name: role,
    role,
  };
}

function addActivity(
  store: CableStore,
  event: Omit<ActivityEvent, "id" | "at">,
) {
  store.activity.unshift({
    id: id("ACT", store.activity.length),
    at: isoNow(),
    ...event,
  });
}

function checklistComplete(dispatch: Dispatch) {
  return dispatch.checklist.filter((item) => item.required).every((item) => item.done);
}

async function mutateStore<T>(fn: (store: CableStore) => T): Promise<T> {
  const store = await adapter.read();
  const result = fn(store);
  await adapter.write(store);
  return result;
}

async function list<K extends Collection>(collection: K): Promise<CableStore[K]> {
  return adapter.list(collection);
}

async function get<K extends Collection>(
  collection: K,
  recordId: string,
): Promise<CableStore[K][number] | null> {
  return adapter.get(collection, recordId);
}

export const dataService = {
  read: () => adapter.read(),
  reset: () => adapter.reset(),
};

export const contactsService = {
  list: () => list("customers"),
  get: (customerId: string) => get("customers", customerId),
  create: (input: Customer, actor: Actor) =>
    mutateStore((store) => {
      store.customers.unshift(input);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "contact.created",
        recordType: "inquiry",
        recordId: input.id,
        text: `Customer ${input.name} was created.`,
      });
      return input;
    }),
};

export const inquiriesService = {
  list: () => list("inquiries"),
  get: (inquiryId: string) => get("inquiries", inquiryId),
  updateStage: (inquiryId: string, stage: Inquiry["stage"], actor: Actor) =>
    mutateStore((store) => {
      const inquiry = store.inquiries.find((item) => item.id === inquiryId);
      if (!inquiry) throw new Error("Inquiry not found");
      inquiry.stage = stage;
      inquiry.nextAction = stage === "Won" ? "Converted to order" : inquiry.nextAction;
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "inquiry.stage_changed",
        recordType: "inquiry",
        recordId: inquiryId,
        text: `${inquiryId} moved to ${stage}.`,
      });
      return inquiry;
    }),
};

export const specsService = {
  list: () => list("specs"),
  get: (specId: string) => get("specs", specId),
  /** Upsert a CableSpec so quote lines can reference it by specId before save/convert. */
  upsert: (spec: import("@/lib/services/types").CableSpec) =>
    mutateStore((store) => {
      const index = store.specs.findIndex((item) => item.id === spec.id);
      if (index >= 0) store.specs[index] = spec;
      else store.specs.unshift(spec);
      return spec;
    }),
};

export const materialsService = {
  list: () => list("materials"),
  /** Add or edit a raw material rate. The next quote costing reads the new ₹/kg. */
  upsert: (material: Material, actor: Actor) =>
    mutateStore((store) => {
      const next = { ...material, updatedAt: isoNow() };
      const index = store.materials.findIndex((item) => item.id === next.id);
      if (index >= 0) store.materials[index] = next;
      else store.materials.unshift(next);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "material.saved",
        recordType: "quote",
        recordId: next.id,
        text: `Material ${next.name} set to ₹${next.ratePerKg}/kg.`,
      });
      return next;
    }),
  /** Pull MCX metal rates and write them onto the Conductor materials (source = MCX). */
  refreshMcx: (actor: Actor = actorFor("Owner")) =>
    mutateStore((store) => {
      const rates: Record<string, number> = { Aluminium: 248, Copper: 886 };
      store.materials = store.materials.map((material) =>
        material.category === "Conductor" && material.matchMaterial
          ? { ...material, ratePerKg: rates[material.matchMaterial] ?? material.ratePerKg, source: "MCX", updatedAt: isoNow() }
          : material,
      );
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "material.mcx_refreshed",
        recordType: "quote",
        recordId: "materials",
        text: `MCX rates refreshed: Al ₹${rates.Aluminium}/kg · Cu ₹${rates.Copper}/kg.`,
      });
      return store.materials;
    }),
};

export const quotesService = {
  list: () => list("quotes"),
  get: (quoteId: string) => get("quotes", quoteId),
  /** Ready-made common cables for the wizard's "pick a cable" step (page plan §2a/§3). */
  listPresets: async (): Promise<CablePreset[]> => cablePresets,
  saveDraft: (quote: Quote, actor: Actor) =>
    mutateStore((store) => {
      const existing = store.quotes.findIndex((item) => item.id === quote.id);
      if (existing >= 0) store.quotes[existing] = quote;
      else store.quotes.unshift(quote);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "quote.saved",
        recordType: "quote",
        recordId: quote.id,
        text: `Quote ${quote.id} saved as ${quote.status}.`,
      });
      return quote;
    }),
  sendToOrderBoard: (quoteId: string, actor: Actor) =>
    mutateStore((store) => {
      const quote = store.quotes.find((item) => item.id === quoteId);
      if (!quote) throw new Error("Quote not found");
      if (quote.marginReviewRequired && actor.role !== "Owner") {
        const approval: ApprovalRequest = {
          id: id("APR", store.approvals.length),
          kind: "Margin approval",
          recordType: "quote",
          recordId: quoteId,
          requestedByRole: actor.role,
          status: "Pending",
          reason: "Quote margin is below policy threshold.",
          createdAt: isoNow(),
        };
        quote.status = "Review";
        store.approvals.unshift(approval);
        addActivity(store, {
          actorRole: actor.role,
          actorName: actor.name,
          type: "approval.requested",
          recordType: "quote",
          recordId: quoteId,
          text: `Margin approval requested for ${quoteId}.`,
        });
        return { approval };
      }
      const orderId = id("ORD", store.orders.length + 7740);
      const dispatchId = id("DSP", store.dispatches.length + 3390);
      const invoiceId = id("INV", store.invoices.length + 2606061);
      const jobCardId = id("JC", store.jobCards.length + 8813);
      const firstSpec = store.specs.find((spec) => spec.id === quote.lines[0]?.specId);
      const order: Order = {
        id: orderId,
        quoteId,
        inquiryId: quote.inquiryId,
        customerId: quote.customerId,
        title: firstSpec?.designation ?? "Cable order",
        specSummary: firstSpec?.designation ?? "Cable order",
        stage: "In Production",
        priority: quote.marginReviewRequired ? "High" : "Medium",
        amountInr: quote.totalInr,
        promisedDate: "2026-07-08",
        completionPct: 0,
        ownerRole: "Operations",
        dispatchId,
        invoiceId,
        jobCardId,
        createdAt: isoNow(),
      };
      const dispatch: Dispatch = {
        id: dispatchId,
        orderId,
        transporter: "To be assigned",
        vehicleNo: "",
        ewayBillRequired: quote.totalInr > store.policies.ewayThresholdInr,
        checklist: [
          { id: "marking", label: "Drum markings verified", done: false, required: true },
          { id: "test", label: "Test certificate attached", done: false, required: true },
          { id: "packing", label: "Packing list ready", done: false, required: true },
          { id: "invoice", label: "Invoice ready", done: false, required: true },
          { id: "eway", label: "E-way bill generated", done: false, required: quote.totalInr > store.policies.ewayThresholdInr },
        ],
        createdAt: isoNow(),
      };
      const invoice: Invoice = {
        id: invoiceId,
        kind: "Draft",
        orderId,
        customerId: quote.customerId,
        taxableInr: quote.subtotalInr,
        igstInr: quote.gstInr,
        totalInr: quote.totalInr,
        hsnCode: "8544",
        status: "Draft",
        syncStatus: "Missing dispatch data",
        risk: "Medium",
        dueDate: "2026-08-08",
        createdAt: isoNow(),
      };
      const jobCard: JobCard = {
        id: jobCardId,
        orderId,
        specId: quote.lines[0]?.specId ?? "SPEC-240-35C",
        conductorDetail: firstSpec?.conductorClass ?? "Class 2 conductor",
        insulationDetail: firstSpec?.insulation ?? "XLPE",
        armourDetail: firstSpec?.armour ?? "Unarmoured",
        sheathDetail: firstSpec?.sheath ?? "PVC",
        drumPlan: [],
        operatorNotes: "",
        qualityChecks: [
          { id: "qc-resistance", label: "Conductor resistance", result: "Pending" },
          { id: "qc-hv", label: "Spark/HV test", result: "Pending" },
          { id: "qc-print", label: "Print legibility", result: "Pending" },
        ],
        updatedAt: isoNow(),
      };
      quote.status = "On board";
      quote.convertedOrderId = orderId;
      const inquiry = quote.inquiryId
        ? store.inquiries.find((item) => item.id === quote.inquiryId)
        : undefined;
      if (inquiry) {
        inquiry.stage = "Won";
        inquiry.convertedOrderId = orderId;
      }
      store.orders.unshift(order);
      store.dispatches.unshift(dispatch);
      store.invoices.unshift(invoice);
      store.jobCards.unshift(jobCard);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "quote.sent_to_board",
        recordType: "quote",
        recordId: quoteId,
        text: `${quoteId} created ${orderId}, ${dispatchId}, ${invoiceId}, and ${jobCardId}.`,
      });
      return { order, dispatch, invoice, jobCard };
    }),
};

export const ordersService = {
  list: () => list("orders"),
  get: (orderId: string) => get("orders", orderId),
  updateTitle: (orderId: string, title: string, actor: Actor) =>
    mutateStore((store) => {
      const order = store.orders.find((item) => item.id === orderId);
      if (!order) throw new Error("Order not found");
      order.title = title;
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "order.title_updated",
        recordType: "order",
        recordId: orderId,
        text: `${orderId} title updated.`,
      });
      return order;
    }),
  transition: (orderId: string, stage: Order["stage"], actor: Actor) =>
    mutateStore((store) => {
      const order = store.orders.find((item) => item.id === orderId);
      if (!order) throw new Error("Order not found");
      order.stage = stage;
      order.completionPct =
        stage === "Quoted" ? 0 : stage === "Won" ? 20 : stage === "In Production" ? 60 : stage === "Ready for Dispatch" ? 90 : 100;
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "order.transitioned",
        recordType: "order",
        recordId: orderId,
        text: `${orderId} moved to ${stage}.`,
      });
      return order;
    }),
};

export const jobCardsService = {
  list: () => list("jobCards"),
  get: (jobCardId: string) => get("jobCards", jobCardId),
  save: (jobCard: JobCard, actor: Actor) =>
    mutateStore((store) => {
      const index = store.jobCards.findIndex((item) => item.id === jobCard.id);
      const next = { ...jobCard, updatedAt: isoNow() };
      if (index >= 0) store.jobCards[index] = next;
      else store.jobCards.unshift(next);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "jobcard.updated",
        recordType: "jobcard",
        recordId: next.id,
        text: `Job card ${next.id} updated.`,
      });
      return next;
    }),
};

/**
 * Runs the Operations → Accounts handoff when every required checklist item is done:
 * advances the order to "Ready for Dispatch", flips the linked invoice to "Ready to sync",
 * and — if the invoice still has a balance pending — raises a "Dispatch hold" approval so
 * Accounts/Owner confirm payment before physical dispatch (rbac §4, page plan §3/§5).
 * Idempotent: only fires while the order is still pre-dispatch.
 */
function completeDispatchHandoff(store: CableStore, dispatch: Dispatch, actor: Actor) {
  const order = store.orders.find((entry) => entry.id === dispatch.orderId);
  const invoice = store.invoices.find((entry) => entry.orderId === dispatch.orderId);
  if (order && order.stage !== "Ready for Dispatch" && order.stage !== "Invoiced") {
    order.stage = "Ready for Dispatch";
    order.completionPct = 90;
    addActivity(store, {
      actorRole: actor.role,
      actorName: actor.name,
      type: "order.ready_for_dispatch",
      recordType: "order",
      recordId: order.id,
      text: `${order.id} is ready for dispatch.`,
    });
  }
  if (invoice && invoice.syncStatus === "Missing dispatch data") {
    invoice.status = "Ready to sync";
    invoice.syncStatus = "Ready to sync";
    addActivity(store, {
      actorRole: actor.role,
      actorName: actor.name,
      type: "invoice.ready_to_sync",
      recordType: "invoice",
      recordId: invoice.id,
      text: `${invoice.id} is ready to sync.`,
    });
  }
  // Dispatch hold: payment still pending → raise an approval (unless one is already open).
  const paymentPending = invoice?.status === "Payment pending" || invoice?.status === "Overdue";
  const holdOpen = store.approvals.some(
    (entry) => entry.kind === "Dispatch hold" && entry.recordId === dispatch.id && entry.status === "Pending",
  );
  if (paymentPending && !holdOpen) {
    store.approvals.unshift({
      id: id("APR", store.approvals.length),
      kind: "Dispatch hold",
      recordType: "dispatch",
      recordId: dispatch.id,
      requestedByRole: actor.role,
      status: "Pending",
      reason: `Balance pending on ${invoice?.id ?? "linked invoice"} — confirm payment before physical dispatch.`,
      createdAt: isoNow(),
    });
    addActivity(store, {
      actorRole: actor.role,
      actorName: actor.name,
      type: "approval.requested",
      recordType: "dispatch",
      recordId: dispatch.id,
      text: `Dispatch hold raised for ${dispatch.id} — payment pending.`,
    });
  }
}

export const dispatchService = {
  list: () => list("dispatches"),
  get: (dispatchId: string) => get("dispatches", dispatchId),
  getByOrder: async (orderId: string) =>
    (await adapter.list("dispatches")).find((item) => item.orderId === orderId) ?? null,
  updateLogistics: (
    dispatchId: string,
    patch: { transporter: string; vehicleNo: string },
    actor: Actor,
  ) =>
    mutateStore((store) => {
      const dispatch = store.dispatches.find((item) => item.id === dispatchId);
      if (!dispatch) throw new Error("Dispatch not found");
      dispatch.transporter = patch.transporter;
      dispatch.vehicleNo = patch.vehicleNo;
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "dispatch.logistics_updated",
        recordType: "dispatch",
        recordId: dispatchId,
        text: `Transporter set to ${patch.transporter || "—"}, vehicle ${patch.vehicleNo || "—"}.`,
      });
      return dispatch;
    }),
  toggleChecklist: (dispatchId: string, itemId: string, done: boolean, actor: Actor) =>
    mutateStore((store) => {
      const dispatch = store.dispatches.find((item) => item.id === dispatchId);
      if (!dispatch) throw new Error("Dispatch not found");
      const item = dispatch.checklist.find((entry) => entry.id === itemId);
      if (!item) throw new Error("Checklist item not found");
      item.done = done;
      if (checklistComplete(dispatch)) {
        completeDispatchHandoff(store, dispatch, actor);
      }
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "dispatch.checklist_updated",
        recordType: "dispatch",
        recordId: dispatchId,
        text: `${item.label} marked ${done ? "done" : "pending"}.`,
      });
      return dispatch;
    }),
};

export const invoicesService = {
  list: () => list("invoices"),
  get: (invoiceId: string) => get("invoices", invoiceId),
  sync: (invoiceId: string, actor: Actor) =>
    mutateStore((store) => {
      const invoice = store.invoices.find((item) => item.id === invoiceId);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.syncStatus === "Missing dispatch data") {
        throw new Error("Dispatch data is incomplete.");
      }
      invoice.status = "Payment pending";
      invoice.syncStatus = "Synced to Zoho Books";
      invoice.zohoBooksId = `ZB-${invoiceId}`;
      invoice.syncedAt = isoNow();
      const order = store.orders.find((item) => item.id === invoice.orderId);
      if (order) {
        order.stage = "Invoiced";
        order.completionPct = 100;
      }
      const log: SyncLog = {
        id: id("SYN", store.syncLogs.length),
        connectorId: "zoho-books",
        at: isoNow(),
        action: "push",
        recordType: "invoice",
        recordId: invoiceId,
        status: "success",
        message: `${invoiceId} synced to Zoho Books.`,
      };
      store.syncLogs.unshift(log);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "invoice.synced",
        recordType: "invoice",
        recordId: invoiceId,
        text: `${invoiceId} synced to Zoho Books.`,
      });
      return invoice;
    }),
};

export const complianceService = {
  list: () => list("compliance"),
  get: (complianceId: string) => get("compliance", complianceId),
  save: (item: ComplianceItem, actor: Actor) =>
    mutateStore((store) => {
      const index = store.compliance.findIndex((entry) => entry.id === item.id);
      if (index >= 0) store.compliance[index] = item;
      else store.compliance.unshift(item);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "compliance.saved",
        recordType: "compliance",
        recordId: item.id,
        text: `${item.type} ${item.id} saved.`,
      });
      return item;
    }),
};

export const approvalsService = {
  list: async (role: Role) => {
    const approvals = await list("approvals");
    if (role === "Owner") return approvals;
    return approvals.filter((approval) => approval.requestedByRole === role);
  },
  resolve: (approvalId: string, decision: "Approved" | "Rejected", note: string, actor: Actor) =>
    mutateStore((store) => {
      const approval = store.approvals.find((item) => item.id === approvalId);
      if (!approval) throw new Error("Approval not found");
      approval.status = decision;
      approval.resolvedByRole = actor.role;
      approval.resolvedAt = isoNow();
      if (decision === "Approved" && approval.kind === "BG/EMD approval") {
        const item = store.compliance.find((entry) => entry.id === approval.recordId);
        if (item) item.status = "Draft requested";
      }
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: `approval.${decision.toLowerCase()}`,
        recordType: approval.recordType,
        recordId: approval.recordId,
        text: `${approval.kind} ${decision.toLowerCase()}${note ? `: ${note}` : "."}`,
      });
      return approval;
    }),
};

export const signalsService = {
  /**
   * Seeded operational signals (margin/cash/document) merged with the live, computed
   * sales-acceleration signals (hot leads, follow-ups, repeat-order radar). Computed signals are
   * recalculated from current state on every call via the pure engine in lib/domain/signals.ts,
   * so they always reflect the latest inquiries/orders without being persisted to the store.
   */
  list: async () => {
    const store = await adapter.read();
    const computed = computeSalesSignals({
      inquiries: store.inquiries,
      orders: store.orders,
      customers: store.customers,
    });
    // Drop any stale persisted copies of computed types, then prepend the fresh computed set.
    const seeded = store.signals.filter((signal) => !COMPUTED_SIGNAL_TYPES.has(signal.type));
    return [...computed, ...seeded];
  },
};

export const integrationsService = {
  list: () => list("integrations"),
  logs: () => list("syncLogs"),
  test: (connectorId: ConnectorId, actor: Actor = actorFor("Owner")) =>
    mutateStore((store) => {
      const connector = store.integrations.find((item) => item.id === connectorId);
      if (!connector) throw new Error("Connector not found");
      connector.status = "Connected";
      connector.lastSyncAt = isoNow();
      const log: SyncLog = {
        id: id("SYN", store.syncLogs.length),
        connectorId,
        at: isoNow(),
        action: "test",
        status: "success",
        message: `${connector.name} connection test passed.`,
      };
      store.syncLogs.unshift(log);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "integration.tested",
        recordType: "invoice",
        recordId: connectorId,
        text: `${connector.name} connection test passed.`,
      });
      return connector;
    }),
  fetchMcxRates: async () => ({
    aluminium: 248,
    copper: 886,
    at: isoNow(),
  }),
  generateEwayBill: (dispatchId: string, actor: Actor) =>
    mutateStore((store) => {
      const dispatch = store.dispatches.find((item) => item.id === dispatchId);
      if (!dispatch) throw new Error("Dispatch not found");
      dispatch.ewayBillNo = "181255550001";
      const eway = dispatch.checklist.find((item) => item.id === "eway");
      if (eway) eway.done = true;
      const log: SyncLog = {
        id: id("SYN", store.syncLogs.length),
        connectorId: "eway-bill",
        at: isoNow(),
        action: "push",
        recordType: "dispatch",
        recordId: dispatchId,
        status: "success",
        message: `E-way bill generated for ${dispatchId}.`,
      };
      store.syncLogs.unshift(log);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "dispatch.eway_generated",
        recordType: "dispatch",
        recordId: dispatchId,
        text: `E-way bill generated for ${dispatchId}.`,
      });
      return dispatch;
    }),
  importFromCrm: (actor: Actor) =>
    mutateStore((store) => {
      const imported: Customer = {
        id: id("CUS", store.customers.length + 200),
        name: "Imported CRM Prospect",
        segment: "Trader/Dealer",
        contactName: "CRM Contact",
        phone: "+91 90000 00000",
        email: "crm-prospect@example.test",
        billingAddress: "Imported from CRM",
        city: "Ahmedabad",
        state: "Gujarat",
        pincode: "380001",
        gstin: "24CRMDEMO0001Z1",
        stateCode: "24",
        paymentTerms: "Advance",
        creditLimitInr: 1000000,
        creditUsedInr: 0,
        crmId: id("CRM", store.customers.length),
        createdAt: isoNow(),
      };
      store.customers.unshift(imported);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "crm.imported",
        recordType: "inquiry",
        recordId: imported.id,
        text: `${imported.name} imported from CRM.`,
      });
      return [imported];
    }),
};

export interface DashboardSummary {
  openInquiries: number;
  activeOrders: number;
  dispatchBlockers: number;
  invoiceValueInr: number;
  priorityQueue: Array<{ id: string; label: string; nextAction: string; dueDate: string; route: string }>;
  recentActivity: ActivityEvent[];
}

export const dashboardService = {
  summary: async (): Promise<DashboardSummary> => {
    const store = await adapter.read();
    return {
      openInquiries: store.inquiries.filter((item) => item.stage !== "Won" && item.stage !== "Lost").length,
      activeOrders: store.orders.filter((item) => item.stage !== "Invoiced").length,
      dispatchBlockers: store.dispatches.filter((item) => !checklistComplete(item)).length,
      invoiceValueInr: store.invoices.reduce((total, invoice) => total + invoice.totalInr, 0),
      priorityQueue: [
        ...store.inquiries.map((item) => ({
          id: item.id,
          label: item.requirement,
          nextAction: item.nextAction,
          dueDate: item.followUpDate,
          route: `/sales?inquiryId=${item.id}`,
        })),
        ...store.compliance.map((item) => ({
          id: item.id,
          label: item.type,
          nextAction: item.status,
          dueDate: item.dueDate,
          route: `/compliance?itemId=${item.id}`,
        })),
      ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      recentActivity: store.activity.slice(0, 8),
    };
  },
};

export interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  score: number;
}

function hit(type: string, id: string, title: string, subtitle: string, route: string): SearchHit {
  return { type, id, title, subtitle, route, score: 1 };
}

export const searchService = {
  query: async (term: string): Promise<SearchHit[]> => {
    const store = await adapter.read();
    const q = term.trim().toLowerCase();
    const rows = [
      ...store.inquiries.map((item) => hit("Inquiry", item.id, item.requirement, item.stage, `/records/${item.id}`)),
      ...store.quotes.map((item) => hit("Quote", item.id, item.customerId, item.status, `/records/${item.id}`)),
      ...store.orders.map((item) => hit("Order", item.id, item.title, item.stage, `/records/${item.id}`)),
      ...store.dispatches.map((item) => hit("Dispatch", item.id, item.orderId, item.ewayBillRequired ? "E-way required" : "Local", `/records/${item.orderId}`)),
      ...store.invoices.map((item) => hit("Invoice", item.id, item.orderId, item.syncStatus, `/records/${item.orderId}`)),
      ...store.customers.map((item) => hit("Contact", item.id, item.name, item.gstin, `/contacts?customerId=${item.id}`)),
      ...store.compliance.map((item) => hit("Compliance", item.id, item.type, item.status, `/compliance?itemId=${item.id}`)),
    ];
    if (!q) return rows.slice(0, 8);
    return rows.filter((row) => `${row.id} ${row.title} ${row.subtitle}`.toLowerCase().includes(q));
  },
};

export const settingsService = {
  getOrg: async () => (await adapter.read()).org,
  getPolicies: async () => (await adapter.read()).policies,
  updateOrg: (patch: Partial<CableStore["org"]>, actor: Actor) =>
    mutateStore((store) => {
      store.org = { ...store.org, ...patch };
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "settings.updated",
        recordType: "invoice",
        recordId: "settings",
        text: "Organization settings updated.",
      });
      return store.org;
    }),
  updatePolicies: (patch: Partial<CableStore["policies"]>, actor: Actor) =>
    mutateStore((store) => {
      store.policies = { ...store.policies, ...patch };
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "policies.updated",
        recordType: "invoice",
        recordId: "policies",
        text: "Workflow policies updated.",
      });
      return store.policies;
    }),
};

export const usersService = {
  list: () => list("users"),
  update: (userId: string, patch: Partial<User>, actor: Actor) =>
    mutateStore((store) => {
      const user = store.users.find((item) => item.id === userId);
      if (!user) throw new Error("User not found");
      Object.assign(user, patch);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "user.updated",
        recordType: "invoice",
        recordId: userId,
        text: `${user.name} updated.`,
      });
      return user;
    }),
};

export const journeyService = {
  get: async (recordId: string) => {
    const store = await adapter.read();
    const order =
      store.orders.find((item) => item.id === recordId) ??
      store.orders.find((item) => item.quoteId === recordId || item.inquiryId === recordId) ??
      store.orders.find((item) => item.dispatchId === recordId || item.invoiceId === recordId || item.jobCardId === recordId);
    const quote = order ? store.quotes.find((item) => item.id === order.quoteId) : store.quotes.find((item) => item.id === recordId);
    const inquiry = quote?.inquiryId
      ? store.inquiries.find((item) => item.id === quote.inquiryId)
      : order?.inquiryId
        ? store.inquiries.find((item) => item.id === order.inquiryId)
        : store.inquiries.find((item) => item.id === recordId);
    const dispatch = order?.dispatchId ? store.dispatches.find((item) => item.id === order.dispatchId) : undefined;
    const invoice = order?.invoiceId ? store.invoices.find((item) => item.id === order.invoiceId) : undefined;
    const customerId = order?.customerId ?? quote?.customerId ?? inquiry?.customerId;
    const customer = customerId ? store.customers.find((item) => item.id === customerId) : undefined;
    return { customer, inquiry, quote, order, dispatch, invoice };
  },
};

export const services = {
  data: dataService,
  contacts: contactsService,
  inquiries: inquiriesService,
  specs: specsService,
  materials: materialsService,
  quotes: quotesService,
  orders: ordersService,
  jobCards: jobCardsService,
  dispatch: dispatchService,
  invoices: invoicesService,
  compliance: complianceService,
  approvals: approvalsService,
  signals: signalsService,
  integrations: integrationsService,
  dashboard: dashboardService,
  search: searchService,
  settings: settingsService,
  users: usersService,
  journey: journeyService,
};

"use client";

import { adapter } from "@/lib/adapters/mock-adapter";
import { now } from "@/lib/domain/clock";
import { buildGtpSections, findReusableGtp, gtpForOrder } from "@/lib/domain/gtp";
import { inspectorEtaFrom } from "@/lib/domain/inspection";
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
  FinishedCableQc,
  Gtp,
  GtpSignOff,
  Inquiry,
  InspectionReport,
  Invoice,
  JobCard,
  MachineIncident,
  Order,
  Quote,
  RawMaterialCheck,
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

/** Standard dispatch checklist — per-drum certs, GTP-matched marking, DI clearance. */
function standardDispatchChecklist(ewayRequired: boolean): Dispatch["checklist"] {
  return [
    { id: "marking", label: "Drum markings stencilled", done: false, required: true },
    { id: "marking-verified", label: "Drum marking matches GTP", done: false, required: true },
    { id: "test", label: "Test certificates attached (all drums)", done: false, required: true },
    { id: "clearance", label: "Inspection clearance (DI received)", done: false, required: true },
    { id: "packing", label: "Packing list ready", done: false, required: true },
    { id: "invoice", label: "Invoice ready", done: false, required: true },
    { id: "eway", label: "E-way bill generated", done: false, required: ewayRequired },
  ];
}

/**
 * Auto-tick the "test certificates" item only when EVERY planned drum has a
 * verified cert (certs are per drum, not per order — client-confirmed).
 */
function syncTestCertItem(store: CableStore, orderId: string) {
  const dispatch = store.dispatches.find((entry) => entry.orderId === orderId);
  if (!dispatch) return;
  const jobCard = store.jobCards.find((entry) => entry.orderId === orderId);
  const drums = jobCard?.drumPlan.map((drum) => drum.drumNo) ?? [];
  const item = dispatch.checklist.find((entry) => entry.id === "test");
  if (!item) return;
  item.done =
    drums.length > 0 &&
    drums.every((drumNo) =>
      dispatch.drumTestCerts.some((cert) => cert.drumNo === drumNo && cert.verified),
    );
}

/**
 * Production gate (kamble-meeting-improvements.md §1–2): an order may only move
 * to "In Production" once its GTP is engineer-approved AND incoming raw material
 * QC has fully passed. Returns human-readable blockers for the UI.
 */
function productionGateBlockers(store: CableStore, order: Order): string[] {
  const blockers: string[] = [];
  const gtp = gtpForOrder(store.gtps, order);
  if (!gtp || gtp.status !== "Approved") {
    blockers.push(
      gtp
        ? `GTP ${gtp.id} is ${gtp.status} — divisional engineer sign-off required.`
        : "No GTP on file — create and approve one in the GTP Generator.",
    );
  }
  const rmc = store.rawMaterialChecks.find((entry) => entry.orderId === order.id);
  if (!rmc || !rmc.checks.every((check) => check.result === "Pass")) {
    blockers.push(
      rmc
        ? "Incoming raw material QC has pending or failed checks."
        : "Incoming raw material QC has not been recorded.",
    );
  }
  return blockers;
}

/** Draft (or reuse) a GTP for a freshly won order. Reuse = zero re-entry. */
function createGtpForOrder(store: CableStore, order: Order, specId: string, actor: Actor): Gtp {
  const customer = store.customers.find((entry) => entry.id === order.customerId);
  const spec = store.specs.find((entry) => entry.id === specId);
  const reusable = findReusableGtp(store.gtps, {
    customerId: order.customerId,
    specId,
    state: customer?.state,
  });
  const gtpId = id("GTP", store.gtps.filter((entry) => !entry.isTemplate).length);
  const reuseApproved = reusable && !reusable.isTemplate && reusable.status === "Approved";
  const gtp: Gtp = {
    id: gtpId,
    orderId: order.id,
    customerId: order.customerId,
    state: customer?.state ?? reusable?.state ?? "",
    boardName: reusable?.boardName ?? customer?.name,
    specId,
    cableType: spec?.designation ?? order.specSummary,
    format: reusable?.format ?? "self-generated",
    sections: reusable
      ? reusable.sections.map((section) => ({ ...section }))
      : spec
        ? buildGtpSections(spec)
        : [],
    // Same board + same cable type reuses the already-stamped GTP outright.
    status: reuseApproved ? "Approved" : "Draft",
    signOffs: reuseApproved ? reusable.signOffs.map((stamp) => ({ ...stamp })) : [],
    version: 1,
    reusedFromGtpId: reusable?.id,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  store.gtps.unshift(gtp);
  order.gtpId = gtp.id;
  addActivity(store, {
    actorRole: actor.role,
    actorName: actor.name,
    type: reuseApproved ? "gtp.reused" : "gtp.drafted",
    recordType: "gtp",
    recordId: gtp.id,
    text: reuseApproved
      ? `${gtp.id} reused from ${reusable?.id} — already approved, production unblocked for ${order.id}.`
      : `${gtp.id} drafted for ${order.id}${reusable ? ` (prefilled from ${reusable.id})` : ""} — awaiting engineer sign-off.`,
  });
  return gtp;
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
        // Orders land in "Won": production is gated until the GTP is approved
        // and incoming raw material QC passes (see productionGateBlockers).
        stage: "Won",
        priority: quote.marginReviewRequired ? "High" : "Medium",
        amountInr: quote.totalInr,
        promisedDate: "2026-07-08",
        completionPct: 20,
        ownerRole: "Operations",
        dispatchId,
        invoiceId,
        jobCardId,
        inspectionStatus: "Not called",
        createdAt: isoNow(),
      };
      const ewayRequired = quote.totalInr > store.policies.ewayThresholdInr;
      const dispatch: Dispatch = {
        id: dispatchId,
        orderId,
        transporter: "To be assigned",
        vehicleNo: "",
        ewayBillRequired: ewayRequired,
        checklist: standardDispatchChecklist(ewayRequired),
        drumTestCerts: [],
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
      const gtp = createGtpForOrder(store, order, jobCard.specId, actor);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "quote.sent_to_board",
        recordType: "quote",
        recordId: quoteId,
        text: `${quoteId} created ${orderId}, ${dispatchId}, ${invoiceId}, ${jobCardId}, and ${gtp.id}.`,
      });
      return { order, dispatch, invoice, jobCard, gtp };
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
      if (stage === "In Production" && order.stage !== "In Production") {
        const blockers = productionGateBlockers(store, order);
        if (blockers.length > 0) {
          throw new Error(`Production is gated for ${orderId}: ${blockers.join(" ")}`);
        }
      }
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
  /** Blockers preventing an order from entering production (empty = clear). */
  productionBlockers: async (orderId: string): Promise<string[]> => {
    const store = await adapter.read();
    const order = store.orders.find((item) => item.id === orderId);
    if (!order) return [];
    return productionGateBlockers(store, order);
  },
  /**
   * Repeat Order Fast Lane (kamble-meeting-improvements.md §8): clone a previous
   * order with zero re-entry — GTP reused (already stamped), job card + drum plan
   * copied, pricing carried from the source quote with the commodity delta flagged.
   */
  repeatOrder: (sourceOrderId: string, actor: Actor) =>
    mutateStore((store) => {
      const source = store.orders.find((item) => item.id === sourceOrderId);
      if (!source) throw new Error("Source order not found");
      const sourceQuote = store.quotes.find((item) => item.id === source.quoteId);
      if (!sourceQuote) throw new Error("Source quote not found — cannot carry pricing.");
      const sourceJobCard = store.jobCards.find((item) => item.orderId === source.id);

      const quoteId = id("Q-2606", store.quotes.length + 117);
      const orderId = id("ORD", store.orders.length + 7740);
      const dispatchId = id("DSP", store.dispatches.length + 3390);
      const invoiceId = id("INV", store.invoices.length + 2606061);
      const jobCardId = id("JC", store.jobCards.length + 8813);

      // Flag the commodity price delta instead of silently repricing.
      const currentMetalRate = (specId: string) => {
        const spec = store.specs.find((entry) => entry.id === specId);
        const baseMaterial =
          spec?.conductorMaterial === "Tinned Copper" || spec?.conductorMaterial === "Thermocouple Alloy"
            ? "Copper"
            : spec?.conductorMaterial === "Aluminium Alloy" || spec?.conductorMaterial === "AAAC" || spec?.conductorMaterial === "ACSR"
              ? "Aluminium"
              : spec?.conductorMaterial;
        return store.materials.find(
          (material) =>
            material.category === "Conductor" && material.matchMaterial === baseMaterial,
        )?.ratePerKg;
      };
      const deltas = sourceQuote.lines
        .map((line) => {
          const rate = currentMetalRate(line.specId);
          return rate !== undefined && rate !== line.metalRatePerKg
            ? `${line.specId}: metal ₹${line.metalRatePerKg}/kg → ₹${rate}/kg`
            : null;
        })
        .filter((entry): entry is string => entry !== null);

      const quote: Quote = {
        ...structuredClone(sourceQuote),
        id: quoteId,
        inquiryId: undefined,
        status: "On board",
        convertedOrderId: orderId,
        marginReviewRequired: false,
        notes: deltas.length > 0 ? `Repeat of ${sourceQuote.id}. Commodity delta: ${deltas.join("; ")}` : `Repeat of ${sourceQuote.id}.`,
        createdAt: isoNow(),
      };

      const order: Order = {
        ...source,
        id: orderId,
        quoteId,
        inquiryId: undefined,
        title: `${source.title} (repeat)`,
        stage: "Won",
        completionPct: 20,
        dispatchId,
        invoiceId,
        jobCardId,
        gtpId: undefined,
        estimatedCompletionDate: undefined,
        inspectionStatus: "Not called",
        inspectionCallDate: undefined,
        inspectorEtaDate: undefined,
        createdAt: isoNow(),
      };

      const ewayRequired = quote.totalInr > store.policies.ewayThresholdInr;
      const dispatch: Dispatch = {
        id: dispatchId,
        orderId,
        transporter: "To be assigned",
        vehicleNo: "",
        ewayBillRequired: ewayRequired,
        checklist: standardDispatchChecklist(ewayRequired),
        drumTestCerts: [],
        createdAt: isoNow(),
      };

      const invoice: Invoice = {
        id: invoiceId,
        kind: "Draft",
        orderId,
        customerId: order.customerId,
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

      const oldOrdNo = source.id.replace("ORD-", "");
      const newOrdNo = orderId.replace("ORD-", "");
      const jobCard: JobCard = sourceJobCard
        ? {
            ...structuredClone(sourceJobCard),
            id: jobCardId,
            orderId,
            drumPlan: sourceJobCard.drumPlan.map((drum) => ({
              ...drum,
              drumNo: drum.drumNo.replaceAll(oldOrdNo, newOrdNo),
              markings: drum.markings.replaceAll(source.id, orderId).replaceAll(oldOrdNo, newOrdNo),
            })),
            qualityChecks: sourceJobCard.qualityChecks.map((check) => ({
              ...check,
              result: "Pending" as const,
            })),
            operatorNotes: "",
            updatedAt: isoNow(),
          }
        : {
            id: jobCardId,
            orderId,
            specId: quote.lines[0]?.specId ?? "SPEC-PENDING",
            conductorDetail: "Copied from repeat order",
            insulationDetail: "",
            armourDetail: "",
            sheathDetail: "",
            drumPlan: [],
            operatorNotes: "",
            qualityChecks: [],
            updatedAt: isoNow(),
          };

      store.quotes.unshift(quote);
      store.orders.unshift(order);
      store.dispatches.unshift(dispatch);
      store.invoices.unshift(invoice);
      store.jobCards.unshift(jobCard);
      const gtp = createGtpForOrder(store, order, jobCard.specId, actor);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "order.repeated",
        recordType: "order",
        recordId: orderId,
        text: `${orderId} created as a repeat of ${source.id} — GTP ${gtp.status === "Approved" ? "reused (already approved)" : "drafted"}, drum plan and pricing carried over.${deltas.length > 0 ? ` ⚠ ${deltas.join("; ")}` : ""}`,
      });
      return { order, quote, dispatch, invoice, jobCard, gtp };
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

export const gtpService = {
  list: () => list("gtps"),
  get: (gtpId: string) => get("gtps", gtpId),
  getByOrder: async (orderId: string) => {
    const store = await adapter.read();
    const order = store.orders.find((entry) => entry.id === orderId);
    return order ? (gtpForOrder(store.gtps, order) ?? null) : null;
  },
  /** Draft a GTP for an order that has none, reusing a prior GTP/template when possible. */
  createForOrder: (orderId: string, actor: Actor) =>
    mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found");
      const existing = gtpForOrder(store.gtps, order);
      if (existing) return existing;
      const jobCard = store.jobCards.find((entry) => entry.orderId === orderId);
      const specId =
        jobCard?.specId ??
        store.quotes.find((entry) => entry.id === order.quoteId)?.lines[0]?.specId ??
        store.specs[0]?.id ??
        "SPEC-PENDING";
      return createGtpForOrder(store, order, specId, actor);
    }),
  save: (gtp: Gtp, actor: Actor) =>
    mutateStore((store) => {
      const index = store.gtps.findIndex((entry) => entry.id === gtp.id);
      const previous = index >= 0 ? store.gtps[index] : undefined;
      // Editing an approved GTP re-opens it as a new version; the stamps no
      // longer apply to the changed content.
      const reopened = previous?.status === "Approved" && !gtp.isTemplate;
      const next: Gtp = {
        ...gtp,
        status: reopened ? "Draft" : gtp.status,
        signOffs: reopened ? [] : gtp.signOffs,
        version: reopened ? previous.version + 1 : gtp.version,
        updatedAt: isoNow(),
      };
      if (index >= 0) store.gtps[index] = next;
      else store.gtps.unshift(next);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: reopened ? "gtp.reopened" : "gtp.saved",
        recordType: "gtp",
        recordId: next.id,
        text: reopened
          ? `${next.id} edited after approval — reopened as v${next.version}, sign-offs cleared.`
          : `${next.id} saved (v${next.version}, ${next.status}).`,
      });
      return next;
    }),
  submitForSignOff: (gtpId: string, actor: Actor) =>
    mutateStore((store) => {
      const gtp = store.gtps.find((entry) => entry.id === gtpId);
      if (!gtp) throw new Error("GTP not found");
      gtp.status = "Submitted";
      gtp.updatedAt = isoNow();
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "gtp.submitted",
        recordType: "gtp",
        recordId: gtpId,
        text: `${gtpId} sent for divisional engineer + AE sign-off.`,
      });
      return gtp;
    }),
  /**
   * The engineer sent it back with changes (PRD §5.2). Captures what they changed, so the next
   * GTP for this customer can absorb it — this is the loop that makes the product compound.
   * Any stamps are cleared: they applied to the version that was rejected.
   */
  recordCorrections: (
    gtpId: string,
    input: { note: string; diffs: { fieldKey: string; from: string; to: string }[] },
    actor: Actor,
  ) =>
    mutateStore((store) => {
      const gtp = store.gtps.find((entry) => entry.id === gtpId);
      if (!gtp) throw new Error("GTP not found");
      gtp.status = "Corrections received";
      gtp.signOffs = [];
      gtp.corrections = [
        ...(gtp.corrections ?? []),
        { receivedAt: isoNow(), note: input.note, diffs: input.diffs },
      ];
      gtp.updatedAt = isoNow();
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "gtp.corrections_received",
        recordType: "gtp",
        recordId: gtpId,
        text:
          `${gtpId} came back with corrections` +
          (input.diffs.length > 0 ? ` — ${input.diffs.length} change(s) noted.` : ".") +
          " Stamps cleared; revise and resubmit.",
      });
      return gtp;
    }),
  /** Record an engineer's stamp. Both stamps → Approved, production unblocked. */
  recordStamp: (gtpId: string, stamp: Omit<GtpSignOff, "stampedAt">, actor: Actor) =>
    mutateStore((store) => {
      const gtp = store.gtps.find((entry) => entry.id === gtpId);
      if (!gtp) throw new Error("GTP not found");
      if (gtp.signOffs.some((entry) => entry.role === stamp.role)) {
        throw new Error(`${stamp.role} stamp is already recorded.`);
      }
      gtp.signOffs.push({ ...stamp, stampedAt: isoNow() });
      const approved = gtp.signOffs.length >= 2;
      gtp.status = approved ? "Approved" : "Submitted";
      gtp.updatedAt = isoNow();
      const order = store.orders.find(
        (entry) => entry.gtpId === gtpId || entry.id === gtp.orderId,
      );
      if (order && !order.gtpId) order.gtpId = gtpId;
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: approved ? "gtp.approved" : "gtp.stamped",
        recordType: "gtp",
        recordId: gtpId,
        text: approved
          ? `${gtpId} approved — both stamps recorded.${order ? ` Production unblocked for ${order.id}.` : ""}`
          : `${stamp.role} stamp recorded on ${gtpId} by ${stamp.name}.`,
      });
      return gtp;
    }),
  /** Engineer rejection: back to Draft as a new version (old one is history). */
  reject: (gtpId: string, note: string, actor: Actor) =>
    mutateStore((store) => {
      const gtp = store.gtps.find((entry) => entry.id === gtpId);
      if (!gtp) throw new Error("GTP not found");
      gtp.status = "Draft";
      gtp.signOffs = [];
      gtp.version += 1;
      gtp.updatedAt = isoNow();
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "gtp.rejected",
        recordType: "gtp",
        recordId: gtpId,
        text: `${gtpId} rejected by engineer${note ? `: ${note}` : ""} — reopened as v${gtp.version}.`,
      });
      return gtp;
    }),
};

export const rawMaterialQcService = {
  getByOrder: async (orderId: string) => {
    const store = await adapter.read();
    return store.rawMaterialChecks.find((entry) => entry.orderId === orderId) ?? null;
  },
  save: (check: RawMaterialCheck, actor: Actor) =>
    mutateStore((store) => {
      const allPassed = check.checks.every((item) => item.result === "Pass");
      const anyFailed = check.checks.some((item) => item.result === "Fail");
      const next: RawMaterialCheck = {
        ...check,
        passedAt: allPassed ? (check.passedAt ?? isoNow()) : undefined,
        approvedBy: allPassed ? (check.approvedBy ?? actor.name) : check.approvedBy,
      };
      const index = store.rawMaterialChecks.findIndex((entry) => entry.id === next.id);
      if (index >= 0) store.rawMaterialChecks[index] = next;
      else store.rawMaterialChecks.unshift(next);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: anyFailed ? "rawmaterial.failed" : allPassed ? "rawmaterial.passed" : "rawmaterial.saved",
        recordType: "order",
        recordId: next.orderId,
        // A failed incoming check escalates to the Owner via the activity trail.
        text: anyFailed
          ? `Raw material QC FAILED on ${next.orderId} (${next.materialType}) — escalated to Owner; production stays gated.`
          : allPassed
            ? `Raw material QC passed on ${next.orderId} — pre-production gate cleared.`
            : `Raw material QC updated on ${next.orderId}.`,
      });
      return next;
    }),
};

export const finishedQcService = {
  listByOrder: async (orderId: string) => {
    const store = await adapter.read();
    return store.finishedCableQc.filter((entry) => entry.orderId === orderId);
  },
  save: (qc: FinishedCableQc, actor: Actor) =>
    mutateStore((store) => {
      const next: FinishedCableQc = {
        ...qc,
        testedAt: qc.result !== "Pending" ? (qc.testedAt ?? isoNow()) : qc.testedAt,
      };
      const index = store.finishedCableQc.findIndex((entry) => entry.id === next.id);
      if (index >= 0) store.finishedCableQc[index] = next;
      else store.finishedCableQc.unshift(next);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "finishedqc.saved",
        recordType: "order",
        recordId: next.orderId,
        text: `Finished cable QC for drum ${next.drumNo}: ${next.result}.`,
      });
      return next;
    }),
  /**
   * The QC results ARE the test certificate: stamp a certRef and push it onto the
   * dispatch's per-drum certs. The "test certificates" checklist item auto-ticks
   * only when every planned drum has a verified cert.
   */
  generateCertificate: (qcId: string, actor: Actor) =>
    mutateStore((store) => {
      const qc = store.finishedCableQc.find((entry) => entry.id === qcId);
      if (!qc) throw new Error("QC record not found");
      if (qc.result !== "Pass") throw new Error("Certificate needs a passing QC result.");
      qc.certRef = qc.certRef ?? `TC-${qc.orderId.replace("ORD-", "")}-${qc.drumNo.split("-").at(-1)}`;
      const dispatch = store.dispatches.find((entry) => entry.orderId === qc.orderId);
      if (dispatch && !dispatch.drumTestCerts.some((cert) => cert.drumNo === qc.drumNo)) {
        dispatch.drumTestCerts.push({ drumNo: qc.drumNo, certRef: qc.certRef, verified: true });
      }
      syncTestCertItem(store, qc.orderId);
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "finishedqc.cert_generated",
        recordType: "dispatch",
        recordId: dispatch?.id ?? qc.orderId,
        text: `Test certificate ${qc.certRef} generated for drum ${qc.drumNo}.`,
      });
      return qc;
    }),
};

export const incidentsService = {
  list: () => list("machineIncidents"),
  listByOrder: async (orderId: string) => {
    const store = await adapter.read();
    return store.machineIncidents.filter((entry) => entry.orderId === orderId);
  },
  /** Operator flags an issue → production holds → Owner approval requested. */
  log: (
    input: Omit<MachineIncident, "id" | "status" | "reportedAt" | "resolvedAt">,
    actor: Actor,
  ) =>
    mutateStore((store) => {
      const incident: MachineIncident = {
        ...input,
        id: id("MI", store.machineIncidents.length),
        status: "Awaiting approval",
        reportedAt: isoNow(),
      };
      store.machineIncidents.unshift(incident);
      store.approvals.unshift({
        id: id("APR", store.approvals.length),
        kind: "Machine incident",
        recordType: "incident",
        recordId: incident.id,
        requestedByRole: actor.role,
        status: "Pending",
        reason: `${incident.machineType}: ${incident.failureMode} on ${incident.orderId} — fix: ${incident.proposedFix}`,
        createdAt: isoNow(),
      });
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "incident.logged",
        recordType: "incident",
        recordId: incident.id,
        text: `Machine incident ${incident.id} logged on ${incident.machineType} — production hold pending Owner approval.`,
      });
      return incident;
    }),
  /** After the approved fix is applied, the operator resolves and restarts. */
  resolve: (incidentId: string, actor: Actor) =>
    mutateStore((store) => {
      const incident = store.machineIncidents.find((entry) => entry.id === incidentId);
      if (!incident) throw new Error("Incident not found");
      if (incident.status !== "Approved") {
        throw new Error("The proposed fix needs Owner approval before restart.");
      }
      incident.status = "Resolved";
      incident.resolvedAt = isoNow();
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "incident.resolved",
        recordType: "incident",
        recordId: incidentId,
        text: `${incidentId} resolved — machine hold lifted.`,
      });
      return incident;
    }),
};

export const inspectionService = {
  reportsByOrder: async (orderId: string) => {
    const store = await adapter.read();
    return store.inspectionReports.filter((entry) => entry.orderId === orderId);
  },
  /** Set at job-card issue; drives the "call inspection by" countdown. */
  setEstimatedCompletion: (orderId: string, dateIso: string, actor: Actor) =>
    mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found");
      order.estimatedCompletionDate = dateIso;
      order.inspectionStatus = order.inspectionStatus ?? "Not called";
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "inspection.ecd_set",
        recordType: "inspection",
        recordId: orderId,
        text: `Estimated completion for ${orderId} set to ${dateIso} — inspection call is due 10 days before.`,
      });
      return order;
    }),
  /** Marketing places the call; the inspector arrives ~11 days later. */
  placeCall: (orderId: string, actor: Actor) =>
    mutateStore((store) => {
      const order = store.orders.find((entry) => entry.id === orderId);
      if (!order) throw new Error("Order not found");
      const openDrumQc = store.finishedCableQc.filter(
        (entry) => entry.orderId === orderId && entry.result !== "Pass",
      );
      if (openDrumQc.length > 0) {
        throw new Error(
          `Finished cable QC incomplete for ${openDrumQc.map((entry) => entry.drumNo).join(", ")} — all drums must pass before the inspection call.`,
        );
      }
      const callDate = isoNow().slice(0, 10);
      order.inspectionCallDate = callDate;
      order.inspectorEtaDate = inspectorEtaFrom(callDate);
      order.inspectionStatus = "Called";
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "inspection.called",
        recordType: "inspection",
        recordId: orderId,
        text: `Inspection call placed for ${orderId} — inspector expected by ${order.inspectorEtaDate}.`,
      });
      return order;
    }),
  /**
   * Digital inspection log (replaces the QC manager's diary). Pass + clearance
   * auto-ticks the dispatch "Inspection clearance" item; Fail keeps the order in
   * production with a re-inspection needed.
   */
  logReport: (input: Omit<InspectionReport, "id">, actor: Actor) =>
    mutateStore((store) => {
      const report: InspectionReport = { ...input, id: id("IR", store.inspectionReports.length) };
      store.inspectionReports.unshift(report);
      const order = store.orders.find((entry) => entry.id === report.orderId);
      if (order) {
        order.inspectionStatus = report.result;
      }
      if (report.result === "Passed" && report.clearanceIssued) {
        const dispatch = store.dispatches.find((entry) => entry.orderId === report.orderId);
        const clearance = dispatch?.checklist.find((entry) => entry.id === "clearance");
        if (clearance) clearance.done = true;
        if (dispatch && checklistComplete(dispatch)) {
          completeDispatchHandoff(store, dispatch, actor);
        }
      }
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: report.result === "Passed" ? "inspection.passed" : "inspection.failed",
        recordType: "inspection",
        recordId: report.id,
        text:
          report.result === "Passed"
            ? `Inspection passed for ${report.orderId} (${report.drumsChecked.length} drums)${report.clearanceIssued ? ` — clearance issued${report.diRef ? `, DI ${report.diRef}` : ""}.` : "."}`
            : `Inspection FAILED for ${report.orderId} — ${report.nonConformances?.join("; ") ?? "non-conformances recorded"}. Re-inspection required.`,
      });
      return report;
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
  /** Mark a per-drum test certificate as physically verified against the drum. */
  setDrumCertVerified: (dispatchId: string, drumNo: string, verified: boolean, actor: Actor) =>
    mutateStore((store) => {
      const dispatch = store.dispatches.find((item) => item.id === dispatchId);
      if (!dispatch) throw new Error("Dispatch not found");
      const cert = dispatch.drumTestCerts.find((entry) => entry.drumNo === drumNo);
      if (!cert) throw new Error("No certificate logged for this drum");
      cert.verified = verified;
      syncTestCertItem(store, dispatch.orderId);
      if (checklistComplete(dispatch)) {
        completeDispatchHandoff(store, dispatch, actor);
      }
      addActivity(store, {
        actorRole: actor.role,
        actorName: actor.name,
        type: "dispatch.cert_verified",
        recordType: "dispatch",
        recordId: dispatchId,
        text: `Cert ${cert.certRef} for drum ${drumNo} marked ${verified ? "verified" : "unverified"}.`,
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
      // Machine incident: Owner's decision moves the incident so the operator can
      // apply the fix and restart (Approved) or keep the machine held (Open).
      if (approval.kind === "Machine incident") {
        const incident = store.machineIncidents.find((entry) => entry.id === approval.recordId);
        if (incident && incident.status === "Awaiting approval") {
          incident.status = decision === "Approved" ? "Approved" : "Open";
        }
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
      gtps: store.gtps,
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
      ...store.gtps.filter((item) => !item.isTemplate).map((item) => hit("GTP", item.id, item.cableType, item.status, `/gtp/review?gtpId=${item.id}`)),
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
  gtp: gtpService,
  jobCards: jobCardsService,
  rawMaterialQc: rawMaterialQcService,
  finishedQc: finishedQcService,
  incidents: incidentsService,
  inspection: inspectionService,
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

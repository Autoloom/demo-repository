import { daysUntil } from "@/lib/domain/clock";

export type Role = "Owner" | "Sales" | "Operations" | "Accounts";

export type OrderStage =
  | "Quoted"
  | "Won"
  | "In Production"
  | "Ready for Dispatch"
  | "Invoiced";

export type Priority = "Low" | "Medium" | "High";

export interface OrderSnapshot {
  id: string;
  title: string;
  customer: string;
  stage: OrderStage;
  priority: Priority;
  amountInr: number;
  promisedDate: string;
  route: string;
}

export interface PriorityQueueItem {
  id: string;
  label: string;
  nextAction: string;
  dueDate: string;
  route: string;
  ownerRole: Role;
  resource: "inquiry" | "quote" | "order" | "dispatch" | "invoice" | "compliance";
}

export interface Signal {
  id: string;
  type: "Margin anomaly" | "Delay risk" | "Missing document" | "Cash control" | "Credit risk";
  severity: "Low" | "Medium" | "High";
  route: string;
  recordId?: string;
  text: string;
  resource: PriorityQueueItem["resource"];
}

export interface ApprovalRequest {
  id: string;
  kind: "Margin approval" | "BG/EMD approval" | "Credit override" | "Dispatch hold";
  recordType: PriorityQueueItem["resource"];
  recordId: string;
  requestedByRole: Role;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  createdAt: string;
  route: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actorRole: Role;
  actorName: string;
  type: string;
  recordType: PriorityQueueItem["resource"] | "jobcard";
  recordId: string;
  text: string;
  route: string;
}

export interface DashboardSummary {
  operational: {
    openQuotes: number;
    inProduction: number;
    readyToDispatch: number;
    dispatchBlockers: number;
  };
  accounts: {
    receivablesInr: number;
    invoicesSynced: number;
    pendingSync: number;
    paymentHolds: number;
  };
  priorityQueue: PriorityQueueItem[];
  orderSnapshot: OrderSnapshot[];
  signals: Signal[];
  approvals: ApprovalRequest[];
  activity: ActivityEvent[];
}

export const roles: Role[] = ["Owner", "Sales", "Operations", "Accounts"];

export function parseRole(value: string | string[] | undefined): Role {
  const role = Array.isArray(value) ? value[0] : value;
  return roles.includes(role as Role) ? (role as Role) : "Owner";
}

const allPriorityQueue: PriorityQueueItem[] = [
  {
    id: "INQ-2606-031",
    label: "Solar XLPO repeat order",
    nextAction: "Send revised quote after MCX rate confirmation",
    dueDate: "2026-06-23",
    route: "/sales?focus=INQ-2606-031",
    ownerRole: "Sales",
    resource: "inquiry",
  },
  {
    id: "CMP-501",
    label: "EMD approval for PSU tender",
    nextAction: "Owner approval needed before portal submission",
    dueDate: "2026-06-24",
    route: "/compliance?focus=CMP-501",
    ownerRole: "Sales",
    resource: "compliance",
  },
  {
    id: "DSP-3391",
    label: "Dispatch packet incomplete",
    nextAction: "Attach test certificate and packing list",
    dueDate: "2026-06-24",
    route: "/dispatch?focus=DSP-3391",
    ownerRole: "Operations",
    resource: "dispatch",
  },
  {
    id: "INV-2606-062",
    label: "Balance before dispatch",
    nextAction: "Confirm payment hold status with customer",
    dueDate: "2026-06-25",
    route: "/accounting?focus=INV-2606-062",
    ownerRole: "Accounts",
    resource: "invoice",
  },
  {
    id: "ORD-7741",
    label: "11kV screened cable promise risk",
    nextAction: "Review production completion before noon",
    dueDate: "2026-06-26",
    route: "/orders?focus=ORD-7741",
    ownerRole: "Operations",
    resource: "order",
  },
];

const allOrders: OrderSnapshot[] = [
  {
    id: "ORD-7741",
    title: "HT 11kV screened feeder cable",
    customer: "Metro Infra Projects",
    stage: "In Production",
    priority: "High",
    amountInr: 1860000,
    promisedDate: "2026-06-26",
    route: "/orders?focus=ORD-7741",
  },
  {
    id: "ORD-7754",
    title: "3.5C x 240 sq mm Al XLPE",
    customer: "Aarav EPC",
    stage: "Ready for Dispatch",
    priority: "Medium",
    amountInr: 1240000,
    promisedDate: "2026-06-24",
    route: "/orders?focus=ORD-7754",
  },
  {
    id: "ORD-7762",
    title: "Solar XLPO DC string cable",
    customer: "Surya Solar Works",
    stage: "Won",
    priority: "Low",
    amountInr: 640000,
    promisedDate: "2026-06-30",
    route: "/orders?focus=ORD-7762",
  },
  {
    id: "ORD-7770",
    title: "FRLS control cable bundle",
    customer: "Narmada Automation",
    stage: "In Production",
    priority: "Medium",
    amountInr: 820000,
    promisedDate: "2026-06-28",
    route: "/orders?focus=ORD-7770",
  },
  {
    id: "ORD-7728",
    title: "Aluminium service cable lot",
    customer: "Western Utilities",
    stage: "Invoiced",
    priority: "Low",
    amountInr: 980000,
    promisedDate: "2026-06-22",
    route: "/orders?focus=ORD-7728",
  },
];

const allSignals: Signal[] = [
  {
    id: "SIG-1001",
    type: "Delay risk",
    severity: "High",
    route: "/orders?focus=ORD-7741",
    recordId: "ORD-7741",
    text: "Promise date is close and production completion is behind plan.",
    resource: "order",
  },
  {
    id: "SIG-1002",
    type: "Missing document",
    severity: "High",
    route: "/dispatch?focus=DSP-3391",
    recordId: "DSP-3391",
    text: "Dispatch checklist is blocked by missing test certificate.",
    resource: "dispatch",
  },
  {
    id: "SIG-1003",
    type: "Cash control",
    severity: "Medium",
    route: "/accounting?focus=INV-2606-062",
    recordId: "INV-2606-062",
    text: "Payment hold remains open before physical dispatch.",
    resource: "invoice",
  },
  {
    id: "SIG-1004",
    type: "Margin anomaly",
    severity: "Medium",
    route: "/quote/Q-2606-118",
    recordId: "Q-2606-118",
    text: "Quote margin is below the owner review threshold.",
    resource: "quote",
  },
];

const allApprovals: ApprovalRequest[] = [
  {
    id: "APR-9001",
    kind: "Margin approval",
    recordType: "quote",
    recordId: "Q-2606-118",
    requestedByRole: "Sales",
    status: "Pending",
    reason: "Low-margin HT cable quote needs owner intervention.",
    createdAt: "2026-06-22T16:30:00+05:30",
    route: "/approvals?focus=APR-9001",
  },
  {
    id: "APR-9002",
    kind: "Dispatch hold",
    recordType: "invoice",
    recordId: "INV-2606-062",
    requestedByRole: "Accounts",
    status: "Pending",
    reason: "Awaiting balance confirmation before dispatch release.",
    createdAt: "2026-06-23T10:05:00+05:30",
    route: "/approvals?focus=APR-9002",
  },
  {
    id: "APR-9003",
    kind: "BG/EMD approval",
    recordType: "compliance",
    recordId: "CMP-501",
    requestedByRole: "Sales",
    status: "Pending",
    reason: "Tender EMD instrument requires owner approval.",
    createdAt: "2026-06-23T08:50:00+05:30",
    route: "/approvals?focus=APR-9003",
  },
];

const allActivity: ActivityEvent[] = [
  {
    id: "ACT-1108",
    at: "2026-06-23T10:20:00+05:30",
    actorRole: "Accounts",
    actorName: "Meera",
    type: "invoice.hold_flagged",
    recordType: "invoice",
    recordId: "INV-2606-062",
    text: "Marked balance payment as a dispatch hold.",
    route: "/accounting?focus=INV-2606-062",
  },
  {
    id: "ACT-1107",
    at: "2026-06-23T10:05:00+05:30",
    actorRole: "Operations",
    actorName: "Ravi",
    type: "dispatch.checklist_updated",
    recordType: "dispatch",
    recordId: "DSP-3391",
    text: "Updated readiness checklist; test certificate still pending.",
    route: "/dispatch?focus=DSP-3391",
  },
  {
    id: "ACT-1106",
    at: "2026-06-23T09:40:00+05:30",
    actorRole: "Owner",
    actorName: "Asha",
    type: "approval.created",
    recordType: "quote",
    recordId: "Q-2606-118",
    text: "Margin approval request added to owner queue.",
    route: "/approvals?focus=APR-9001",
  },
  {
    id: "ACT-1105",
    at: "2026-06-23T09:15:00+05:30",
    actorRole: "Sales",
    actorName: "Dev",
    type: "quote.sent",
    recordType: "quote",
    recordId: "Q-2606-120",
    text: "Sent revised solar cable quote to Surya Solar Works.",
    route: "/quote/Q-2606-120",
  },
  {
    id: "ACT-1104",
    at: "2026-06-22T17:10:00+05:30",
    actorRole: "Operations",
    actorName: "Ravi",
    type: "order.stage_changed",
    recordType: "order",
    recordId: "ORD-7754",
    text: "Moved order to Ready for Dispatch.",
    route: "/orders?focus=ORD-7754",
  },
  {
    id: "ACT-1103",
    at: "2026-06-22T14:25:00+05:30",
    actorRole: "Accounts",
    actorName: "Meera",
    type: "invoice.synced",
    recordType: "invoice",
    recordId: "INV-2606-058",
    text: "Synced invoice to Zoho Books.",
    route: "/accounting?focus=INV-2606-058",
  },
  {
    id: "ACT-1102",
    at: "2026-06-22T12:40:00+05:30",
    actorRole: "Sales",
    actorName: "Dev",
    type: "compliance.requested",
    recordType: "compliance",
    recordId: "CMP-501",
    text: "Requested EMD approval for PSU tender submission.",
    route: "/compliance?focus=CMP-501",
  },
  {
    id: "ACT-1101",
    at: "2026-06-22T10:05:00+05:30",
    actorRole: "Owner",
    actorName: "Asha",
    type: "order.reviewed",
    recordType: "order",
    recordId: "ORD-7741",
    text: "Reviewed high-priority HT order after delay signal.",
    route: "/records/ORD-7741",
  },
];

function canViewResource(role: Role, resource: PriorityQueueItem["resource"] | "jobcard") {
  if (role === "Owner") return true;

  const visibleByRole: Record<Role, Array<PriorityQueueItem["resource"] | "jobcard">> = {
    Owner: ["inquiry", "quote", "order", "dispatch", "invoice", "compliance", "jobcard"],
    Sales: ["inquiry", "quote", "order", "compliance"],
    Operations: ["quote", "order", "dispatch", "invoice", "jobcard"],
    Accounts: ["order", "dispatch", "invoice", "compliance"],
  } as const;

  return visibleByRole[role].includes(resource);
}

function filterForRole<T extends { resource: PriorityQueueItem["resource"] }>(
  role: Role,
  items: T[],
) {
  return role === "Owner"
    ? items
    : items.filter((item) => canViewResource(role, item.resource));
}

export const dashboardService = {
  async summary(role: Role): Promise<DashboardSummary> {
    const priorityQueue = filterForRole(role, allPriorityQueue)
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const orderSnapshot =
      role === "Sales"
        ? allOrders.filter((order) => order.stage === "Won" || order.stage === "Quoted")
        : allOrders.filter((order) => role === "Owner" || role !== "Accounts" || order.stage !== "Won");

    const signals = filterForRole(role, allSignals);
    const approvals =
      role === "Owner"
        ? allApprovals.filter((approval) => approval.status === "Pending")
        : allApprovals.filter((approval) => approval.requestedByRole === role);

    const activity = allActivity
      .filter((event) => role === "Owner" || event.actorRole === role || canViewResource(role, event.recordType))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);

    return {
      operational: {
        openQuotes: 7,
        inProduction: allOrders.filter((order) => order.stage === "In Production").length,
        readyToDispatch: allOrders.filter((order) => order.stage === "Ready for Dispatch").length,
        dispatchBlockers: allSignals.filter((signal) => signal.resource === "dispatch").length,
      },
      accounts: {
        receivablesInr: 2480000,
        invoicesSynced: 14,
        pendingSync: 3,
        paymentHolds: allSignals.filter((signal) => signal.type === "Cash control").length,
      },
      priorityQueue: priorityQueue.map((item) => ({
        ...item,
        nextAction:
          daysUntil(item.dueDate) < 0 ? `Overdue: ${item.nextAction}` : item.nextAction,
      })),
      orderSnapshot,
      signals,
      approvals,
      activity,
    };
  },
};

import { daysUntil, now } from "@/lib/domain/clock";

export type Role = "Owner" | "Sales" | "Operations" | "Accounts";

export type Actor = {
  id: string;
  name: string;
  role: Role;
};

export type RiskLevel = "Low" | "Medium" | "High";

export type ComplianceType =
  | "EMD"
  | "Bank guarantee"
  | "Tender document"
  | "Security deposit";

export type ComplianceStatus =
  | "Needs approval"
  | "Draft requested"
  | "Submitted"
  | "Complete"
  | "Expired";

export type ComplianceItem = {
  id: string;
  type: ComplianceType;
  customerId: string;
  inquiryId?: string;
  amountInr: number;
  dueDate: string;
  status: ComplianceStatus;
  risk: RiskLevel;
  instrumentRef?: string;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  segment: string;
};

export type Inquiry = {
  id: string;
  customerId: string;
  requirement: string;
  tenderRef?: string;
};

export type ApprovalRequest = {
  id: string;
  kind: "BG/EMD approval";
  recordType: "compliance";
  recordId: string;
  requestedByRole: Role;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  createdAt: string;
  resolvedByRole?: Role;
  resolvedAt?: string;
};

export type ActivityEvent = {
  id: string;
  at: string;
  actorRole: Role;
  actorName?: string;
  type: string;
  recordType: "compliance";
  recordId: string;
  text: string;
};

export type ComplianceInput = {
  type: ComplianceType;
  customerId: string;
  inquiryId?: string;
  amountInr: number;
  dueDate: string;
  status: ComplianceStatus;
  instrumentRef?: string;
};

export type Action = "view" | "create" | "edit" | "transition" | "approve";
export type Resource = "compliance" | "approvals" | "activity";

const customers: Customer[] = [
  { id: "CUS-104", name: "Narmada EPC Projects", segment: "EPC contractor" },
  { id: "CUS-218", name: "Surya Grid Infra", segment: "Government/PSU" },
  { id: "CUS-303", name: "VoltEdge Solar", segment: "Solar installer" },
  { id: "CUS-411", name: "Bhavya Utilities", segment: "Utility distributor" },
];

const inquiries: Inquiry[] = [
  {
    id: "INQ-2606-041",
    customerId: "CUS-104",
    requirement: "Tender for 3.5C LT aluminium cable drums",
    tenderRef: "NMD/TDR/26/188",
  },
  {
    id: "INQ-2606-052",
    customerId: "CUS-218",
    requirement: "11 kV screened cable supply package",
    tenderRef: "SGI/BG/2026/77",
  },
  {
    id: "INQ-2606-067",
    customerId: "CUS-303",
    requirement: "Solar DC XLPO cable tender set",
    tenderRef: "VE-SOLAR-660",
  },
  {
    id: "INQ-2606-073",
    customerId: "CUS-411",
    requirement: "Security deposit for distribution feeder cable",
    tenderRef: "BUTL-SD-19",
  },
];

let complianceItems: ComplianceItem[] = [
  {
    id: "CMP-501",
    type: "EMD",
    customerId: "CUS-104",
    inquiryId: "INQ-2606-041",
    amountInr: 250000,
    dueDate: "2026-06-24",
    status: "Needs approval",
    risk: "High",
    instrumentRef: "DD draft pending",
    createdAt: "2026-06-20T11:30:00+05:30",
  },
  {
    id: "CMP-502",
    type: "Bank guarantee",
    customerId: "CUS-218",
    inquiryId: "INQ-2606-052",
    amountInr: 1800000,
    dueDate: "2026-06-28",
    status: "Draft requested",
    risk: "Medium",
    instrumentRef: "BG request sent to bank",
    createdAt: "2026-06-19T14:20:00+05:30",
  },
  {
    id: "CMP-503",
    type: "Tender document",
    customerId: "CUS-303",
    inquiryId: "INQ-2606-067",
    amountInr: 0,
    dueDate: "2026-07-04",
    status: "Submitted",
    risk: "Low",
    instrumentRef: "Portal upload VE-SOLAR-660",
    createdAt: "2026-06-18T10:45:00+05:30",
  },
  {
    id: "CMP-504",
    type: "Security deposit",
    customerId: "CUS-411",
    inquiryId: "INQ-2606-073",
    amountInr: 475000,
    dueDate: "2026-06-21",
    status: "Expired",
    risk: "High",
    instrumentRef: "SD challan not accepted",
    createdAt: "2026-06-16T09:00:00+05:30",
  },
  {
    id: "CMP-505",
    type: "EMD",
    customerId: "CUS-303",
    inquiryId: "INQ-2606-067",
    amountInr: 90000,
    dueDate: "2026-07-12",
    status: "Complete",
    risk: "Low",
    instrumentRef: "UTR-72661190",
    createdAt: "2026-06-17T12:10:00+05:30",
  },
];

let approvals: ApprovalRequest[] = [
  {
    id: "APR-7001",
    kind: "BG/EMD approval",
    recordType: "compliance",
    recordId: "CMP-501",
    requestedByRole: "Sales",
    status: "Pending",
    reason: "EMD deposit crosses tender control threshold and needs Owner release.",
    createdAt: "2026-06-21T12:00:00+05:30",
  },
];

let activity: ActivityEvent[] = [
  {
    id: "ACT-9001",
    at: "2026-06-21T12:00:00+05:30",
    actorRole: "Sales",
    actorName: "Asha",
    type: "approval.requested",
    recordType: "compliance",
    recordId: "CMP-501",
    text: "Requested Owner approval for EMD release on CMP-501.",
  },
  {
    id: "ACT-9002",
    at: "2026-06-22T15:30:00+05:30",
    actorRole: "Sales",
    actorName: "Asha",
    type: "compliance.transitioned",
    recordType: "compliance",
    recordId: "CMP-502",
    text: "Moved bank guarantee CMP-502 to Draft requested.",
  },
];

const permissions: Record<Exclude<Role, "Owner">, Set<string>> = {
  Sales: new Set([
    "view:compliance",
    "create:compliance",
    "edit:compliance",
    "transition:compliance",
    "create:approvals",
    "view:activity",
  ]),
  Operations: new Set(["view:activity"]),
  Accounts: new Set(["view:compliance", "view:activity"]),
};

const actors: Record<Role, Actor> = {
  Owner: { id: "USR-001", name: "Meera", role: "Owner" },
  Sales: { id: "USR-002", name: "Asha", role: "Sales" },
  Operations: { id: "USR-003", name: "Ravi", role: "Operations" },
  Accounts: { id: "USR-004", name: "Kabir", role: "Accounts" },
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), 180);
  });
}

function stamp(): string {
  return now().toISOString();
}

function computeRisk(dueDate: string, status: ComplianceStatus): RiskLevel {
  const remaining = daysUntil(dueDate);

  if (status === "Expired" || remaining < 0) return "High";
  if (remaining <= 3) return "High";
  if (remaining <= 7) return "Medium";
  return "Low";
}

function sortByUrgency(items: ComplianceItem[]): ComplianceItem[] {
  const statusWeight: Record<ComplianceStatus, number> = {
    "Needs approval": 0,
    "Draft requested": 1,
    Submitted: 2,
    Complete: 3,
    Expired: 4,
  };

  return [...items].sort((first, second) => {
    const statusDelta = statusWeight[first.status] - statusWeight[second.status];
    if (statusDelta !== 0) return statusDelta;
    return daysUntil(first.dueDate) - daysUntil(second.dueDate);
  });
}

function appendActivity(
  actor: Actor,
  type: ActivityEvent["type"],
  recordId: string,
  text: string,
) {
  activity = [
    {
      id: `ACT-${9000 + activity.length + 1}`,
      at: stamp(),
      actorRole: actor.role,
      actorName: actor.name,
      type,
      recordType: "compliance",
      recordId,
      text,
    },
    ...activity,
  ];
}

function can(role: Role, action: Action, resource: Resource): boolean {
  if (role === "Owner") return true;
  return permissions[role].has(`${action}:${resource}`);
}

function requiresApproval(role: Role, item: ComplianceItem): boolean {
  return (
    role !== "Owner" &&
    item.status === "Needs approval" &&
    (item.type === "EMD" || item.type === "Bank guarantee")
  );
}

function assertAllowed(actor: Actor, action: Action, resource: Resource) {
  if (!can(actor.role, action, resource)) {
    throw new Error(`${actor.role} cannot ${action} ${resource}.`);
  }
}

function replaceItem(nextItem: ComplianceItem): ComplianceItem {
  complianceItems = complianceItems.map((item) =>
    item.id === nextItem.id ? nextItem : item,
  );
  return nextItem;
}

export const rbac = {
  actors,
  can,
  requiresApproval,
};

export const referenceService = {
  async listCustomers(): Promise<Customer[]> {
    return delay([...customers]);
  },
  async listInquiries(): Promise<Inquiry[]> {
    return delay([...inquiries]);
  },
};

export const complianceService = {
  async list(): Promise<ComplianceItem[]> {
    const withRisk = complianceItems.map((item) => ({
      ...item,
      risk: computeRisk(item.dueDate, item.status),
    }));
    complianceItems = withRisk;
    return delay(sortByUrgency(withRisk));
  },

  async create(input: ComplianceInput, actor: Actor): Promise<ComplianceItem> {
    assertAllowed(actor, "create", "compliance");

    const nextItem: ComplianceItem = {
      id: `CMP-${501 + complianceItems.length}`,
      ...input,
      inquiryId: input.inquiryId || undefined,
      instrumentRef: input.instrumentRef || undefined,
      risk: computeRisk(input.dueDate, input.status),
      createdAt: stamp(),
    };

    complianceItems = [nextItem, ...complianceItems];
    appendActivity(actor, "compliance.created", nextItem.id, `Created ${nextItem.type} ${nextItem.id}.`);
    return delay(nextItem);
  },

  async transition(
    id: string,
    status: ComplianceStatus,
    actor: Actor,
  ): Promise<ComplianceItem> {
    assertAllowed(actor, "transition", "compliance");

    const item = complianceItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Compliance item ${id} was not found.`);

    const nextItem = replaceItem({
      ...item,
      status,
      risk: computeRisk(item.dueDate, status),
    });
    appendActivity(actor, "compliance.transitioned", id, `Moved ${id} to ${status}.`);
    return delay(nextItem);
  },

  async requestApproval(id: string, actor: Actor): Promise<ApprovalRequest> {
    assertAllowed(actor, "create", "approvals");

    const item = complianceItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Compliance item ${id} was not found.`);
    if (!requiresApproval(actor.role, item)) {
      throw new Error(`${item.id} does not require approval for ${actor.role}.`);
    }

    const existing = approvals.find(
      (approval) => approval.recordId === id && approval.status === "Pending",
    );
    if (existing) return delay(existing);

    const nextApproval: ApprovalRequest = {
      id: `APR-${7001 + approvals.length}`,
      kind: "BG/EMD approval",
      recordType: "compliance",
      recordId: id,
      requestedByRole: actor.role,
      status: "Pending",
      reason: `${item.type} ${id} needs Owner approval before submission.`,
      createdAt: stamp(),
    };

    approvals = [nextApproval, ...approvals];
    appendActivity(actor, "approval.requested", id, `Requested Owner approval for ${item.type} ${id}.`);
    return delay(nextApproval);
  },

  async approve(id: string, actor: Actor): Promise<ComplianceItem> {
    assertAllowed(actor, "approve", "compliance");

    const item = complianceItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Compliance item ${id} was not found.`);
    if (item.type !== "EMD" && item.type !== "Bank guarantee") {
      throw new Error(`${item.type} does not use the EMD/BG approval gate.`);
    }

    approvals = approvals.map((approval) =>
      approval.recordId === id && approval.status === "Pending"
        ? {
            ...approval,
            status: "Approved",
            resolvedByRole: actor.role,
            resolvedAt: stamp(),
          }
        : approval,
    );

    const nextItem = replaceItem({
      ...item,
      status: "Submitted",
      risk: computeRisk(item.dueDate, "Submitted"),
    });
    appendActivity(actor, "approval.approved", id, `Approved ${item.type} ${id} and moved it to Submitted.`);
    return delay(nextItem);
  },
};

export const approvalsService = {
  async list(): Promise<ApprovalRequest[]> {
    return delay([...approvals]);
  },
};

export const activityService = {
  async list(): Promise<ActivityEvent[]> {
    return delay([...activity]);
  },
};

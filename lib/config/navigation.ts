/*  Central source of truth for navigation groups, routes,
    icons, associated resources, and available roles. */

import {
  BellIcon,
  BoxesIcon,
  Building2Icon,
  CalculatorIcon,
  ClipboardListIcon,
  FileTextIcon,
  HomeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Resource, Role } from "@/lib/services/types";

export const roles: Role[] = ["Owner", "Sales", "Operations", "Accounts"];

export type NavItem = {
  href: string;
  label: string;
  resource: Resource;
  icon: LucideIcon;
};

export const navGroups: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: "Command",
    items: [{ href: "/dashboard", label: "Dashboard", resource: "dashboard", icon: HomeIcon }],
  },
  {
    label: "Sales",
    items: [
      { href: "/sales", label: "Sales Board", resource: "inquiry", icon: BoxesIcon },
      { href: "/quote", label: "Quote Builder", resource: "quote", icon: CalculatorIcon },
      { href: "/contacts", label: "Contacts", resource: "contact", icon: UsersIcon },
      { href: "/compliance", label: "EMD & BG", resource: "compliance", icon: ShieldCheckIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Order Board", resource: "order", icon: ClipboardListIcon },
      { href: "/job-card", label: "Operator Card", resource: "jobcard", icon: WrenchIcon },
      { href: "/dispatch", label: "Dispatch", resource: "dispatch", icon: TruckIcon },
    ],
  },
  {
    label: "Accounts",
    items: [{ href: "/accounting", label: "Invoice Readiness", resource: "invoice", icon: FileTextIcon }],
  },
  {
    label: "Admin",
    items: [
      { href: "/approvals", label: "Approvals", resource: "approvals", icon: BellIcon },
      { href: "/integrations", label: "Integrations", resource: "integrations", icon: Building2Icon },
      { href: "/settings", label: "Settings", resource: "settings", icon: SettingsIcon },
    ],
  },
];

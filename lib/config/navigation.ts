import {
  Bell,
  Boxes,
  Building2,
  Calculator,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Single source of truth for the sidebar: groups, routes and icons. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Command",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { href: "/sales", label: "Sales Board", icon: Boxes },
      { href: "/quote", label: "Quote Builder", icon: Calculator },
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/compliance", label: "EMD & BG", icon: ShieldCheck },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/orders", label: "Order Board", icon: ClipboardList },
      { href: "/gtp-creator", label: "GTP Creator", icon: Sparkles },
      { href: "/job-card", label: "Operator Card", icon: Wrench },
      { href: "/dispatch", label: "Dispatch", icon: Truck },
    ],
  },
  {
    label: "Accounts",
    items: [{ href: "/accounting", label: "Invoice Readiness", icon: FileText }],
  },
  {
    label: "Admin",
    items: [
      { href: "/approvals", label: "Approvals", icon: Bell },
      { href: "/integrations", label: "Integrations", icon: Building2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

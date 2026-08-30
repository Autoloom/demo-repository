//  Central permission matrix and helpers such as can(), 
//  approval requirements, contextual permission guards, 
//  and mapping URLs to protected resources.

import type { Action, PermissionContext, PermissionKey, Resource, Role } from "@/lib/services/types";

export const ROLE_PERMISSIONS: Record<Exclude<Role, "Owner">, Set<PermissionKey>> = {
  Sales: new Set([
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
    "view:gtp",
    "view:contact",
    "create:contact",
    "edit:contact",
    "view:compliance",
    "create:compliance",
    "edit:compliance",
    "transition:compliance",
    "view:approvals",
    "create:approvals",
    "view:activity",
  ]),
  Operations: new Set([
    "view:dashboard",
    "view:quote",
    "view:order",
    "edit:order",
    "transition:order",
    "view:gtp",
    "create:gtp",
    "edit:gtp",
    "transition:gtp",
    "view:jobcard",
    "edit:jobcard",
    "view:dispatch",
    "edit:dispatch",
    "view:invoice",
    "view:contact",
    "view:approvals",
    "create:approvals",
    "view:activity",
  ]),
  Accounts: new Set([
    "view:dashboard",
    "view:order",
    "view:gtp",
    "transition:order",
    "view:dispatch",
    "view:invoice",
    "sync:invoice",
    "view:contact",
    "view:compliance",
    "view:approvals",
    "create:approvals",
    "view:integrations",
    "view:activity",
  ]),
};

function passesGuards(role: Role, action: Action, resource: Resource, ctx?: PermissionContext) {
  if (role === "Owner") return true;
  if (resource === "quote" && action === "transition" && ctx?.record?.marginReviewRequired) {
    return false;
  }
  return true;
}

export function can(role: Role, action: Action, resource: Resource, ctx?: PermissionContext) {
  if (role === "Owner") return true;
  const granted = ROLE_PERMISSIONS[role];
  if (!granted.has(`${action}:${resource}`)) return false;
  return passesGuards(role, action, resource, ctx);
}

export function requiresApproval(
  role: Role,
  action: Action,
  resource: Resource,
  ctx?: PermissionContext,
) {
  if (role === "Owner") return false;
  if (resource === "quote" && action === "transition" && ctx?.record?.marginReviewRequired) {
    return true;
  }
  return false;
}

export function resourceForPath(pathname: string): Resource {
  if (pathname.startsWith("/sales")) return "inquiry";
  if (pathname.startsWith("/quote")) return "quote";
  if (pathname.startsWith("/contacts")) return "contact";
  if (pathname.startsWith("/compliance")) return "compliance";
  if (pathname.startsWith("/orders")) return "order";
  if (pathname.startsWith("/gtp")) return "gtp";
  if (pathname.startsWith("/job-card")) return "jobcard";
  if (pathname.startsWith("/dispatch")) return "dispatch";
  if (pathname.startsWith("/accounting")) return "invoice";
  if (pathname.startsWith("/approvals")) return "approvals";
  if (pathname.startsWith("/integrations")) return "integrations";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/records")) return "activity";
  return "dashboard";
}

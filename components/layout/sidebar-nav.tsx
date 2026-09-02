"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, type NavItem } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

export default function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-3">
      {NAV_GROUPS.map((group) => (
        <section key={group.label} className="space-y-2">
          {collapsed ? (
            <div className="mx-2 border-t border-border" aria-hidden="true" />
          ) : (
            <h2 className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h2>
          )}

          <div className="space-y-1">
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const { href, label, icon: Icon } = item;

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
}

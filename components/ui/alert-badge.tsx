/*  Styled status/alert badge with reusable visual variants. */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Normalized: lucide icons + token colors (no remixicon, no raw bg-red-500). See approved-components.md §3.4.
const alertBadgeVariants = cva(
  "inline-flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
  {
    variants: {
      variant: {
        error: "bg-danger text-danger-foreground",
        success: "bg-success text-success-foreground",
        info: "bg-info text-info-foreground",
        warning: "bg-warning text-warning-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

interface AlertBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof alertBadgeVariants> {
  icon?: LucideIcon;
  label: string;
  action?: {
    label: string;
    href: string;
    icon?: LucideIcon;
  };
}

export function AlertBadge({
  className,
  variant,
  icon: Icon,
  label,
  action,
  ...props
}: AlertBadgeProps) {
  return (
    <span className={cn(alertBadgeVariants({ variant }), className)} {...props}>
      <span className="inline-flex items-center gap-1.5">
        {Icon && <Icon className="size-4" aria-hidden={true} />}
        {label}
      </span>
      {action && (
        <>
          <span className="h-5 w-px bg-current/40" />
          <a href={action.href} className="inline-flex items-center gap-1.5">
            {action.label}
            {action.icon && <action.icon className="size-4" aria-hidden={true} />}
          </a>
        </>
      )}
    </span>
  );
}

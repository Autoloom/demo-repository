import * as React from "react";

import { cn } from "@/lib/utils";
import { GridPattern } from "@/components/ui/grid-pattern";

// Flat enterprise card — decorative glow/gradient REMOVED per client direction.
// Separation comes from border + surface tokens; only a faint GridPattern texture remains.
// See approved-components.md §3.1 / §6.
export function GridCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group bg-card relative isolate z-0 flex h-full flex-col justify-between overflow-hidden rounded-sm border px-5 py-4 transition-colors duration-75 hover:bg-bg-subtle",
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 opacity-40">
        <div className="absolute -inset-[25%] -skew-y-12 [mask-image:linear-gradient(225deg,black,transparent)]">
          <GridPattern
            width={30}
            height={30}
            x={0}
            y={0}
            squares={getRandomPattern(5)}
            className="fill-border/40 stroke-border absolute inset-0 size-full translate-y-2 transition-transform duration-150 ease-out group-hover:translate-y-0"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

function getRandomPattern(length?: number): [x: number, y: number][] {
  length = length ?? 5;
  return Array.from({ length }, () => [
    Math.floor(Math.random() * 4) + 7,
    Math.floor(Math.random() * 6) + 1,
  ]);
}

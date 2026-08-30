/* Placeholder for pages parked while the GTP generator is the demo focus.
   Deliberately bare: a hairline, a wordmark, nothing to click or read. */

import { cn } from "@/lib/utils";

export function ComingSoon({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[70vh] flex-col items-center justify-center gap-7", className)}>
      {/* Hairline that fades out at both ends, so it reads as a rule rather than a border. */}
      <div
        aria-hidden="true"
        className="h-px w-36 bg-gradient-to-r from-transparent via-border to-transparent"
      />
      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">Coming soon</p>
    </div>
  );
}

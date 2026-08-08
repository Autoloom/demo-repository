/* dispatch route with a fallback loading state. */

import { Suspense } from "react";

import { DispatchClient } from "@/features/dispatch/components/dispatch-page";

export default function DispatchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <DispatchClient />
    </Suspense>
  );
}

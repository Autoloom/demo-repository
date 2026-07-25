import { Suspense } from "react";

import { DispatchClient } from "./DispatchClient";

export default function DispatchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <DispatchClient />
    </Suspense>
  );
}

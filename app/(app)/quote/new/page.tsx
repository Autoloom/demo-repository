import { Suspense } from "react";

import { QuoteBuilderClient } from "../QuoteBuilderClient";

export default function NewQuotePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteBuilderClient />
    </Suspense>
  );
}

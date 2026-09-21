import { Suspense } from "react";

import { QuoteListClient } from "./QuoteListClient";

export default function QuotePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteListClient />
    </Suspense>
  );
}

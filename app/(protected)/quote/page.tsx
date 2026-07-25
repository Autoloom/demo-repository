import { Suspense } from "react";

import { QuoteBuilderPageContent } from "@/components/features/quote/QuoteBuilderPageContent";

export default function QuotePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteBuilderPageContent />
    </Suspense>
  );
}

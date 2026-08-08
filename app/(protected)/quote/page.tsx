/* Entry route for creating/building a quote, with a Suspense boundary. */

import { Suspense } from "react";

import { QuoteBuilderPageContent } from "@/features/quote/components/quote-builder-page-content";

export default function QuotePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteBuilderPageContent />
    </Suspense>
  );
}

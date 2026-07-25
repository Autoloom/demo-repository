import { Suspense } from "react";

import { QuoteBuilderClient } from "../QuoteBuilderClient";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;

  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteBuilderClient quoteId={quoteId} />
    </Suspense>
  );
}

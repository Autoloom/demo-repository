/* Parked behind a "Coming soon" placeholder while the GTP generator is the
   demo focus. The original page is commented out immediately below — restore
   it by uncommenting and deleting the placeholder export. */

// /*  Dynamic existing-quote route.
//     Extracts quoteId and passes it into the quote builder. */
//
// import { Suspense } from "react";
//
// import { QuoteBuilderClient } from "@/features/quote/components/quote-builder";
//
// export default async function QuoteDetailPage({
//   params,
//   }: {
//   params: Promise<{ quoteId: string }>;
//   }) {
//   const { quoteId } = await params;
//
//   return (
//     <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
//       <QuoteBuilderClient quoteId={quoteId} />
//     </Suspense>
//   );
// }

import { ComingSoon } from "@/components/ui";

export default function QuoteDetailPage() {
  return <ComingSoon />;
}

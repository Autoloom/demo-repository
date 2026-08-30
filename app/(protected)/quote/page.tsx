/* Parked behind a "Coming soon" placeholder while the GTP generator is the
   demo focus. The original page is commented out immediately below — restore
   it by uncommenting and deleting the placeholder export. */

// /* Entry route for creating/building a quote, with a Suspense boundary. */
//
// import { Suspense } from "react";
//
// import { QuoteBuilderPageContent } from "@/features/quote/components/quote-builder-page-content";
//
// export default function QuotePage() {
//   return (
//     <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
//       <QuoteBuilderPageContent />
//     </Suspense>
//   );
// }

import { ComingSoon } from "@/components/ui";

export default function QuotePage() {
  return <ComingSoon />;
}

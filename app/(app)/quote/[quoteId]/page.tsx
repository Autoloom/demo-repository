import { Suspense } from "react";

import { QuoteDetail } from "./QuoteDetail";

// Static export needs at least one concrete path for this segment, or the
// build refuses to touch it at all. Quotes are created and stored
// client-side (localStorage), so there's no real list of ids to enumerate
// at build time — this placeholder id is the only page ever generated for
// this route, and it's never actually read (see QuoteDetail.tsx, which
// takes the real id from the browser URL instead). GitHub Pages has no
// server to rewrite "/quote/<real-id>" to this file, so out/404.html
// does that job: any unmatched path falls through to it and redirects
// back into this shell with the original path intact.
export function generateStaticParams() {
  return [{ quoteId: "_" }];
}

export default function QuoteDetailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background p-6" />}>
      <QuoteDetail />
    </Suspense>
  );
}

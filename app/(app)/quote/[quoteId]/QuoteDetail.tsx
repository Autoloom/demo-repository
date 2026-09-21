"use client";

import { useParams } from "next/navigation";

import { QuoteBuilderClient } from "../QuoteBuilderClient";

/**
 * Reads the quote id from the browser URL rather than the server-rendered
 * `params`. This page is statically exported with a single placeholder
 * path (see page.tsx) — `out/404.html` redirects any real "/quote/<id>"
 * request back here with the original path intact, and this is what
 * resolves the real id once we're running client-side. See
 * public/404.html for the redirect half of this.
 */
export function QuoteDetail() {
  const params = useParams<{ quoteId: string }>();
  const quoteId = Array.isArray(params.quoteId) ? params.quoteId[0] : params.quoteId;

  return <QuoteBuilderClient quoteId={quoteId} />;
}

/**
 * GTP tab — a pure hub. The three things a person comes here to do, and nothing else.
 *
 * The GTP records list and detail view live at /gtp/review; the standards tables at
 * /gtp/standards. Keeping this page to just the three choices is the point: the previous version
 * showed the full records UI here, which made the hub redundant and the tab's purpose unclear.
 */
import { GtpHome } from "./GtpHome";

export default function GtpPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">GTP Generator</h1>
        <p className="text-sm text-muted-foreground">
          Guaranteed Technical Particulars. Production can&rsquo;t begin until the divisional
          engineer stamps the GTP — repeat orders for the same board reuse it with no re-entry.
        </p>
      </header>

      <GtpHome />
    </main>
  );
}

import { ArrowRight, Cable, CheckCircle2, ShieldCheck } from "lucide-react";

interface Highlight {
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  { title: "Session", description: "Secure authentication through Auth0." },
  { title: "RBAC", description: "Access follows your assigned role." },
  { title: "Audit", description: "Actions can be linked to the signed-in user." },
];

export default function LoginPage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-2">
        <IntroPanel />
        <SignInPanel />
      </div>
    </main>
  );
}

function IntroPanel() {
  return (
    <section className="flex flex-col justify-between border-b border-border bg-muted p-6 lg:border-b-0 lg:border-r lg:p-8">
      <BrandBar />

      <div className="max-w-xl py-12 lg:py-0">
        <p className="mb-3 text-sm font-medium text-primary">Role-aware access</p>

        <h1 className="max-w-lg text-3xl font-semibold tracking-tight">
          Sign in to the operating brain for your cable business.
        </h1>

        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          Authentication is handled securely through Auth0. Sign in to access your
          workspace and authorised features.
        </p>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {HIGHLIGHTS.map((highlight) => (
          <HighlightCard key={highlight.title} {...highlight} />
        ))}
      </div>
    </section>
  );
}

function BrandBar() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-primary shadow-sm">
          <Cable className="size-5" aria-hidden="true" />
        </span>

        <span className="font-mono text-sm font-semibold">Cable OS</span>
      </div>

      <span className="rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground">
        secure access
      </span>
    </div>
  );
}

function HighlightCard({ title, description }: Highlight) {
  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-foreground">
        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
        <span className="font-medium">{title}</span>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function SignInPanel() {
  return (
    <section className="flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Workspace login</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Enter Cable OS</h2>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="leading-5 text-muted-foreground">
                You&apos;ll be redirected to Auth0 to securely sign in.
              </p>
            </div>

            <a
              href="/auth/login?returnTo=/success"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              Sign in
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

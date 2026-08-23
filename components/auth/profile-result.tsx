import type { AuthenticatedProfile } from "@/lib/services/profile";

interface Field {
  label: string;
  value: string;
}

function toFields(profile: AuthenticatedProfile): Field[] {
  return [
    { label: "ID", value: profile.id },
    { label: "Role", value: profile.role },
    { label: "Email", value: profile.email },
    { label: "Name", value: profile.name },
    {
      label: "Permissions",
      value: profile.permissions.length ? profile.permissions.join(", ") : "—",
    },
  ];
}

export default function ProfileResult({ profile }: { profile: AuthenticatedProfile }) {
  return (
    <div className="w-full max-w-xl space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium text-primary">Authentication successful</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Signed in as {profile.name}
        </h1>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {toFields(profile).map(({ label, value }) => (
          <div key={label} className="rounded-md border border-border bg-muted p-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Raw claims</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(profile.raw_claims, null, 2)}
        </pre>
      </details>
    </div>
  );
}

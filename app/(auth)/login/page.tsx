"use client";

import {
  AlertCircle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button, Input, Label } from "@/components/ui";
import {
  authenticateDemoUser,
  demoUsers,
  hydrateSessionRole,
  useSessionStore,
} from "@/lib/store/session";
import { cn } from "@/lib/utils";

type AuthState = "ready" | "submitting" | "error";
type NoticeTone = "error" | "info";

const defaultUser = demoUsers[0];

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useSessionStore((state) => state.hydrated);
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  const signIn = useSessionStore((state) => state.signIn);
  const [email, setEmail] = useState(defaultUser.email);
  const [password, setPassword] = useState(defaultUser.password);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("ready");
  const [notice, setNotice] = useState<{
    tone: NoticeTone;
    message: string;
  } | null>(null);

  const selectedUser = useMemo(
    () => demoUsers.find((user) => user.email.toLowerCase() === email.trim().toLowerCase()) ?? defaultUser,
    [email],
  );
  const isSubmitting = authState === "submitting";

  useEffect(() => {
    hydrateSessionRole();
  }, []);

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthenticated, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const user = authenticateDemoUser(email, password);
    if (!user) {
      setAuthState("error");
      setNotice({
        tone: "error",
        message: "Email and password do not match a Cable OS user.",
      });
      return;
    }

    setAuthState("submitting");
    window.setTimeout(() => {
      signIn(user, keepSignedIn);
      router.replace("/dashboard");
    }, 180);
  }

  function handleResetPassword() {
    setAuthState("ready");
    setNotice({
      tone: "info",
      message: "Use your assigned Cable OS email and password, or ask the workspace owner to reset access.",
    });
  }

  return (
    <main className="min-h-svh overflow-x-clip bg-background text-foreground">
      <div className="grid min-h-svh lg:grid-cols-2">
        <section className="flex flex-col justify-between border-b border-border bg-muted p-6 lg:border-b-0 lg:border-r lg:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-card text-primary shadow-sm">
                <Cable className="size-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-sm font-semibold">Cable OS</span>
            </div>
            <span className="rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs text-muted-foreground">
              secure demo
            </span>
          </div>

          <div className="max-w-xl py-12 lg:py-0">
            <p className="mb-3 text-sm font-medium text-primary">Role-aware access</p>
            <h1 className="max-w-lg text-3xl font-semibold tracking-tight">
              Sign in to the operating brain for your cable business.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              A real session now controls the portal. Login selects the user, RBAC filters the
              workspace, and sign out clears the session.
            </p>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["Session", "Persistent or browser-session only."],
              ["RBAC", "Sidebar and actions follow your role."],
              ["Audit", "Mutations keep the signed-in actor."],
            ].map(([label, description]) => (
              <div key={label} className="rounded-md border border-border bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">{label}</span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-xl space-y-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Workspace login</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Enter your Cable OS account</h2>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <form className="space-y-5" onSubmit={handleSubmit}>
                {notice ? (
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-md border bg-muted p-3 text-sm",
                      notice.tone === "error" ? "border-danger" : "border-info",
                    )}
                    role={notice.tone === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    <AlertCircle
                      className={cn(
                        "mt-1 size-4 shrink-0",
                        notice.tone === "error" ? "text-danger" : "text-info",
                      )}
                      aria-hidden="true"
                    />
                    <span>{notice.message}</span>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="pl-9"
                        placeholder="owner@cableos.in"
                        autoComplete="email"
                        disabled={isSubmitting}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password">Password</Label>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 py-0"
                        onClick={handleResetPassword}
                        disabled={isSubmitting}
                      >
                        Need help?
                      </Button>
                    </div>
                    <div className="relative">
                      <LockKeyhole
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="px-9"
                        placeholder="Enter password"
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        disabled={isSubmitting}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setKeepSignedIn((value) => !value)}
                  role="switch"
                  aria-checked={keepSignedIn}
                  disabled={isSubmitting}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                    Keep me signed in
                  </span>
                  <span
                    className={cn(
                      "rounded-sm border px-2 py-1 font-mono text-xs",
                      keepSignedIn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {keepSignedIn ? "ON" : "OFF"}
                  </span>
                </button>

                <Button
                  type="submit"
                  className="w-full justify-between"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  <span className="flex items-center gap-2">
                    {isSubmitting ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="size-4" aria-hidden="true" />
                    )}
                    Sign in
                  </span>
                  <span className="font-mono text-xs">{selectedUser.role}</span>
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

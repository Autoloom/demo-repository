# Cable OS 2 — Production Build

This folder holds the **new production code** for Autoloom Cable OS. It is built from the plans in
**`../cable os plans`**. Do not modify the old demo in `../cable-os` (reference only).

## Stack
Next.js 15 (App Router) · TypeScript (strict) · Tailwind v4 · shadcn/ui · TanStack Query/Table ·
Zustand · React Hook Form + Zod · dnd-kit · date-fns · lucide-react · Recharts.

## Where things go
See `../cable os plans/foundation/architecture.md` §2 for the full directory layout. In short:
- `app/(auth)/login`, `app/(app)/…` — pages (one per plan in `../cable os plans/pages`).
- `lib/services` — the service layer (pages call only this).
- `lib/adapters` — mock (localStorage) now, http stub for later. Backend-ready.
- `lib/integrations` — the 4 fixed connectors (Zoho Books, CRM, e-way, MCX).
- `lib/rbac`, `lib/domain`, `lib/seed`, `components/*`.

## Status
Not yet scaffolded. The design system is **paused** pending the client's detailed design prompts —
build to semantic component names / tokens; apply visual polish in a final pass.

## Getting started (once an agent begins)
1. Scaffold per `architecture.md`. 2. Implement foundation (`data-models`, `rbac`, `integration-layer`,
   service/adapter, seed). 3. Build the shell + login. 4. Build the chain pages. 5. Supporting + admin.

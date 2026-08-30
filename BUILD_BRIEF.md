# Cable OS 2 Build Brief

This file coordinates the multi-agent build. The source of truth remains `../cable os plans`.

## Foundation Contract
- Read and obey `../cable os plans/foundation/architecture.md`, `data-models.md`, `rbac.md`, and `integration-layer.md`.
- Read and obey every file in `../cable os plans/foundation/design/`.
- Use the installed Next.js App Router conventions from `node_modules/next/dist/docs/01-app`.
- Pages call `lib/services` only. Pages never call adapters, connectors, `fetch`, or `localStorage` directly.
- Dates use `lib/domain/clock.ts` and `lib/domain/format.ts`. No `new Date()` in pages.
- Money uses `MoneyCell` or `formatINR`. No inline `toLocaleString`.
- Use Lucide icons only. No emoji icons.
- Use semantic token classes and shared components. No raw hex/rgb/hsl, arbitrary Tailwind values, or inline styles.
- Every data view needs loading, empty, error, and content states.
- RBAC controls use `can`, `requiresApproval`, `Can`, and the service layer. Owner can intervene; team roles see only their slice.

## Visual Direction
- Linear/Vercel-style enterprise operational UI.
- White light mode, jet-black dark mode, orange primary action/active state, purple as rare secondary highlight.
- Dense, calm, border-led surfaces. Avoid decorative gradients/glows.
- Machine data uses mono: IDs, GSTINs, money, cable codes, e-way bill numbers.

## Page Ownership
- `00-login.md` -> `app/(auth)/login/page.tsx`
- `01-dashboard.md` -> `app/(protected)/dashboard/page.tsx`
- `02-sales-board.md` -> `app/(protected)/sales/page.tsx`
- `03-quote-builder.md` -> `app/(protected)/quote/page.tsx` and `app/(protected)/quote/[quoteId]/page.tsx`
- `04-contacts.md` -> `app/(protected)/contacts/page.tsx`
- `05-compliance.md` -> `app/(protected)/compliance/page.tsx`
- `06-order-board.md` -> `app/(protected)/orders/page.tsx`
- `07-operator-card.md` -> `app/(protected)/job-card/page.tsx`
- `08-dispatch-checklist.md` -> `app/(protected)/dispatch/page.tsx`
- `09-invoice-readiness.md` -> `app/(protected)/accounting/page.tsx`
- `10-record-journey.md` -> `app/(protected)/records/[recordId]/page.tsx`
- `11-command-palette.md` -> `components/shell/CommandPalette.tsx` plus shell trigger wiring only when explicitly coordinated
- `12-approvals-inbox.md` -> `app/(protected)/approvals/page.tsx`
- `13-integrations-hub.md` -> `app/(protected)/integrations/page.tsx`
- `14-settings-admin.md` -> `app/(protected)/settings/page.tsx`

## Shared Foundation Owned By Main Agent
Page workers should not edit shared foundation files unless asked:
- `lib/domain/**`, `lib/seed/**`, `lib/adapters/**`, `lib/services/**`, `lib/integrations/**`, `lib/rbac/**`, `lib/store/**`
- `components/ui/**`, `components/domain/**`, `components/pipeline/**`, `components/shell/App*.tsx`
- `app/layout.tsx`, `app/(protected)/layout.tsx`, `app/page.tsx`, `app/globals.css`

If a page needs a missing shared component or service method, use the planned import/API and mention the gap in the final note.

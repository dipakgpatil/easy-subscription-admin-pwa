# Easy Subscription Admin PWA - Project Context

Last refreshed: 2026-08-16

Baseline before observability work: `ef2c4e4` - Add referral admin campaign tools
Open PRs checked: none

## Role

This is the React + TypeScript admin operations dashboard for Cravix. It lets an operator monitor the platform from one control tower: order search/intervention, zone load, live rider visibility, merchant payout reconciliation, and referral campaign controls.

## Important Note

The source is admin-specific: `src/App.tsx`, `src/features/observability`, `src/lib/api.ts`, `src/lib/types.ts`, public `admin-*` assets, and browser storage keys under `cravix-admin/*`.

## Stack

- React 19
- TypeScript
- Vite
- CSS in `src/App.css` and `src/index.css`
- Browser Google Identity Services when `VITE_GOOGLE_CLIENT_ID` is set

## Key Files

- `src/App.tsx`: full admin UI, tabs, auth, polling, filters, detail panes, forms.
- `src/lib/api.ts`: API wrapper and payload normalization.
- `src/lib/types.ts`: backend response types.
- `src/lib/storage.ts`: persisted admin session and active tab.
- `src/features/observability/ObservabilityView.tsx`: error, security, and login-country screens.
- `OBSERVABILITY.md`: frontend security, API contracts, and observability boundaries.
- `public/admin-logo.svg`, `public/admin-icon.svg`, `public/manifest.webmanifest`: PWA/admin branding.

## Backend Contracts

The app defaults to `https://easy-subscription-python-api-production.up.railway.app/api/v1` and calls:

- `/admin/auth/google/login`
- `/admin/auth/otp/request`
- `/admin/auth/otp/verify`
- `/admin/dashboard`
- `/admin/orders`
- `/admin/orders/stream`
- `/admin/orders/{woNo}`
- `/admin/orders/{woNo}/status`
- `/admin/riders` and `/admin/riders/live`
- `/admin/merchants/payouts`
- `/admin/merchants/{merchantUid}/payouts`
- `/admin/merchants/{merchantUid}/payouts/mark-paid`
- `/admin/referrals/config`
- `/admin/referrals/analytics`
- `/admin/referrals`
- `/admin/referrals/test`
- `/admin/referrals/wallet-credit`
- `/admin/observability/summary`
- `/admin/observability/events`
- `/telemetry/client-errors`

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

Use `.env` or `.env.local` with `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, and `VITE_ALLOW_MOCK_GOOGLE` as needed.

## Change Guidance

- Keep admin workflows dense and scannable; this is an ops tool, not a marketing page.
- When adding backend fields, update `src/lib/types.ts` and normalization helpers together.
- Mock Google fallback is development-only and disabled by default.
- Keep observability pages manually refreshed; do not add high-frequency polling that creates load or audit noise.
- Order alerts use a bearer-authenticated, fetch-backed Server-Sent Events reader. Do not replace it with native `EventSource` unless authentication moves to a secure same-origin cookie: `EventSource` cannot attach the session bearer header, and tokens must never be placed in a stream URL. The client reconnects with `Last-Event-ID`; its normal 15-second polling is the deliberate fallback.
- A `401 Unauthorized` from a normal admin request or the realtime stream clears the tab-scoped session and returns the operator to sign-in. Never leave an expired token in browser storage or make the operator hunt for a logout control.

## Cravix MCP sign-in (`/connect/mcp`)

The local Cravix MCP opens `/connect/mcp?redirect_uri=…&state=…&code_challenge=…`.
`src/features/mcp/mcpConnect.ts` keeps that request in sessionStorage so it survives
the Google sign-in redirect, and `McpConnectView` asks the administrator to Allow it.
Allow calls `POST /admin/auth/mcp/authorize` and sends the browser to the loopback
`redirect_uri` with a one-time code; Cancel sends `error=access_denied`. Only
`http://127.0.0.1|localhost:<port>/callback` is accepted, here and in the backend.
Never put the access token in that redirect.

## Zones & banners (`src/features/operations/OperationsView.tsx`)

Opens/closes each zone for ordering (with the message and optional opening time customers
see) and manages customer-app banners with start/expiry. Date inputs are the browser's local
time, converted to absolute ISO timestamps before they are sent.

## Merchants (`src/features/merchants/`)

List → workspace. `MerchantsView` lists merchants with setup gaps (no zone, empty menu, no
pickup location) and creates new ones; `MerchantWorkspace` has Menu, Profile & location and
Delivery zones sections. The Menu edits price override, prep time and availability inline,
adds products from a searchable catalog (`/admin/catalog/products/search`) or creates a new
one straight onto the menu. Provisioning upserts by email, so the create form refuses an email
that already belongs to a merchant. The Catalog tab now only creates products and reviews
merchant submissions.

## Orders (`src/features/orders/`)

`OrdersView` is a queue: it opens on **Open** orders, oldest first, with tabs and counts for
Needs attention, Completed, Cancelled and All, one search box (order #, customer, phone, email,
kitchen, rider) and Placed / Payment / Sort filters, all resolved by `GET /admin/orders`
(`statusGroup`, `attention`, `placedFrom`/`placedTo`, `paymentStatus`, `sort`). It refreshes the
open queue every 30 s while visible, and on the app's Refresh button or a new-order alert
(`refreshSignal`). Other screens open an order by setting the app's `selectedOrderNo`, which
`OrdersView` consumes once (`requestedOrderNo`), so a list refresh can no longer close it.

`OrderWorkspace` shows one order: a header with the key facts and call buttons, then one section
at a time: Overview (journey, issues linked to the section that fixes them, kitchen summary),
Kitchens (items, progress, next-step buttons), Delivery & rider (address, dispatch, rider,
assignment; riders load only when this opens), Customer & payment, and Activity (loaded on
demand). Shared formatting lives in `src/lib/format.ts`; the call button in
`src/lib/ContactAction.tsx`.

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

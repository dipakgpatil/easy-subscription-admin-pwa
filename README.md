# Cravix Admin PWA

React and TypeScript operations console for the Cravix food-delivery platform. Administrators can monitor orders and zones, manage rider assignments, reconcile merchant payouts, operate referral campaigns, and investigate application or security events.

## Stack

- React 19
- TypeScript
- Vite
- Caddy production server
- Google Identity Services for production administrator sign-in

## Local Setup

```bash
npm install
npm run dev
```

The app defaults to the production Railway API. Create `.env.local` to use another backend:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
VITE_GOOGLE_CLIENT_ID=
VITE_ALLOW_MOCK_GOOGLE=false
VITE_APP_VERSION=local
```

Mock Google profiles are disabled by default and must remain disabled in production. The API also forcibly disables mock Google identity when `ENVIRONMENT=production`.

## Main Screens

- Overview: operational totals and zone load
- Orders: search, detail, status intervention, and rider assignment
- Riders: availability and live location status
- Payouts: merchant balances and payout reconciliation
- Referrals: campaign configuration, analytics, and support tools
- Errors: backend, customer app, and admin PWA failures
- Security: rejected access, suspicious probes, rate limits, login trail, and country signals

Read [`OBSERVABILITY.md`](OBSERVABILITY.md) before changing telemetry or the security screens. The API repository's `OBSERVABILITY_AND_SECURITY.md` defines storage, retention, redaction, and scaling boundaries.

## Verification

```bash
npm run build
npm run lint
npm audit --audit-level=high
```

Production output is written to `dist/`.

## Railway Deployment

The checked-in `Dockerfile`, `Caddyfile`, and `railway.json` build and serve the PWA. Use `railway.variables.example.json` as the variable template. `VITE_*` values are embedded during the image build, so changing one requires a rebuild.

The Caddy content-security policy permits the default production API and Google Identity domains. If `VITE_API_BASE_URL` moves to another origin, add that exact HTTPS origin to `connect-src` in `Caddyfile` before deployment.

The production server applies CSP, HSTS, frame denial, restrictive browser permissions, immutable hashed-asset caching, and no-store caching for the application shell and service worker. Admin tokens use tab-scoped `sessionStorage`; telemetry never intentionally sends request bodies, tokens, OTPs, payment data, raw IPs, or stack traces.

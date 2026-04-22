# Easy Commerce Merchant PWA

React + TypeScript merchant dashboard for the Easy Commerce platform.

This first version is built for kitchen and vendor operations:

- receive merchant order alerts
- accept new orders
- move orders into preparation
- mark orders ready for rider pickup
- track handoff and completed history
- run as a light installable web dashboard or PWA

## Stack

- React 19
- TypeScript
- Vite
- browser notifications + vibration + local alert tone

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create an env file if you want a different backend:

```bash
cp .env.example .env
```

3. Start the dev server:

```bash
npm run dev
```

## Environment

`VITE_API_BASE_URL`

- defaults to the Railway API:
  `https://easy-subscription-python-api-production.up.railway.app/api/v1`

## Branding

The PWA now includes:

- a custom merchant app icon in `public/merchant-icon.svg`
- a matching wordmark in `public/merchant-logo.svg`
- manifest and favicon wiring for installable PWA use

## Demo login

The current dashboard uses seeded demo merchants so the operational flow can be tested immediately:

- `House Kitchen Demo`
- `Vendor Partner Demo`

These logins depend on the backend allowing mock Google profiles in the environment used for testing.

## Build

```bash
npm run build
```

Production files are emitted to `dist/`.

## Railway deployment

Yes, this PWA can be deployed on Railway.

This repo is already prepared for it with:

- `Dockerfile`
- `Caddyfile`
- `railway.json`
- `.dockerignore`

### Deploy steps

1. Create a new Railway service from the GitHub repo.
2. Leave the build and start commands empty so Railway uses `railway.json` and the root `Dockerfile`.
3. Set `VITE_API_BASE_URL` only if you want a different API target than the default Railway API.
4. Deploy.

The container builds the Vite app and serves the static PWA through Caddy.

### Backend auth note

If you are using the current demo merchant buttons, the backend API must allow mock Google profiles in the target environment:

- `ALLOW_MOCK_GOOGLE_LOGIN=true`

If you prefer production-style merchant auth, swap the demo buttons for real web Google sign-in and allow the merchant web client ID on the API service.

## Alerts

The dashboard polls the merchant dispatch feed and then:

- shows a spotlight card for the next pending order
- plays a local alert tone
- triggers vibration where the browser supports it
- can raise a browser notification when permission is granted

This is intentionally foreground-friendly for the first release. Real push delivery can be added later without changing the merchant API shape.

## Operational flow

1. Customer places one basket order.
2. Backend splits the basket into merchant-specific fulfillment work orders.
3. Merchant dashboard receives an alert for each merchant-owned child work order.
4. Merchant accepts and prepares.
5. Merchant marks ready.
6. Rider dispatch begins only after the order is ready.

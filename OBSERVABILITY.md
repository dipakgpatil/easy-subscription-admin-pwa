# Admin Observability Screens

Last updated: 2026-08-01

The admin PWA includes two admin-only views:

- **Errors**: backend and frontend failures with time, user or anonymous source, country signal, flow, endpoint, customer-visible message, request ID, duration, fingerprint, and integrity result.
- **Security**: invalid authentication, forbidden authorization, rate-limit triggers, suspicious path probes, production configuration warnings, successful login history, and country activity.

Data comes from `GET /admin/observability/summary` and `GET /admin/observability/events`. Filters are server-paginated and support request ID, user, flow, error, source, severity, and country. Country provenance is displayed because client locale and Railway edge location are estimates, not verified residence.

The admin PWA reports its own failed API requests, uncaught promises, window errors, and React render failures to `/telemetry/client-errors`. Error boundaries keep render failures from exposing internals. The reporter sends no token values, request bodies, payment data, or stack traces.

Security changes include a strict Caddy CSP/header policy, tab-scoped `sessionStorage` for the admin token, mock Google login disabled by default, service-worker cache rotation, and an audited dependency lockfile with zero known npm vulnerabilities at implementation time.

Read the API repository's `OBSERVABILITY_AND_SECURITY.md` for storage, redaction, retention, event buffering, geographic accuracy, and operational follow-up.

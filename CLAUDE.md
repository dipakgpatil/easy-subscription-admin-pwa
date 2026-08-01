# CLAUDE.md

Read `PROJECT_CONTEXT.md` and `OBSERVABILITY.md` first.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Conventions

- API contracts live in `src/lib/api.ts` and `src/lib/types.ts`.
- Main UI state and screens are currently centralized in `src/App.tsx`.
- Keep admin UI compact, operational, and filter-friendly.
- Verify backend route names against `easy-subscription-python-api/app/api/routes/admin.py` before changing calls.
- Never render or report raw tokens, request bodies, OTPs, payment data, raw IP addresses, or stack traces.

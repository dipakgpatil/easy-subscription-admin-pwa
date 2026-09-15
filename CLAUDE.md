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
- Newer screens live in `src/features/<name>/<Name>View.tsx` and fetch their own data; only older tabs
  go through the shared dashboard loader in `App.tsx`. Adding a tab means updating the `ViewTab` union,
  the stored-tab guard, the loader exclusion list, the nav pill list, and the render block.
- Search demand is at `src/features/search/SearchDemandView.tsx`; see
  `easy-subscription-python-api/SEARCH_DEMAND.md` for what the numbers mean.

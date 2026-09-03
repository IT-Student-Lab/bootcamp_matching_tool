# Live Matchmaker

Live audience matching tool for the Construsoft Bootcamp on 4 September 2026.

## Current status

- Next.js App Router and TypeScript scaffold
- M1 schema with private participant data, sanitized Realtime tables, RLS and atomic round locking
- Strict, idempotent XLSX seed importer
- M2 mobile form and transaction-backed `/api/submit`
- M3 round-based Sonnet matching and password-gated `/admin` clock
- M4 Realtime `/screen`, ranked reveal queue, force controls and offline fallback

Database deployment and seed verification still require a local checkout and Supabase credentials.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the required values.
3. Apply `supabase/migrations/202608300001_initial_schema.sql` to the Supabase project.
4. Apply `supabase/migrations/202608310001_near_misses.sql` to the same project.
5. Run `npm run seed` to import the newest `docs/survey_results_*.xlsx` export (add `-- --dry-run` to inspect it first).
6. Start the app with `npm run dev`.

Never commit `.env*`, API keys, passwords or connection strings. See `AGENTS.md` and `docs/technical-plan.md` before making implementation decisions.

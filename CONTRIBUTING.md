# Contributing

Thanks for your interest in improving Launchpad!

## Getting set up

1. Install Node 22 and PostgreSQL 16.
2. `npm install`
3. `cp .env.example .env.local` (defaults work against a local Postgres)
4. `npm run migrate` — creates the database, schema, RLS policies, and the `app_user` role
5. `npm run dev`

## Before opening a pull request

Please make sure the full check suite passes locally — this is exactly what CI runs:

```bash
npm run typecheck
npm test          # RLS isolation, RBAC, webhook idempotency, and the end-to-end flow
npm run build
```

The tests connect to Postgres as the non-superuser `app_user`, so they genuinely exercise
row-level security. If you touch `src/db/migrate.sql`, add or update a test that proves the
isolation guarantee still holds.

## Guidelines

- Keep the **control plane vs. data plane** boundary intact (see the README). New
  tenant-scoped tables should get an RLS policy and be queried through `withOrg`.
- Any new privileged action needs an entry in `src/lib/rbac.ts` and a server-side check.
- Prefer small, focused PRs with a clear description of the behavior change.

By contributing, you agree that your contributions will be licensed under the MIT License.

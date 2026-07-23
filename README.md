# Launchpad — Multi-Tenant SaaS Starter with Billing

A production-shaped starting point for a B2B SaaS: users belong to **organizations**,
each organization has **members with roles**, **Stripe subscription billing** with plan
limits, and — the part most starters get wrong — **tenant isolation enforced by the
database itself** using Postgres Row-Level Security, not by hoping every query remembers
a `WHERE org_id = ?`.

<p align="center">
  <img src="docs/demo.gif" alt="Signing in, switching organizations, hitting a plan limit, upgrading, and inviting a teammate" width="100%" />
  <br>
  <em>Organizations, RBAC, plan-gated limits, and one-click upgrade. (<a href="docs/demo.mp4">full-quality video</a>)</em>
</p>

## The problem this is built around

Every multi-tenant app has to answer one scary question: **can tenant A ever see tenant
B's data?** The usual answer is "as long as every query has the right `WHERE` clause" —
which is one forgotten filter, one clever `OR`, or one `JOIN` away from a cross-tenant
leak. This project takes that guarantee away from application code and gives it to
Postgres:

1. **Tenant isolation as a database invariant.** Data tables have **Row-Level Security**
   policies. Each request opens a transaction that sets `app.current_org`, and Postgres
   filters every read and write to that org automatically. A query with no `WHERE` clause
   returns only the active tenant's rows; with no context set, it returns **nothing**
   (fails closed). The app connects as a **non-superuser role** on purpose — superusers
   bypass RLS, so that detail is load-bearing.
2. **Roles that are actually enforced.** `owner` / `admin` / `member`, checked
   server-side on every privileged action, defined in one auditable table.
3. **Real billing that survives Stripe's delivery model.** Stripe sends webhooks
   **at least once** and retries on failure, so the same event arrives twice. The webhook
   handler is **idempotent** — dedup record and side effect commit in one transaction — so
   a redelivered "subscription updated" never double-applies.
4. **Plan limits that can't be bypassed.** Seat and project caps are enforced on the
   server inside the same transaction as the insert, so two concurrent creates can't both
   slip past the limit.

Each of these has a comment in the code explaining the *why*.

## Feature tour

- **Auth** — email/password with scrypt hashing (no external auth service), httpOnly
  session cookies storing only a hash of the token.
- **Organizations** — a user can belong to many; an org switcher changes the active tenant.
- **Members & invitations** — invite by email (unguessable link), change roles, remove
  members, with a guard that an org can never lose its last owner.
- **Billing** — Free / Pro / Enterprise plans, Stripe Checkout, the billing portal, and
  plan-gated limits on projects and seats.
- **Projects** — a simple tenant-scoped resource that demonstrates isolation and limits.

## Runs with zero setup: stub billing mode

Leave the Stripe keys blank and the app runs in **stub mode** — "upgrade" applies the plan
instantly with no charge, so the entire product is demo-able without a Stripe account. Add
test-mode keys and the exact same buttons drive real Stripe Checkout, the customer portal,
and signed webhooks. Nothing else in the app changes.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, Server Actions) + React 19 + TypeScript |
| Database | PostgreSQL with **Row-Level Security** |
| ORM | Drizzle (typed queries); schema + RLS live in one SQL migration |
| Billing | Stripe (Checkout + Billing Portal + webhooks), with a keyless stub mode |
| Auth | Hand-rolled sessions, scrypt password hashing (Node `crypto`) |
| Styling | Tailwind CSS v4 |
| Tests | Node's built-in test runner against a real Postgres |

## How tenant isolation actually works

```
Request ──▶ verify session ──▶ resolve membership (control plane, no RLS)
                                        │  "is this user allowed in org X?"
                                        ▼
                         withOrg(orgId, tx => …)          ┌────────────────────────┐
                         ├─ SET LOCAL app.current_org ───▶│ Postgres RLS policy:    │
                         └─ run tenant queries in tx      │  org_id = current_org   │
                                                          └────────────────────────┘
     Control plane (app-enforced):  users, sessions, organizations, memberships
     Data plane (DB-enforced RLS):  projects, invitations, subscriptions
```

The **control plane** answers "who are you and which orgs may you enter" and is queried
across orgs (the org switcher needs every org you belong to), so it's guarded by app code.
The **data plane** is only ever queried *inside* a chosen org context, so it's guarded by
RLS. `src/db/migrate.sql` is the source of truth for both the schema and the policies.

## The hardest decisions

### 1. Row-Level Security, and the non-superuser role it requires
The policy is `org_id = NULLIF(current_setting('app.current_org', true), '')::uuid`. Two
subtleties made this real work:
- **The app must not connect as a superuser or the table owner** — both *bypass* RLS
  entirely, which would make every policy silently useless. The migration creates a
  dedicated non-superuser `app_user` role that the app connects as. (`docker-compose` and
  CI both wire this up.)
- **`NULLIF(..., '')` is load-bearing.** After a `SET LOCAL` transaction commits, a custom
  GUC reverts to an *empty string*, not NULL, on the pooled connection. Casting `''::uuid`
  throws `invalid input syntax for type uuid`; `NULLIF` turns it back into NULL so an unset
  context matches no rows. This was found by a test, not by reading docs.

### 2. Idempotent Stripe webhooks
`src/lib/services/webhook.ts` runs the dedup insert (`processed_webhook_events`, ON
CONFLICT DO NOTHING) and the subscription update **in one transaction**. If the insert
loses the race, the effect is skipped; otherwise both commit together. There's no window
where the event is marked processed but the effect didn't apply, or vice versa — so
Stripe's retries are safe.

### 3. Where the tenant boundary sits
Not everything can be behind RLS: the org switcher must list every org you belong to, which
is inherently a cross-tenant query. So `organizations` and `memberships` are control-plane
(app-enforced), while the actual business data (`projects`), config (`subscriptions`), and
`invitations` are RLS-enforced. Invite acceptance is a deliberate exception — it opens the
org context named inside an unguessable token, because the user isn't a member yet.

### 4. Plan limits under concurrency
`createProject` counts existing rows and inserts **in the same transaction**, so two
simultaneous creates can't both read "2 of 3" and both succeed. The limit holds at the
database, matching where isolation is enforced.

## Verifying it yourself

The tests run against a **real** Postgres as the RLS-subject `app_user` — no mocks:

```bash
npm run migrate   # creates the DB, schema, RLS policies, and app_user
npm test
```

They assert: a tenant sees only its own rows; a `SELECT` with no `WHERE` still leaks
nothing; an unset context returns zero rows; a cross-tenant write is rejected by the
policy; RBAC allows/forbids the right actions; a redelivered webhook applies exactly once;
and the end-to-end flow (org → plan limits → invite → accept → upgrade) behaves.

## Running locally

Requires Node 22 and PostgreSQL (`brew install postgresql@16 && brew services start
postgresql@16`).

```bash
npm install
cp .env.example .env.local     # defaults work against a local Postgres
npm run migrate                # schema + RLS + app_user
npm run seed                   # optional demo data → demo@launchpad.dev / password123
npm run dev                    # http://localhost:3000
```

### With real Stripe (test mode)

1. Put your test-mode `STRIPE_SECRET_KEY` and two recurring price ids
   (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`) in `.env.local`.
2. Forward webhooks and set the signing secret:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   # copy the whsec_… into STRIPE_WEBHOOK_SECRET
   ```

## Docker

```bash
docker compose up --build
```

Brings up Postgres and the app (in stub billing mode), runs the migration automatically,
and serves on http://localhost:3000.

## What I'd change at 10x scale

- **Session/plan caching.** `org.plan` is already a cached column; at scale the session
  and membership lookups would move behind a short-TTL cache to cut per-request DB round
  trips.
- **Connection pooling for RLS.** `SET LOCAL` per transaction is correct but ties context
  to a connection; a transaction-mode pooler (PgBouncer) needs care so the GUC never
  outlives its transaction. The `NULLIF` fail-closed behavior is the safety net.
- **Outbox for Stripe calls.** Today checkout/portal calls Stripe inline; at scale I'd
  enqueue outbound Stripe operations so a Stripe outage can't fail a user request.
- **Audit log.** Every role change and billing event should be appended to an immutable
  per-tenant audit trail.

## License

MIT

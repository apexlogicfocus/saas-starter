-- ============================================================================
-- Multi-tenant SaaS schema + Postgres Row-Level Security.
--
-- This file is the source of truth for the database. It is idempotent, so
-- `npm run migrate` can be run repeatedly. It is executed by an ADMIN role
-- (the DB owner) which creates a NON-superuser `app_user` role that the running
-- application connects as. That distinction is critical: superusers and table
-- owners BYPASS row-level security, so if the app connected as one, every RLS
-- policy below would be silently ineffective. The app MUST connect as a plain,
-- non-owning role for tenant isolation to actually hold.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ── Identity / control plane (no RLS) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  slug               text NOT NULL UNIQUE,
  stripe_customer_id text UNIQUE,
  plan               text NOT NULL DEFAULT 'free',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- ── Tenant data / config (RLS-protected) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'member',
  token       text NOT NULL UNIQUE,
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id        text,
  plan                   text NOT NULL DEFAULT 'free',
  status                 text NOT NULL DEFAULT 'active',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_apply_counts (
  key   text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS projects_org_idx ON projects(org_id);
CREATE INDEX IF NOT EXISTS invitations_org_idx ON invitations(org_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- CONTROL PLANE (no RLS): users, sessions, organizations, memberships. These
-- answer "who are you and which orgs may you enter" and are queried across orgs
-- (e.g. the org switcher lists every org you belong to), so app code enforces
-- access. DATA PLANE (RLS below): projects, invitations, subscriptions — only
-- ever queried inside a chosen org context.
--
-- The app sets `app.current_org` once per request (SET LOCAL, inside a tx).
-- current_setting(..., true) returns NULL when unset, so with no context the
-- policies match no rows: isolation FAILS CLOSED. There is no way to widen the
-- result set from application SQL — a forgotten WHERE clause leaks nothing.

DO $$
DECLARE
  t text;
  org_col text;
BEGIN
  FOR t, org_col IN
    SELECT * FROM (VALUES
      ('invitations',   'org_id'),
      ('subscriptions', 'org_id'),
      ('projects',      'org_id')
    ) AS v(tbl, col)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- NULLIF(..., '') is load-bearing: after a `SET LOCAL` transaction commits,
    -- a custom GUC reverts to EMPTY STRING (not NULL) on the pooled connection.
    -- Casting ''::uuid throws "invalid input syntax for type uuid"; NULLIF turns
    -- it back into NULL so an unset context matches no rows (fails closed).
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (%I = NULLIF(current_setting(''app.current_org'', true), '''')::uuid) WITH CHECK (%I = NULLIF(current_setting(''app.current_org'', true), '''')::uuid)',
      t, org_col, org_col
    );
  END LOOP;
END $$;

-- ── Application role (non-superuser, non-owner → subject to RLS) ─────────────
-- Password comes from :app_password (psql variable) so it is never hardcoded.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user LOGIN PASSWORD %L', :'app_password');
  ELSE
    EXECUTE format('ALTER ROLE app_user LOGIN PASSWORD %L', :'app_password');
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

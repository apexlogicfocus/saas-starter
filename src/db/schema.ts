import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// Identity / control plane — NOT tenant-scoped.
// A user is a single global identity that can belong to many organizations, so
// these tables are read/written OUTSIDE any tenant context and have no RLS.
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // opaque random token, stored hashed
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenants and membership (control plane).
// memberships is the authority on "which orgs may this user enter" — the app
// checks it BEFORE opening a tenant context, so it is queried by user_id across
// orgs and therefore also lives outside RLS.
// ─────────────────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  // Cached plan for fast gating; the subscriptions row is the source of truth.
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | admin | member
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("memberships_org_user_unique").on(t.orgId, t.userId)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Tenant DATA + CONFIG — RLS-protected. Every row belongs to exactly one org,
// and Postgres row-level security makes it impossible to read another org's
// rows once a tenant context is set (see src/db/rls.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" })
    .unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan").notNull().default("free"), // free | pro | enterprise
  status: text("status").notNull().default("active"), // active | trialing | past_due | canceled | incomplete
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The tenant-scoped resource used to demonstrate isolation and plan limits.
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook idempotency. Stripe delivers each event AT LEAST once and
// retries on any non-2xx, so a handler will occasionally see the same event
// twice. We record every processed event id and skip repeats.
// ─────────────────────────────────────────────────────────────────────────────

export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: text("id").primaryKey(), // Stripe event id (evt_...)
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

// A tiny counter table used to prove webhook idempotency in tests without Stripe.
export const webhookApplyCounts = pgTable("webhook_apply_counts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Project = typeof projects.$inferSelect;

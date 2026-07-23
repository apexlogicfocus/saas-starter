import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// The app connects as `app_user` (DATABASE_URL) — a non-superuser role that is
// SUBJECT to the row-level security policies. See src/db/migrate.sql for why
// that role separation is load-bearing.
const connectionString =
  process.env.DATABASE_URL ??
  "postgres://app_user:app_password@localhost:5432/saas_starter";

// Reuse one client across hot reloads in dev (Next re-imports modules).
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

export const client =
  globalForDb.pgClient ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });

export type DB = typeof db;

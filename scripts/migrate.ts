/**
 * Applies src/db/migrate.sql using an ADMIN (owner/superuser) connection.
 *
 * Two connections are involved by design:
 *   ADMIN_DATABASE_URL — owner role; creates the database, tables, RLS policies,
 *                        and the non-superuser `app_user` role.
 *   DATABASE_URL       — app_user; what the running app uses (subject to RLS).
 *
 * Run directly with psql instead if you prefer:
 *   psql "$ADMIN_DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f src/db/migrate.sql
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DB_PASSWORD = process.env.APP_DB_PASSWORD ?? "app_password";
const DB_NAME = process.env.DB_NAME ?? "saas_starter";
// Admin URL points at a maintenance DB (default "postgres") for CREATE DATABASE.
const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://localhost:5432/postgres";

function escapeLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  // 1. Create the application database if it does not exist (no tx allowed).
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    const exists =
      await admin`SELECT 1 FROM pg_database WHERE datname = ${DB_NAME}`;
    if (exists.length === 0) {
      await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
      console.log(`created database ${DB_NAME}`);
    } else {
      console.log(`database ${DB_NAME} already exists`);
    }
  } finally {
    await admin.end();
  }

  // 2. Apply schema + RLS to the application database.
  const appAdminUrl = new URL(ADMIN_URL);
  appAdminUrl.pathname = `/${DB_NAME}`;
  const conn = postgres(appAdminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    let ddl = readFileSync(join(__dirname, "../src/db/migrate.sql"), "utf8");
    // Substitute the psql variable ourselves so the file runs without psql.
    ddl = ddl.replaceAll(":'app_password'", `'${escapeLiteral(APP_DB_PASSWORD)}'`);
    await conn.unsafe(ddl).simple();
    console.log("schema + RLS applied");
  } finally {
    await conn.end();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

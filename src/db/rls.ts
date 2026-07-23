import { sql } from "drizzle-orm";
import { db } from "./index";

// The exact transaction type Drizzle hands to a db.transaction callback.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction scoped to a single tenant.
 *
 * `set_config(..., true)` sets `app.current_org` as a LOCAL setting — it exists
 * only for the duration of this transaction and is automatically discarded at
 * COMMIT/ROLLBACK, so it can never leak into a pooled connection's next user.
 * Every RLS policy reads this GUC, so all queries inside `fn` see exactly one
 * org's rows, enforced by Postgres itself.
 *
 * IMPORTANT: only call this after verifying (via the memberships table) that the
 * current user actually belongs to `orgId`. RLS protects the DATA plane; the
 * membership check is the CONTROL plane that decides which context you may open.
 */
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}

// Role-based access control. Three roles, ordered by power. Every privileged
// action names the minimum role it requires; the check is enforced on the
// server (in server actions / route handlers), never trusted from the client.

export type Role = "owner" | "member" | "admin";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function atLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

// Capability → minimum role. Keeping this as a table makes the policy auditable
// in one place instead of scattered `if (role === ...)` checks.
export const REQUIRES: Record<string, Role> = {
  "project:create": "member",
  "project:delete": "admin",
  "member:invite": "admin",
  "member:remove": "admin",
  "member:changeRole": "owner",
  "billing:manage": "owner",
  "org:delete": "owner",
};

export function can(role: Role, capability: keyof typeof REQUIRES): boolean {
  const required = REQUIRES[capability];
  return required ? atLeast(role, required) : false;
}

export class ForbiddenError extends Error {
  constructor(capability: string) {
    super(`Forbidden: requires ${REQUIRES[capability] ?? "higher"} role`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, capability: keyof typeof REQUIRES): void {
  if (!can(role, capability)) throw new ForbiddenError(capability);
}

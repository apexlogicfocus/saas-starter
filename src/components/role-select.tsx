"use client";

import { setRole } from "@/app/actions/members";
import type { Role } from "@/lib/rbac";

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  return (
    <form action={setRole} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        className="input text-xs py-1"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
        <option value="owner">Owner</option>
      </select>
    </form>
  );
}

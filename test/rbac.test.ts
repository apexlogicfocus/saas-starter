import { test } from "node:test";
import assert from "node:assert/strict";
import { can, atLeast, assertCan, ForbiddenError } from "@/lib/rbac";

test("role ranking is ordered member < admin < owner", () => {
  assert.ok(atLeast("owner", "admin"));
  assert.ok(atLeast("admin", "member"));
  assert.ok(!atLeast("member", "admin"));
  assert.ok(!atLeast("admin", "owner"));
});

test("members can create projects but not manage billing or members", () => {
  assert.ok(can("member", "project:create"));
  assert.ok(!can("member", "project:delete"));
  assert.ok(!can("member", "member:invite"));
  assert.ok(!can("member", "billing:manage"));
});

test("admins can invite/remove members but not change roles or manage billing", () => {
  assert.ok(can("admin", "member:invite"));
  assert.ok(can("admin", "member:remove"));
  assert.ok(can("admin", "project:delete"));
  assert.ok(!can("admin", "member:changeRole"));
  assert.ok(!can("admin", "billing:manage"));
});

test("owners can do everything gated", () => {
  assert.ok(can("owner", "billing:manage"));
  assert.ok(can("owner", "member:changeRole"));
  assert.ok(can("owner", "org:delete"));
});

test("assertCan throws ForbiddenError when not permitted", () => {
  assert.throws(() => assertCan("member", "billing:manage"), ForbiddenError);
  assert.doesNotThrow(() => assertCan("owner", "billing:manage"));
});

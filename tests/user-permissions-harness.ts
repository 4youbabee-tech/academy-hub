import assert from "node:assert/strict";

import { baseFields } from "../src/lib/db";
import { canUser, DEFAULT_WORKER_PERMISSIONS } from "../src/lib/permissions";
import type { User } from "../src/lib/types";

const owner: User = {
  ...baseFields(),
  username: "main.manager",
  full_name: "المدير الرئيسي",
  password_hash: "hash",
  role: "owner",
  is_active: true,
};
const worker: User = {
  ...baseFields(),
  username: "worker",
  full_name: "عامل",
  password_hash: "hash",
  role: "worker",
  is_active: true,
  permissions: [...DEFAULT_WORKER_PERMISSIONS],
};
const customWorker: User = {
  ...worker,
  id: `${worker.id}-custom`,
  username: "custom.worker",
  permissions: ["students.view", "reports.view", "system.reset"],
};

assert.equal(canUser(owner, "system.reset"), true, "main manager must always have every permission");
assert.equal(canUser(owner, "reports.view"), true, "main manager must always see reports");
assert.equal(canUser(worker, "students.view"), true, "default worker should see students");
assert.equal(canUser(worker, "finance.pay"), true, "default worker should be able to collect payments");
assert.equal(canUser(worker, "reports.view"), false, "default worker must not see reports");
assert.equal(canUser(worker, "system.reset"), false, "default worker must not reset data");
assert.equal(canUser(worker, "users.update"), false, "default worker must not manage users");
assert.equal(canUser(customWorker, "reports.view"), true, "explicit report permission must be honored");
assert.equal(canUser(customWorker, "system.reset"), true, "explicit reset permission must be honored");
assert.equal(canUser({ ...customWorker, is_active: false }, "reports.view"), false, "inactive users must have no permissions");

console.log("user-permissions-harness: OK");

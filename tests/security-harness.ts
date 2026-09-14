import assert from "node:assert/strict";
import { emptyDb, initializeOwner, replaceDb, snapshot, verifyPassword } from "../src/lib/db";

Object.assign(globalThis, {
  window: {
    academyDesktop: {
      database: {
        load: async () => undefined,
        save: async () => ({ saved: true }),
        getPage: async () => ({ rows: [], total: 0 }),
      },
    },
  },
});

replaceDb(emptyDb());
assert.equal(snapshot()?.users.length, 0, "fresh database must not contain default credentials");

await assert.rejects(
  () => initializeOwner({ username: "ow", full_name: "Owner", password: "short1" }),
  /اسم المستخدم|كلمة المرور/,
);
assert.equal(snapshot()?.users.length, 0);

const ownerId = await initializeOwner({
  username: "academy.owner",
  full_name: "مالك المركز",
  password: "SecurePass2026",
});
const owner = snapshot()?.users.find((user) => user.id === ownerId);
assert.ok(owner, "owner must be created");
assert.equal(owner?.role, "owner");
assert.equal(owner?.is_active, true);
assert.notEqual(owner?.password_hash, "SecurePass2026");
assert.equal(await verifyPassword("SecurePass2026", owner!.password_hash), true);
assert.equal(await verifyPassword("wrong-password", owner!.password_hash), false);
await assert.rejects(
  () => initializeOwner({ username: "second.owner", full_name: "مالك ثان", password: "AnotherPass2026" }),
  /مسبقًا/,
  "first-run initializer must never create a second owner after setup",
);

console.log("security-harness: OK");

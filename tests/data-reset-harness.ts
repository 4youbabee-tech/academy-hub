import assert from "node:assert/strict";

import { baseFields, emptyDb } from "../src/lib/db";
import { buildOperationalResetSnapshot } from "../src/lib/data-reset";
import { money } from "../src/lib/format";
import type { User } from "../src/lib/types";

const db = emptyDb();
const owner: User = {
  ...baseFields(),
  username: "owner",
  full_name: "مالك الاختبار",
  password_hash: "hash",
  role: "owner",
  is_active: true,
};
const accountant: User = {
  ...baseFields(),
  username: "accountant",
  full_name: "المحاسب",
  password_hash: "hash",
  role: "accountant",
  is_active: true,
};
db.users.push(owner, accountant);
db.settings.institute_name = "مركز محفوظ";
db.settings.logo_data_url = "data:image/png;base64,AAAA";
db.settings.student_code_next = 44;
db.settings.receipt_next = 77;
db.settings.payroll_receipt_next = 33;
db.settings.monthly_generation_last_period = "2026-09";
db.expense_categories = ["إيجار", "كهرباء"];
db.audit_log.push({
  ...baseFields(),
  user_id: owner.id,
  user_name: owner.full_name,
  entity: "test",
  entity_id: null,
  action: "before-reset",
  detail: "سجل قديم يجب أن يبقى",
  at: new Date().toISOString(),
});

const operationalCollections = [
  "students",
  "courses",
  "classes",
  "enrollments",
  "invoices",
  "installments",
  "payments",
  "employees",
  "payroll_items",
  "payroll_payments",
  "advances",
  "expenses",
  "incomes",
] as const;
for (const key of operationalCollections) db[key].push({} as never);

assert.throws(
  () => buildOperationalResetSnapshot(db, accountant.id),
  /مالك النظام/,
  "non-owner must never be allowed to wipe operational data",
);

const reset = buildOperationalResetSnapshot(db, owner.id);
for (const key of operationalCollections) {
  assert.equal(reset[key].length, 0, `${key} must be cleared`);
}
assert.equal(reset.users.length, 2, "users must be preserved");
assert.equal(reset.users[0]?.id, owner.id, "owner identity must be preserved");
assert.equal(reset.settings.institute_name, "مركز محفوظ", "institute settings must be preserved");
assert.equal(reset.settings.logo_data_url, "data:image/png;base64,AAAA", "logo must be preserved");
assert.deepEqual(reset.expense_categories, ["إيجار", "كهرباء"], "expense categories must be preserved");
assert.equal(reset.settings.student_code_next, 1, "student numbering must restart");
assert.equal(reset.settings.receipt_next, 1, "receipt numbering must restart");
assert.equal(reset.settings.payroll_receipt_next, 1, "payroll receipt numbering must restart when configured");
assert.equal(reset.settings.monthly_generation_last_period, null, "monthly generator checkpoint must reset");
assert.equal(reset.audit_log.length, 2, "previous audit history plus reset entry must remain");
assert.equal(reset.audit_log[0]?.action, "reset-operational-data", "reset must be audited");

const integerMoney = money(2000, "USD");
const halfDollarMoney = money(2050, "USD");
const fiveCentMoney = money(2005, "USD");
assert.equal(integerMoney.includes("٫"), false, "whole amounts must not display decimal zeros");
assert.equal(halfDollarMoney.includes("٫"), true, "fractional amounts must display decimals");
assert.match(halfDollarMoney, /٥٠\s+USD$/, "50 cents must display two digits");
assert.match(fiveCentMoney, /٠٥\s+USD$/, "5 cents must display as 05, not 5");

console.log("data-reset-harness: OK");

import assert from "node:assert/strict";
import { baseFields, emptyDb, hashPassword, insert, isLegacyPasswordHash, remove, replaceDb, snapshot, update, verifyPassword } from "../src/lib/db";
import {
  cancelEnrollmentWithInvoice,
  createEnrollmentWithInvoice,
  invoiceBalance,
  invoiceFinancials,
  payrollItemCost,
  profitAndLoss,
  recordExpense,
  recordIncome,
  recordPayment,
  studentBalance,
  voidExpense,
  voidIncome,
  voidPayment,
} from "../src/lib/finance";
import { generatePayroll, payPayrollItem, recordAdvance } from "../src/lib/payroll";
import { localDateKey } from "../src/lib/format";

process.env.TZ = "Asia/Beirut";
assert.equal(localDateKey("2026-08-22T21:30:00.000Z"), "2026-08-23", "local accounting date");

const newHashA = await hashPassword("secret-123");
const newHashB = await hashPassword("secret-123");
assert.notEqual(newHashA, newHashB, "salted hashes must differ");
assert.equal(isLegacyPasswordHash(newHashA), false);
assert.equal(await verifyPassword("secret-123", newHashA), true);
assert.equal(await verifyPassword("wrong", newHashA), false);
const legacyBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("inst::legacy-pass"));
const legacyHash = Array.from(new Uint8Array(legacyBuffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
assert.equal(isLegacyPasswordHash(legacyHash), true);
assert.equal(await verifyPassword("legacy-pass", legacyHash), true);
assert.equal(await verifyPassword("wrong", legacyHash), false);

const ownerActor = { id: "owner-1", name: "مالك" };
const directorActor = { id: "director-1", name: "مدير" };
const db = emptyDb();

db.users.push(
  {
    ...baseFields(), id: ownerActor.id, username: "owner", full_name: ownerActor.name,
    password_hash: "x", role: "owner", is_active: true,
  },
  {
    ...baseFields(), id: directorActor.id, username: "director", full_name: directorActor.name,
    password_hash: "x", role: "director", is_active: true,
  },
);
db.students.push({
  ...baseFields(), id: "student-1", code: "ST-1", full_name: "طالب اختبار", birth_date: null,
  gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "", address: "",
  education_level: null, status: "active", archived_at: null, notes: "",
});
db.courses.push(
  { ...baseFields(), id: "course-1", name: "دورة 1", code: "C1", level: "", hours: 1, default_price: 32_000, active: true },
  { ...baseFields(), id: "course-2", name: "دورة 2", code: "C2", level: "", hours: 1, default_price: 32_000, active: true },
);
db.classes.push({
  ...baseFields(), id: "class-1", name: "صف", course_id: "course-1", teacher_id: null,
  term: "", capacity: 20, start_date: "2026-08-01", end_date: "2026-09-01", schedule: [], status: "running",
});
db.employees.push({
  ...baseFields(), id: "employee-1", full_name: "موظف", kind: "staff", job_title: "إداري",
  phone: "", hired_at: "2026-01-01", ended_at: null, base_salary: 50_000, active: true,
});
replaceDb(db);

createEnrollmentWithInvoice({
  student_id: "student-1",
  class_id: "class-1",
  price: 32_000,
  discount: 0,
  discount_reason: "اختبار",
  installments: [{ due_date: "2026-08-23", amount: 32_000 }],
}, ownerActor);

let current = snapshot()!;
const invoice = current.invoices[0]!;
assert.equal(invoiceBalance(current, invoice.id), 32_000);

const payment20 = recordPayment({ invoice_id: invoice.id, amount: 2_000, method: "cash", note: "دفعة 20" }, ownerActor);
current = snapshot()!;
assert.equal(invoiceBalance(current, invoice.id), 30_000);

const payment100 = recordPayment({ invoice_id: invoice.id, amount: 10_000, method: "cash", note: "دفعة 100" }, ownerActor);
current = snapshot()!;
assert.equal(invoiceBalance(current, invoice.id), 20_000);
assert.deepEqual(
  current.payments.find((payment) => payment.id === payment100) && {
    paid: current.payments.find((payment) => payment.id === payment100)!.paid_after_snapshot,
    due: current.payments.find((payment) => payment.id === payment100)!.due_after_snapshot,
  },
  { paid: 12_000, due: 20_000 },
);
assert.throws(
  () => recordPayment({ invoice_id: invoice.id, amount: 20_001, method: "cash" }, ownerActor),
  /يتجاوز رصيد الفاتورة/,
);
assert.throws(
  () => remove("payments", payment20, ownerActor, "حذف مباشر"),
  /السجلات المالية لا تُنشأ أو تُعدّل أو تُحذف مباشرة/,
);
assert.throws(
  () => update("invoices", invoice.id, { total: 1 }, ownerActor, "تعديل مباشر"),
  /السجلات المالية لا تُنشأ أو تُعدّل أو تُحذف مباشرة/,
);

assert.throws(
  () => update("students", "student-1", { status: "archived" }, ownerActor, "أرشفة"),
  /تسجيلًا نشطًا/,
);
assert.throws(
  () => update("classes", "class-1", { course_id: "course-2" }, ownerActor, "تغيير دورة"),
  /لا يمكن تغيير دورة الصف/,
);

voidPayment(payment100, "اختبار", ownerActor);
current = snapshot()!;
assert.equal(invoiceBalance(current, invoice.id), 30_000);
assert.deepEqual(studentBalance(current, "student-1"), { billed: 32_000, paid: 2_000, due: 30_000 });
const paymentAccountingDate = localDateKey(current.payments.find((payment) => payment.id === payment20)!.paid_at);
assert.equal(profitAndLoss(current, paymentAccountingDate, paymentAccountingDate).tuition, 2_000);

voidPayment(payment20, "إلغاء التسجيل", ownerActor);
cancelEnrollmentWithInvoice(current.enrollments[0]!.id, ownerActor);
current = snapshot()!;
assert.deepEqual(invoiceFinancials(current, invoice.id), { total: 32_000, paid: 0, due: 0, status: "cancelled" });
assert.deepEqual(studentBalance(current, "student-1"), { billed: 0, paid: 0, due: 0 });

update("students", "student-1", { status: "archived", archived_at: new Date().toISOString() }, ownerActor, "أرشفة");
assert.equal(snapshot()!.students[0]!.status, "archived");

assert.throws(
  () => update("users", directorActor.id, { role: "owner" }, directorActor, "ترقية"),
  /للمالك فقط/,
);
assert.throws(() => remove("users", ownerActor.id, directorActor, "حذف"), /للمالك فقط/);
assert.throws(() => remove("users", ownerActor.id, ownerActor, "حذف"), /آخر مالك/);
assert.throws(
  () => update("users", ownerActor.id, { is_active: false }, ownerActor, "تعطيل"),
  /آخر مالك نشط/,
);
assert.throws(
  () => insert("users", {
    username: "owner2", full_name: "مالك 2", password_hash: "x", role: "owner", is_active: true, employee_id: null,
  }, directorActor, "إنشاء مالك"),
  /للمالك فقط/,
);

recordAdvance("employee-1", 10_000, "سلفة آب", ownerActor, "2026-08-05");
generatePayroll("2026-08", ownerActor);
recordAdvance("employee-1", 5_000, "سلفة أيلول", ownerActor, "2026-09-05");
current = snapshot()!;
const payroll = current.payroll_items[0]!;
assert.equal(payroll.net, 40_000);
assert.equal(payrollItemCost(payroll), 50_000);
payPayrollItem(payroll.id, ownerActor);
current = snapshot()!;
assert.equal(current.advances.find((advance) => advance.reason === "سلفة آب")!.settled, true);
assert.equal(current.advances.find((advance) => advance.reason === "سلفة أيلول")!.settled, false);
const payrollAccountingDate = localDateKey(current.payroll_items.find((item) => item.id === payroll.id)!.paid_at!);
assert.equal(profitAndLoss(current, "2026-08-01", payrollAccountingDate).payroll, 50_000);

assert.throws(() => insert("expenses", {
  category: "ممنوع", amount: 100, date: "2026-08-10", note: "", user_id: ownerActor.id, is_void: false,
}, ownerActor, "إنشاء مباشر"), /لا تُنشأ أو تُعدّل أو تُحذف مباشرة/);
const expenseId = recordExpense({ category: "كهرباء", amount: 5_000, date: "2026-08-10", note: "اختبار" }, ownerActor);
assert.throws(() => voidExpense(expenseId, ownerActor, ""), /سبب الإلغاء إلزامي/);
voidExpense(expenseId, ownerActor, "تكرار إدخال");
current = snapshot()!;
assert.equal(profitAndLoss(current, "2026-08-01", "2026-08-31").expenses, 0);

const incomeId = recordIncome({ source: "دخل تجريبي", amount: 7_000, date: "2026-08-10", note: "اختبار" }, ownerActor);
assert.throws(() => voidIncome(incomeId, ownerActor, ""), /سبب الإلغاء إلزامي/);
voidIncome(incomeId, ownerActor, "قيد خاطئ");
current = snapshot()!;
assert.equal(profitAndLoss(current, "2026-08-01", "2026-08-31").otherIncome, 0);

console.log("Academy Hub domain scenarios: PASS");
process.exit(0);

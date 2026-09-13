import assert from "node:assert/strict";
import { baseFields, emptyDb, replaceDb, snapshot } from "../src/lib/db";
import {
  createEnrollmentWithInvoice,
  createMonthlyEnrollmentWithInvoice,
  generateMonthlyStudentCharges,
  transitionLegacyEnrollmentToMonthly,
  updateMonthlyEnrollmentTerms,
  profitAndLoss,
  recordPayment,
  studentMonthlyLedger,
} from "../src/lib/finance";
import { today } from "../src/lib/format";
import { runMonthlyGeneration } from "../src/lib/monthly";
import {
  generatePayroll,
  payrollPaid,
  payrollRemaining,
  recordAdvance,
  recordPayrollPayment,
  voidPayrollPayment,
} from "../src/lib/payroll";

const actor = { id: "owner-monthly", name: "مالك الاختبار" };
const currentPeriod = today().slice(0, 7);
function nextPeriod(period: string): string {
  const parts = period.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

const next = nextPeriod(currentPeriod);
const next2 = nextPeriod(next);
const next3 = nextPeriod(next2);
const db = emptyDb();
db.users.push({
  ...baseFields(), id: actor.id, username: "owner-monthly", full_name: actor.name,
  password_hash: "x", role: "owner", is_active: true,
});
db.students.push({
  ...baseFields(), id: "student-monthly", code: "ST-M", full_name: "طالب شهري", birth_date: null,
  gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "أم الطالب",
  school_name: "مدرسة الاختبار", address: "", education_level: null, status: "active", archived_at: null, notes: "",
});
db.courses.push({
  ...baseFields(), id: "course-monthly", name: "2026-2027", code: "AY", level: "", hours: 1,
  default_price: 10_000, active: true,
});
db.classes.push({
  ...baseFields(), id: "class-monthly", name: "الصف A", course_id: "course-monthly", teacher_id: null,
  term: "", capacity: 30, start_date: `${currentPeriod}-01`, end_date: `${next}-28`, schedule: [], status: "running",
});
db.employees.push({
  ...baseFields(), id: "employee-monthly", full_name: "موظف شهري", kind: "staff", job_title: "إداري",
  phone: "", hired_at: `${currentPeriod}-01`, ended_at: null, base_salary: 40_000, active: true,
});
replaceDb(db);

createMonthlyEnrollmentWithInvoice({
  student_id: "student-monthly",
  class_id: "class-monthly",
  monthly_price: 10_000,
  discount: 2_000,
  discount_preset_id: "discount-sibling",
  discount_title: "خصم إخوة",
  start_period: currentPeriod,
}, actor);

let current = snapshot()!;
assert.equal(current.enrollments[0]!.billing_mode, "monthly");
assert.equal(current.enrollments[0]!.monthly_price_snapshot, 8_000);
assert.equal(current.installments.filter((item) => item.kind === "monthly").length, 1);
const invoice = current.invoices[0]!;
recordPayment({ invoice_id: invoice.id, amount: 5_000, method: "cash" }, actor);
current = snapshot()!;
let ledger = studentMonthlyLedger(current, "student-monthly");
assert.deepEqual(ledger.map((row) => [row.period, row.amount, row.paid, row.due]), [[currentPeriod, 8_000, 5_000, 3_000]]);

const firstGeneration = generateMonthlyStudentCharges(next, actor);
assert.equal(firstGeneration.created, 1);
const secondGeneration = generateMonthlyStudentCharges(next, actor);
assert.equal(secondGeneration.created, 0, "same student/month must never duplicate");
current = snapshot()!;
assert.equal(current.installments.filter((item) => item.kind === "monthly").length, 2);
assert.equal(current.invoices[0]!.total, 16_000);

recordPayment({ invoice_id: invoice.id, amount: 4_000, method: "cash" }, actor);
current = snapshot()!;
ledger = studentMonthlyLedger(current, "student-monthly");
assert.deepEqual(
  ledger.map((row) => [row.period, row.paid, row.due, row.status]),
  [
    [currentPeriod, 8_000, 0, "paid"],
    [next, 1_000, 7_000, "partial"],
  ],
  "unassigned receipts must settle oldest month first",
);

recordAdvance("employee-monthly", 10_000, "سلفة اختبار", actor, today());
generatePayroll(currentPeriod, actor);
current = snapshot()!;
const payroll = current.payroll_items.find((item) => item.employee_id === "employee-monthly" && item.period === currentPeriod)!;
assert.equal(payroll.advance_deducted, 10_000);
assert.equal(payroll.net, 30_000);
const advance = current.advances[0]!;
assert.equal(advance.allocated_payroll_id, payroll.id);

const salaryPart1 = recordPayrollPayment(payroll.id, 15_000, actor, "دفعة أولى");
current = snapshot()!;
assert.equal(current.payroll_items.find((item) => item.id === payroll.id)!.status, "partial");
assert.equal(payrollPaid(current, payroll.id), 15_000);
assert.equal(payrollRemaining(current, payroll.id), 15_000);

const salaryPart2 = recordPayrollPayment(payroll.id, 15_000, actor, "دفعة ثانية");
current = snapshot()!;
assert.equal(current.payroll_items.find((item) => item.id === payroll.id)!.status, "paid");
assert.equal(current.advances[0]!.settled, true);
assert.equal(payrollPaid(current, payroll.id), 30_000);

voidPayrollPayment(salaryPart2, "تصحيح اختبار", actor);
current = snapshot()!;
assert.equal(current.payroll_items.find((item) => item.id === payroll.id)!.status, "partial");
assert.equal(current.advances[0]!.settled, false);
assert.equal(current.advances[0]!.allocated_payroll_id, payroll.id, "void must not release advance to another payroll");
assert.equal(payrollPaid(current, payroll.id), 15_000);
assert.equal(payrollRemaining(current, payroll.id), 15_000);
assert.equal(profitAndLoss(current, today(), today()).payroll, 25_000, "cash payroll = advance + active salary payments");

generatePayroll(next, actor);
current = snapshot()!;
const nextPayroll = current.payroll_items.find((item) => item.employee_id === "employee-monthly" && item.period === next)!;
assert.equal(nextPayroll.advance_deducted, 0);
assert.equal(nextPayroll.advance_ids?.length ?? 0, 0);
assert.equal(current.payroll_payments.find((item) => item.id === salaryPart1)!.is_void, false);

current.settings.monthly_generation_last_period = currentPeriod;
runMonthlyGeneration(next2, actor);
current = snapshot()!;
assert.equal(current.settings.monthly_generation_last_period, next2);
assert.equal(current.installments.filter((item) => item.kind === "monthly" && item.period === next).length, 1, "catch-up must not duplicate an existing month");
assert.equal(current.installments.filter((item) => item.kind === "monthly" && item.period === next2).length, 1, "catch-up must create the missing later month");
assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next).length, 1);
assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next2).length, 1, "payroll catch-up must create missing month once");

const employeeAfterCatchup = current.employees.find((item) => item.id === "employee-monthly")!;
employeeAfterCatchup.active = false;
employeeAfterCatchup.ended_at = `${next2}-15`;
replaceDb(current);
runMonthlyGeneration(next3, actor);
current = snapshot()!;
assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next3).length, 0, "ended employee must not receive future payroll");

const transitionDb = emptyDb();
transitionDb.users.push({ ...baseFields(), id: actor.id, username: "owner-transition", full_name: actor.name, password_hash: "x", role: "owner", is_active: true });
transitionDb.students.push({ ...baseFields(), id: "student-legacy", code: "ST-L", full_name: "طالب قديم", birth_date: null, gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "", address: "", education_level: null, status: "active", archived_at: null, notes: "" });
transitionDb.courses.push({ ...baseFields(), id: "course-transition", name: "عام انتقال", code: "TR", level: "", hours: 1, default_price: 12_000, active: true });
transitionDb.classes.push({ ...baseFields(), id: "class-transition", name: "صف انتقال", course_id: "course-transition", teacher_id: null, term: "", capacity: 20, start_date: today(), end_date: today(), schedule: [], status: "running" });
replaceDb(transitionDb);
createEnrollmentWithInvoice({ student_id: "student-legacy", class_id: "class-transition", price: 50_000, discount: 0, discount_reason: "تاريخ قديم", installments: [{ due_date: today(), amount: 50_000 }] }, actor);
let transitionCurrent = snapshot()!;
const legacyEnrollmentId = transitionCurrent.enrollments[0]!.id;
const legacyInvoiceId = transitionCurrent.invoices[0]!.id;
const newMonthlyId = transitionLegacyEnrollmentToMonthly({ enrollment_id: legacyEnrollmentId, monthly_price: 12_000, discount: 2_000, discount_title: "خصم انتقال", start_period: currentPeriod }, actor);
transitionCurrent = snapshot()!;
assert.equal(transitionCurrent.enrollments.find((item) => item.id === legacyEnrollmentId)!.status, "withdrawn");
assert.equal(transitionCurrent.invoices.find((item) => item.id === legacyInvoiceId)!.total, 50_000, "legacy invoice must stay unchanged");
assert.equal(transitionCurrent.enrollments.find((item) => item.id === newMonthlyId)!.monthly_price_snapshot, 10_000);
assert.deepEqual(studentMonthlyLedger(transitionCurrent, "student-legacy").map((row) => [row.period, row.amount]), [[currentPeriod, 10_000]]);
updateMonthlyEnrollmentTerms({ enrollment_id: newMonthlyId, monthly_price: 15_000, discount: 3_000, discount_title: "خصم جديد" }, actor);
generateMonthlyStudentCharges(next, actor);
transitionCurrent = snapshot()!;
assert.deepEqual(studentMonthlyLedger(transitionCurrent, "student-legacy").map((row) => [row.period, row.amount]), [[currentPeriod, 10_000], [next, 12_000]], "term changes must affect future months only");

console.log("Academy Hub monthly billing + partial payroll scenarios: PASS");
process.exit(0);

import assert from "node:assert/strict";
import { baseFields, emptyDb, replaceDb, snapshot } from "../src/lib/db";
import {
  createMonthlyEnrollmentWithInvoice,
  generateMonthlyStudentCharges,
  profitAndLoss,
  recordPayment,
  studentMonthlyLedger,
} from "../src/lib/finance";
import { today } from "../src/lib/format";
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

console.log("Academy Hub monthly billing + partial payroll scenarios: PASS");
process.exit(0);

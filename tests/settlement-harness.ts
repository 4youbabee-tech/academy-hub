import assert from "node:assert/strict";
import { baseFields, emptyDb, replaceDb, snapshot } from "../src/lib/db";
import {
  createMonthlyEnrollmentWithInvoice,
  generateMonthlyStudentCharges,
  installmentPaid,
  invoiceInstallments,
  recordPayment,
  studentMonthlyLedger,
} from "../src/lib/finance";
import { today } from "../src/lib/format";
import { generatePayroll, payrollRemaining, recordPayrollPayment } from "../src/lib/payroll";
import {
  employeePayrollBalance,
  recordPayrollAllocatedSettlement,
  voidPayrollSettlement,
} from "../src/lib/payroll-settlement";
import {
  recordStudentAllocatedReceipt,
  voidStudentReceiptGroup,
} from "../src/lib/student-settlement";

const actor = { id: "owner-settlement", name: "مالك اختبار التسويات" };
const currentPeriod = today().slice(0, 7);

function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

const next = nextPeriod(currentPeriod);
const db = emptyDb();
db.users.push({
  ...baseFields(), id: actor.id, username: "owner-settlement", full_name: actor.name,
  password_hash: "x", role: "owner", is_active: true,
});
db.students.push({
  ...baseFields(), id: "student-settlement", code: "ST-SET", full_name: "طالب التسويات", birth_date: null,
  gender: "", phone: "", guardian_name: "ولي الطالب", guardian_phone: "", mother_name: "", school_name: "",
  address: "", education_level: null, status: "active", archived_at: null, notes: "",
});
db.courses.push({
  ...baseFields(), id: "course-settlement", name: "متوسط", code: "MID", level: "", hours: 1,
  default_price: 10_000, active: true,
});
db.classes.push({
  ...baseFields(), id: "class-settlement", name: "الصف الأول", course_id: "course-settlement", teacher_id: null,
  term: "", capacity: 30, start_date: `${currentPeriod}-01`, end_date: `${next}-28`, schedule: [], status: "running",
});
db.employees.push({
  ...baseFields(), id: "employee-settlement", full_name: "موظف التسويات", kind: "staff", job_title: "إداري",
  phone: "", hired_at: `${currentPeriod}-01`, ended_at: null, base_salary: 40_000, active: true,
});
replaceDb(db);

// Student: current month 100, partially paid 50; next month adds a separate 100.
createMonthlyEnrollmentWithInvoice({
  student_id: "student-settlement",
  class_id: "class-settlement",
  monthly_price: 10_000,
  discount: 0,
  start_period: currentPeriod,
}, actor);
let current = snapshot()!;
const invoice = current.invoices[0]!;
recordPayment({ invoice_id: invoice.id, amount: 5_000, method: "cash", note: "دفعة أولى" }, actor);
generateMonthlyStudentCharges(next, actor);
current = snapshot()!;
let ledger = studentMonthlyLedger(current, "student-settlement");
assert.deepEqual(
  ledger.map((row) => [row.period, row.due]),
  [[currentPeriod, 5_000], [next, 10_000]],
  "student prior arrears and new month must remain separate",
);

const installments = invoiceInstallments(current, invoice.id);
const priorInstallment = installments.find((row) => row.period === currentPeriod)!;
const nextInstallment = installments.find((row) => row.period === next)!;
const groupedReceipt = recordStudentAllocatedReceipt({
  invoice_id: invoice.id,
  method: "cash",
  note: "تسوية قديم وجزء من الجديد",
  allocations: [
    { installment_id: priorInstallment.id, amount: 5_000 },
    { installment_id: nextInstallment.id, amount: 3_000 },
  ],
}, actor);
current = snapshot()!;
ledger = studentMonthlyLedger(current, "student-settlement");
assert.deepEqual(
  ledger.map((row) => [row.period, row.paid, row.due, row.status]),
  [[currentPeriod, 10_000, 0, "paid"], [next, 3_000, 7_000, "partial"]],
  "one visible receipt must preserve exact per-month student allocation",
);
assert.equal(groupedReceipt.payment_ids.length, 2);
const groupedStudentRows = current.payments.filter((row) => row.receipt_group_id === groupedReceipt.group_id);
assert.equal(groupedStudentRows.length, 2);
assert.equal(new Set(groupedStudentRows.map((row) => row.receipt_no)).size, 1, "one settlement must have one visible receipt number");
assert.equal(installmentPaid(current, priorInstallment.id), 10_000);
assert.throws(
  () => recordStudentAllocatedReceipt({ invoice_id: invoice.id, method: "cash", allocations: [{ installment_id: nextInstallment.id, amount: 7_001 }] }, actor),
  /يتجاوز الرصيد/,
  "student allocation must never exceed the selected month balance",
);

voidStudentReceiptGroup(groupedReceipt.payment_ids[0]!, "اختبار إلغاء سند مجمع", actor);
current = snapshot()!;
ledger = studentMonthlyLedger(current, "student-settlement");
assert.deepEqual(
  ledger.map((row) => [row.period, row.due]),
  [[currentPeriod, 5_000], [next, 10_000]],
  "voiding a grouped student receipt must restore every affected month exactly",
);
assert.equal(current.payments.filter((row) => row.receipt_group_id === groupedReceipt.group_id).every((row) => row.is_void), true);

// Payroll: employee is owed 50 from prior month and a fresh 400 next month.
generatePayroll(currentPeriod, actor);
generatePayroll(next, actor);
current = snapshot()!;
const priorPayroll = current.payroll_items.find((row) => row.employee_id === "employee-settlement" && row.period === currentPeriod)!;
const nextPayroll = current.payroll_items.find((row) => row.employee_id === "employee-settlement" && row.period === next)!;
recordPayrollPayment(priorPayroll.id, 35_000, actor, "دفع جزئي قديم");
current = snapshot()!;
assert.equal(payrollRemaining(current, priorPayroll.id), 5_000);
assert.equal(payrollRemaining(current, nextPayroll.id), 40_000);
assert.equal(employeePayrollBalance(current, "employee-settlement"), 45_000, "employee balance is money owed by academy to employee");

const salarySettlement = recordPayrollAllocatedSettlement({
  employee_id: "employee-settlement",
  note: "تسوية القديم وجزء من الجديد",
  allocations: [
    { payroll_item_id: priorPayroll.id, amount: 5_000 },
    { payroll_item_id: nextPayroll.id, amount: 10_000 },
  ],
}, actor);
current = snapshot()!;
assert.equal(payrollRemaining(current, priorPayroll.id), 0);
assert.equal(payrollRemaining(current, nextPayroll.id), 30_000);
assert.equal(employeePayrollBalance(current, "employee-settlement"), 30_000);
assert.equal(salarySettlement.payment_ids.length, 2);
const groupedPayrollRows = current.payroll_payments.filter((row) => row.settlement_id === salarySettlement.settlement_id);
assert.equal(groupedPayrollRows.length, 2);
assert.equal(new Set(groupedPayrollRows.map((row) => row.settlement_no)).size, 1);
assert.throws(
  () => recordPayrollAllocatedSettlement({ employee_id: "employee-settlement", allocations: [{ payroll_item_id: nextPayroll.id, amount: 30_001 }] }, actor),
  /يتجاوز المتبقي/,
  "payroll allocation must never exceed that month's remaining salary",
);

voidPayrollSettlement(salarySettlement.payment_ids[0]!, "اختبار إلغاء دفعة مجمعة", actor);
current = snapshot()!;
assert.equal(payrollRemaining(current, priorPayroll.id), 5_000);
assert.equal(payrollRemaining(current, nextPayroll.id), 40_000);
assert.equal(employeePayrollBalance(current, "employee-settlement"), 45_000, "void must restore employee rights by period");
assert.equal(current.payroll_payments.filter((row) => row.settlement_id === salarySettlement.settlement_id).every((row) => row.is_void), true);

console.log("settlement-harness: OK");

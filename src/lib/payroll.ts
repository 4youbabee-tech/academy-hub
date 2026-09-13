import { audit, baseFields, snapshot, transact, type Actor } from "./db";
import { today } from "./format";
import type { Advance, DB, ID, PayrollItem, PayrollPayment } from "./types";

function assertMoney(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} غير صالح`);
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("فترة الراتب غير صالحة");
}

export function expectedPayrollNet(item: Pick<PayrollItem, "base_snapshot" | "bonus" | "deduction" | "advance_deducted">): number {
  return item.base_snapshot + item.bonus - item.deduction - item.advance_deducted;
}

export function validatePayrollItem(item: PayrollItem): void {
  assertMoney(item.base_snapshot, "الراتب الأساسي");
  assertMoney(item.bonus, "الإضافات");
  assertMoney(item.deduction, "الحسميات");
  assertMoney(item.advance_deducted, "خصم السلف");
  const expected = expectedPayrollNet(item);
  if (expected < 0) throw new Error("لا يمكن أن يكون صافي الراتب سالبًا");
  if (item.net !== expected) throw new Error("صافي الراتب لا يطابق تفاصيل كشف الراتب");
}

export function payrollPaid(db: DB, payrollItemId: ID): number {
  return db.payroll_payments
    .filter((payment) => payment.payroll_item_id === payrollItemId && !payment.is_void)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function payrollRemaining(db: DB, payrollItemId: ID): number {
  const item = db.payroll_items.find((row) => row.id === payrollItemId);
  if (!item) return 0;
  return Math.max(0, item.net - payrollPaid(db, payrollItemId));
}

function advancesForPayroll(db: DB, item: PayrollItem): Advance[] {
  const ids = new Set(item.advance_ids ?? []);
  return db.advances
    .filter((advance) => ids.has(advance.id) && advance.allocated_payroll_id === item.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}

function recomputePayrollItem(db: DB, item: PayrollItem, now = new Date().toISOString()): void {
  validatePayrollItem(item);
  const paid = payrollPaid(db, item.id);
  if (paid > item.net) throw new Error("دفعات الراتب تتجاوز صافي الراتب");
  const advances = advancesForPayroll(db, item);
  const advanceTotal = advances.reduce((sum, advance) => sum + advance.amount, 0);
  if (advanceTotal !== item.advance_deducted) throw new Error("تفاصيل السلف لا تطابق كشف الراتب");

  if (paid >= item.net) {
    item.status = "paid";
    item.paid_at = item.paid_at ?? now;
    for (const advance of advances) {
      advance.settled = true;
      advance.settled_at = item.paid_at;
      advance.updated_at = now;
    }
  } else if (paid > 0) {
    item.status = "partial";
    item.paid_at = null;
    for (const advance of advances) {
      advance.settled = false;
      advance.settled_at = null;
      advance.updated_at = now;
    }
  } else {
    item.status = "draft";
    item.paid_at = null;
    for (const advance of advances) {
      advance.settled = false;
      advance.settled_at = null;
      advance.updated_at = now;
    }
  }
  item.updated_at = now;
}

function employeeEligibleForPeriod(employee: DB["employees"][number], period: string): boolean {
  if (employee.hired_at.slice(0, 7) > period) return false;
  if (employee.ended_at && employee.ended_at.slice(0, 7) < period) return false;
  return employee.active || Boolean(employee.ended_at);
}

function allocateAdvances(db: DB, employeeId: ID, period: string, payrollId: ID, capacity: number): Advance[] {
  const candidates = db.advances
    .filter((advance) =>
      advance.employee_id === employeeId
      && !advance.settled
      && !advance.allocated_payroll_id
      && advance.date.slice(0, 7) <= period,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

  const selected: Advance[] = [];
  let total = 0;
  for (const advance of candidates) {
    if (total + advance.amount > capacity) continue;
    total += advance.amount;
    advance.allocated_payroll_id = payrollId;
    advance.updated_at = new Date().toISOString();
    selected.push(advance);
  }
  return selected;
}

/** Internal batch generator used by the monthly coordinator. */
export function generatePayrollInDb(db: DB, period: string): number {
  assertPeriod(period);
  let created = 0;
  for (const employee of db.employees.filter((item) => employeeEligibleForPeriod(item, period))) {
    if (db.payroll_items.some((item) => item.employee_id === employee.id && item.period === period)) continue;
    assertMoney(employee.base_salary, "الراتب الأساسي");
    const item: PayrollItem = {
      ...baseFields(),
      employee_id: employee.id,
      period,
      base_snapshot: employee.base_salary,
      bonus: 0,
      deduction: 0,
      advance_deducted: 0,
      advance_ids: [],
      net: employee.base_salary,
      paid_at: null,
      status: "draft",
    };
    db.payroll_items.push(item);
    const advances = allocateAdvances(db, employee.id, period, item.id, employee.base_salary);
    item.advance_ids = advances.map((advance) => advance.id);
    item.advance_deducted = advances.reduce((sum, advance) => sum + advance.amount, 0);
    item.net = expectedPayrollNet(item);
    validatePayrollItem(item);
    recomputePayrollItem(db, item);
    created += 1;
  }
  return created;
}

export function generatePayroll(period: string, actor: Actor): void {
  assertPeriod(period);
  transact((db) => {
    const created = generatePayrollInDb(db, period);
    if (created > 0) audit(db, actor, "payroll_items", null, "create", `توليد كشف رواتب ${period} (${created})`);
  });
}

export function recordAdvance(
  employeeId: ID,
  amount: number,
  reason: string,
  actor: Actor,
  date = today(),
): ID {
  assertMoney(amount, "مبلغ السلفة");
  if (amount === 0) throw new Error("مبلغ السلفة يجب أن يكون أكبر من صفر");

  let createdId = "";
  transact((db) => {
    const employee = db.employees.find((item) => item.id === employeeId && item.active);
    if (!employee) throw new Error("الموظف غير موجود أو غير نشط");
    assertMoney(employee.base_salary, "الراتب الأساسي");
    const outstanding = db.advances
      .filter((item) => item.employee_id === employeeId && !item.settled)
      .reduce((sum, item) => sum + item.amount, 0);
    if (outstanding + amount > employee.base_salary) {
      throw new Error("إجمالي السلف غير المسددة لا يمكن أن يتجاوز الراتب الأساسي");
    }

    const advance: Advance = {
      ...baseFields(),
      employee_id: employeeId,
      amount,
      date,
      reason: reason.trim(),
      settled: false,
      allocated_payroll_id: null,
      settled_at: null,
    };
    db.advances.push(advance);
    createdId = advance.id;

    const currentDraft = db.payroll_items.find(
      (item) => item.employee_id === employeeId
        && item.period === date.slice(0, 7)
        && item.status === "draft"
        && payrollPaid(db, item.id) === 0,
    );
    if (currentDraft && currentDraft.advance_deducted + amount <= currentDraft.base_snapshot + currentDraft.bonus - currentDraft.deduction) {
      advance.allocated_payroll_id = currentDraft.id;
      currentDraft.advance_deducted += amount;
      currentDraft.advance_ids = [...(currentDraft.advance_ids ?? []), advance.id];
      currentDraft.net = expectedPayrollNet(currentDraft);
      recomputePayrollItem(db, currentDraft);
    }
    audit(db, actor, "advances", advance.id, "create", `سلفة للموظف ${employee.full_name} بقيمة ${amount / 100}`);
  });
  return createdId;
}

export function recordPayrollPayment(itemId: ID, amount: number, actor: Actor, note = ""): ID {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ دفعة الراتب غير صالح");
  let createdId = "";
  transact((db) => {
    const item = db.payroll_items.find((row) => row.id === itemId);
    if (!item) throw new Error("كشف الراتب غير موجود");
    validatePayrollItem(item);
    const remaining = payrollRemaining(db, item.id);
    if (remaining <= 0) throw new Error("تم دفع هذا الراتب بالكامل");
    if (amount > remaining) throw new Error("المبلغ يتجاوز المتبقي من الراتب");
    const payment: PayrollPayment = {
      ...baseFields(),
      payroll_item_id: item.id,
      employee_id: item.employee_id,
      amount,
      paid_at: new Date().toISOString(),
      is_void: false,
      void_reason: "",
      voided_at: null,
      user_id: actor.id,
      note: note.trim(),
    };
    db.payroll_payments.push(payment);
    createdId = payment.id;
    recomputePayrollItem(db, item, payment.paid_at);
    const employee = db.employees.find((row) => row.id === item.employee_id);
    audit(
      db,
      actor,
      "payroll_payments",
      payment.id,
      "pay",
      `دفعة راتب ${employee?.full_name ?? "—"} عن ${item.period} بقيمة ${amount / 100}`,
    );
  });
  return createdId;
}

/** Backward-compatible existing action: pays the exact remaining amount. */
export function payPayrollItem(itemId: ID, actor: Actor): void {
  const db = snapshot();
  if (!db) throw new Error("DB not loaded");
  const item = db.payroll_items.find((row) => row.id === itemId);
  if (!item) throw new Error("كشف الراتب غير موجود");
  const remaining = payrollRemaining(db, item.id);
  if (remaining > 0) {
    recordPayrollPayment(itemId, remaining, actor, "دفع كامل المتبقي");
    return;
  }
  if (item.net === 0 && item.status !== "paid") {
    transact((draft) => {
      const target = draft.payroll_items.find((row) => row.id === itemId);
      if (!target) throw new Error("كشف الراتب غير موجود");
      recomputePayrollItem(draft, target);
      audit(draft, actor, "payroll_items", target.id, "settle", `تسوية راتب ${target.period} بالكامل من السلف`);
    });
    return;
  }
  throw new Error("تم دفع هذا الراتب مسبقًا");
}

export function voidPayrollPayment(paymentId: ID, reason: string, actor: Actor): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const payment = db.payroll_payments.find((row) => row.id === paymentId);
    if (!payment) throw new Error("دفعة الراتب غير موجودة");
    if (payment.is_void) throw new Error("دفعة الراتب ملغاة مسبقًا");
    payment.is_void = true;
    payment.void_reason = reason.trim();
    payment.voided_at = new Date().toISOString();
    payment.updated_at = payment.voided_at;
    const item = db.payroll_items.find((row) => row.id === payment.payroll_item_id);
    if (item) recomputePayrollItem(db, item, payment.voided_at);
    audit(db, actor, "payroll_payments", payment.id, "void", `إلغاء دفعة راتب — ${reason.trim()}`);
  });
}

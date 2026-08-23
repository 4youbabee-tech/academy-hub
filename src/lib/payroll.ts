import { audit, baseFields, transact, type Actor } from "./db";
import { today } from "./format";
import type { Advance, DB, ID, PayrollItem } from "./types";

function assertMoney(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} غير صالح`);
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

export function generatePayroll(period: string, actor: Actor): void {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("فترة الراتب غير صالحة");

  transact((db) => {
    let created = 0;
    for (const employee of db.employees.filter((item) => item.active)) {
      if (db.payroll_items.some((item) => item.employee_id === employee.id && item.period === period)) continue;
      assertMoney(employee.base_salary, "الراتب الأساسي");
      const advances = db.advances.filter(
        (item) => item.employee_id === employee.id && !item.settled && item.date.slice(0, 7) <= period,
      );
      const advanceDeducted = advances.reduce((sum, item) => sum + item.amount, 0);
      if (advanceDeducted > employee.base_salary) {
        throw new Error(`سلف الموظف ${employee.full_name} تتجاوز راتبه الأساسي`);
      }
      db.payroll_items.push({
        ...baseFields(),
        employee_id: employee.id,
        period,
        base_snapshot: employee.base_salary,
        bonus: 0,
        deduction: 0,
        advance_deducted: advanceDeducted,
        advance_ids: advances.map((item) => item.id),
        net: employee.base_salary - advanceDeducted,
        paid_at: null,
        status: "draft",
      });
      created += 1;
    }
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
    };
    db.advances.push(advance);
    createdId = advance.id;

    const currentDraft = db.payroll_items.find(
      (item) => item.employee_id === employeeId && item.period === date.slice(0, 7) && item.status === "draft",
    );
    if (currentDraft) {
      currentDraft.advance_deducted += amount;
      currentDraft.advance_ids = [...(currentDraft.advance_ids ?? []), advance.id];
      currentDraft.net = expectedPayrollNet(currentDraft);
      if (currentDraft.net < 0) throw new Error("السلفة تجعل صافي الراتب سالبًا");
      currentDraft.updated_at = new Date().toISOString();
    }

    audit(db, actor, "advances", advance.id, "create", `سلفة للموظف ${employee.full_name} بقيمة ${amount / 100}`);
  });
  return createdId;
}

function advancesForPayroll(db: DB, item: PayrollItem): Advance[] {
  const outstanding = db.advances
    .filter(
      (advance) => advance.employee_id === item.employee_id
        && !advance.settled
        && advance.date.slice(0, 7) <= item.period,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

  if (item.advance_ids?.length) {
    const ids = new Set(item.advance_ids);
    return outstanding.filter((advance) => ids.has(advance.id));
  }

  const selected: Advance[] = [];
  let sum = 0;
  for (const advance of outstanding) {
    if (sum + advance.amount > item.advance_deducted) break;
    selected.push(advance);
    sum += advance.amount;
    if (sum === item.advance_deducted) break;
  }
  return selected;
}

export function payPayrollItem(itemId: ID, actor: Actor): void {
  transact((db) => {
    const item = db.payroll_items.find((row) => row.id === itemId);
    if (!item) throw new Error("كشف الراتب غير موجود");
    if (item.status === "paid") throw new Error("تم دفع هذا الراتب مسبقًا");
    validatePayrollItem(item);

    const advances = advancesForPayroll(db, item);
    const advanceTotal = advances.reduce((sum, advance) => sum + advance.amount, 0);
    if (advanceTotal !== item.advance_deducted) {
      throw new Error("تفاصيل السلف لا تطابق كشف الراتب. أعد توليد الكشف قبل الدفع.");
    }

    const paidAt = new Date().toISOString();
    item.status = "paid";
    item.paid_at = paidAt;
    item.updated_at = paidAt;
    for (const advance of advances) {
      advance.settled = true;
      advance.updated_at = paidAt;
    }

    const employee = db.employees.find((row) => row.id === item.employee_id);
    audit(db, actor, "payroll_items", item.id, "pay", `دفع راتب ${employee?.full_name ?? "—"} عن ${item.period}`);
  });
}

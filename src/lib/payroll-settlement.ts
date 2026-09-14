import { audit, baseFields, transact, uid, type Actor } from "./db";
import { payrollPaid, validatePayrollItem } from "./payroll";
import type { Advance, DB, ID, PayrollItem, PayrollPayment } from "./types";

export interface PayrollSettlementAllocationInput {
  payroll_item_id: ID;
  amount: number;
}

export interface PayrollSettlementResult {
  settlement_id: ID;
  settlement_no: string;
  payment_ids: ID[];
}

export interface EmployeePayrollBalanceRow {
  payroll_item: PayrollItem;
  paid: number;
  remaining: number;
}

export function employeePayrollBalanceRows(db: DB, employeeId: ID): EmployeePayrollBalanceRow[] {
  return db.payroll_items
    .filter((item) => item.employee_id === employeeId)
    .map((item) => ({
      payroll_item: item,
      paid: payrollPaid(db, item.id),
      remaining: Math.max(0, item.net - payrollPaid(db, item.id)),
    }))
    .sort((a, b) => a.payroll_item.period.localeCompare(b.payroll_item.period));
}

export function employeePayrollBalance(db: DB, employeeId: ID): number {
  return employeePayrollBalanceRows(db, employeeId).reduce((sum, row) => sum + row.remaining, 0);
}

export function payrollSettlementRows(db: DB, payment: PayrollPayment): PayrollPayment[] {
  if (payment.settlement_id) {
    return db.payroll_payments
      .filter((row) => row.settlement_id === payment.settlement_id)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return [payment];
}

function advancesForPayroll(db: DB, item: PayrollItem): Advance[] {
  const ids = new Set(item.advance_ids ?? []);
  return db.advances.filter((advance) => ids.has(advance.id) && advance.allocated_payroll_id === item.id);
}

function recomputePayrollItemAfterSettlement(db: DB, item: PayrollItem, now: string): void {
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

/**
 * Pays any selected mix of old/current payroll months in one visible settlement.
 * Each month receives its own ledger row, so arrears never get merged into the new month's salary.
 */
export function recordPayrollAllocatedSettlement(
  args: {
    employee_id: ID;
    allocations: PayrollSettlementAllocationInput[];
    note?: string;
  },
  actor: Actor,
): PayrollSettlementResult {
  const normalized = args.allocations
    .filter((row) => Number.isInteger(row.amount) && row.amount > 0)
    .map((row) => ({ payroll_item_id: row.payroll_item_id, amount: row.amount }));
  if (!normalized.length) throw new Error("اختر شهر راتب واحدًا على الأقل وأدخل مبلغًا صحيحًا");
  if (new Set(normalized.map((row) => row.payroll_item_id)).size !== normalized.length) {
    throw new Error("لا يمكن تكرار نفس شهر الراتب ضمن دفعة واحدة");
  }

  const result: PayrollSettlementResult = { settlement_id: "", settlement_no: "", payment_ids: [] };
  transact((db) => {
    const employee = db.employees.find((row) => row.id === args.employee_id);
    if (!employee) throw new Error("الموظف غير موجود");

    const targets = normalized.map((allocation) => {
      const item = db.payroll_items.find(
        (row) => row.id === allocation.payroll_item_id && row.employee_id === employee.id,
      );
      if (!item) throw new Error("يوجد كشف راتب غير صالح ضمن توزيع الدفعة");
      validatePayrollItem(item);
      const paidBefore = payrollPaid(db, item.id);
      const remaining = Math.max(0, item.net - paidBefore);
      if (allocation.amount > remaining) throw new Error("أحد مبالغ التوزيع يتجاوز المتبقي للموظف في ذلك الشهر");
      return { item, amount: allocation.amount, paidBefore };
    });

    const settlementId = uid();
    const settlementNo = `SAL-${settlementId.slice(0, 8).toUpperCase()}`;
    const paidAt = new Date().toISOString();

    for (const target of targets) {
      const payment: PayrollPayment = {
        ...baseFields(),
        payroll_item_id: target.item.id,
        employee_id: employee.id,
        amount: target.amount,
        paid_at: paidAt,
        is_void: false,
        void_reason: "",
        voided_at: null,
        user_id: actor.id,
        note: args.note?.trim() ?? "",
        settlement_id: settlementId,
        settlement_no: settlementNo,
        payroll_net_snapshot: target.item.net,
        paid_before_snapshot: target.paidBefore,
        paid_after_snapshot: target.paidBefore + target.amount,
        remaining_after_snapshot: Math.max(0, target.item.net - target.paidBefore - target.amount),
      };
      db.payroll_payments.push(payment);
      result.payment_ids.push(payment.id);
    }

    for (const target of targets) recomputePayrollItemAfterSettlement(db, target.item, paidAt);
    result.settlement_id = settlementId;
    result.settlement_no = settlementNo;
    const total = targets.reduce((sum, target) => sum + target.amount, 0);
    audit(db, actor, "payroll_payments", settlementId, "pay-group", `صرف ${settlementNo} للموظف ${employee.full_name} بقيمة ${total / 100} موزع على ${targets.length} شهر`);
  });
  return result;
}

export function voidPayrollSettlement(paymentId: ID, reason: string, actor: Actor): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const seed = db.payroll_payments.find((row) => row.id === paymentId);
    if (!seed) throw new Error("دفعة الراتب غير موجودة");
    const rows = seed.settlement_id
      ? db.payroll_payments.filter((row) => row.settlement_id === seed.settlement_id)
      : [seed];
    if (rows.every((row) => row.is_void)) throw new Error("دفعة الراتب ملغاة مسبقًا");
    const now = new Date().toISOString();
    for (const row of rows) {
      row.is_void = true;
      row.void_reason = reason.trim();
      row.voided_at = now;
      row.updated_at = now;
    }
    const affectedIds = new Set(rows.map((row) => row.payroll_item_id));
    for (const item of db.payroll_items.filter((row) => affectedIds.has(row.id))) {
      recomputePayrollItemAfterSettlement(db, item, now);
    }
    audit(db, actor, "payroll_payments", seed.settlement_id ?? seed.id, "void-group", `إلغاء دفعة راتب ${seed.settlement_no ?? seed.id.slice(0, 8)} — ${reason.trim()}`);
  });
}

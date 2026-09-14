import { audit, baseFields, nextReceiptNo, transact, uid, type Actor } from "./db";
import { installmentPaid, recomputeInvoice } from "./finance";
import type { DB, ID, Payment } from "./types";

export interface StudentReceiptAllocationInput {
  installment_id: ID;
  amount: number;
}

export interface StudentReceiptResult {
  group_id: ID;
  receipt_no: string;
  payment_ids: ID[];
}

export function receiptGroupRows(db: DB, payment: Payment): Payment[] {
  if (payment.receipt_group_id) {
    return db.payments
      .filter((row) => row.receipt_group_id === payment.receipt_group_id)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return db.payments.filter((row) => row.id === payment.id);
}

/**
 * One visible receipt can settle several invoice installments/months.
 * Internally every allocation remains a separate immutable payment row so
 * invoice/installment accounting never mixes periods together.
 */
export function recordStudentAllocatedReceipt(
  args: {
    invoice_id: ID;
    allocations: StudentReceiptAllocationInput[];
    method: Payment["method"];
    note?: string;
  },
  actor: Actor,
): StudentReceiptResult {
  const normalized = args.allocations
    .filter((row) => Number.isInteger(row.amount) && row.amount > 0)
    .map((row) => ({ installment_id: row.installment_id, amount: row.amount }));
  if (!normalized.length) throw new Error("اختر استحقاقًا واحدًا على الأقل وأدخل مبلغًا صحيحًا");
  if (new Set(normalized.map((row) => row.installment_id)).size !== normalized.length) {
    throw new Error("لا يمكن تكرار نفس الاستحقاق ضمن سند واحد");
  }

  const result: StudentReceiptResult = { group_id: "", receipt_no: "", payment_ids: [] };
  transact((db) => {
    const invoice = db.invoices.find((row) => row.id === args.invoice_id);
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status === "cancelled") throw new Error("لا يمكن القبض على فاتورة ملغاة");
    recomputeInvoice(db, invoice.id);

    const targets = normalized.map((allocation) => {
      const installment = db.installments.find(
        (row) => row.id === allocation.installment_id && row.invoice_id === invoice.id && !row.is_void,
      );
      if (!installment) throw new Error("يوجد استحقاق غير صالح ضمن توزيع الدفعة");
      const remaining = Math.max(0, installment.amount - installmentPaid(db, installment.id));
      if (allocation.amount > remaining) {
        throw new Error("أحد مبالغ التوزيع يتجاوز الرصيد المتبقي للشهر/الاستحقاق");
      }
      return { installment, amount: allocation.amount };
    });

    const totalAmount = targets.reduce((sum, row) => sum + row.amount, 0);
    const paidBefore = db.payments
      .filter((row) => row.invoice_id === invoice.id && !row.is_void)
      .reduce((sum, row) => sum + row.amount, 0);
    if (paidBefore + totalAmount > invoice.total) throw new Error("إجمالي السند يتجاوز رصيد الفاتورة");

    const groupId = uid();
    const receiptNo = nextReceiptNo(db);
    const paidAt = new Date().toISOString();
    let runningPaid = paidBefore;

    for (const target of targets) {
      runningPaid += target.amount;
      const payment: Payment = {
        ...baseFields(),
        invoice_id: invoice.id,
        installment_id: target.installment.id,
        allocations: [{ installment_id: target.installment.id, amount: target.amount }],
        receipt_group_id: groupId,
        student_id: invoice.student_id,
        receipt_no: receiptNo,
        amount: target.amount,
        method: args.method,
        paid_at: paidAt,
        is_void: false,
        void_reason: "",
        voided_at: null,
        user_id: actor.id,
        note: args.note?.trim() ?? "",
        invoice_total_snapshot: invoice.total,
        paid_after_snapshot: paidBefore + totalAmount,
        due_after_snapshot: Math.max(0, invoice.total - paidBefore - totalAmount),
      };
      db.payments.push(payment);
      result.payment_ids.push(payment.id);
    }

    recomputeInvoice(db, invoice.id);
    result.group_id = groupId;
    result.receipt_no = receiptNo;
    audit(db, actor, "payments", groupId, "create-group", `قبض ${receiptNo} بقيمة ${totalAmount / 100} موزع على ${targets.length} استحقاق`);
  });
  return result;
}

export function voidStudentReceiptGroup(paymentId: ID, reason: string, actor: Actor): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const seed = db.payments.find((row) => row.id === paymentId);
    if (!seed) throw new Error("سند القبض غير موجود");
    const rows = seed.receipt_group_id
      ? db.payments.filter((row) => row.receipt_group_id === seed.receipt_group_id)
      : [seed];
    if (rows.every((row) => row.is_void)) throw new Error("السند ملغى مسبقًا");
    const now = new Date().toISOString();
    for (const row of rows) {
      row.is_void = true;
      row.void_reason = reason.trim();
      row.voided_at = now;
      row.updated_at = now;
    }
    recomputeInvoice(db, seed.invoice_id);
    audit(db, actor, "payments", seed.receipt_group_id ?? seed.id, "void-group", `إلغاء سند ${seed.receipt_no} — ${reason.trim()}`);
  });
}

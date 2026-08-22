import { audit, baseFields, nextReceiptNo, transact, type Actor } from "./db";
import type { DB, ID, Installment, Invoice, Payment } from "./types";

export function installmentLabel(ins: Installment): string {
  if (ins.kind === "registration") return "رسوم التسجيل";
  return `قسط رقم ${ins.seq ?? 1}`;
}

export function installmentPaid(db: DB, installmentId: ID): number {
  return db.payments
    .filter((p) => !p.is_void && p.installment_id === installmentId)
    .reduce((s, p) => s + p.amount, 0);
}

export function invoiceBalance(db: DB, invoiceId: ID): number {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv || inv.status === "cancelled") return 0;
  const paid = db.payments
    .filter((p) => p.invoice_id === invoiceId && !p.is_void)
    .reduce((s, p) => s + p.amount, 0);
  return inv.total - paid;
}

export function studentBalance(db: DB, studentId: ID): { billed: number; paid: number; due: number } {
  const invs = db.invoices.filter((i) => i.student_id === studentId && i.status !== "cancelled");
  const billed = invs.reduce((s, i) => s + i.total, 0);
  const paid = db.payments
    .filter((p) => p.student_id === studentId && !p.is_void)
    .reduce((s, p) => s + p.amount, 0);
  return { billed, paid, due: billed - paid };
}

export function overdueInstallments(db: DB, onDate = new Date().toISOString().slice(0, 10)) {
  return db.installments.filter((ins) => {
    if (ins.status === "paid") return false;
    const inv = db.invoices.find((i) => i.id === ins.invoice_id);
    if (!inv || inv.status === "cancelled") return false;
    return ins.due_date < onDate;
  });
}

/** Sorted installments of an invoice: registration first, then by sequence/date. */
export function invoiceInstallments(db: DB, invoiceId: ID): Installment[] {
  return db.installments
    .filter((i) => i.invoice_id === invoiceId)
    .sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1) || a.due_date.localeCompare(b.due_date));
}

/** Recomputes installment + invoice statuses from the non-void payments. */
export function recomputeInvoice(db: DB, invoiceId: ID): void {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) return;
  const payments = db.payments.filter((p) => p.invoice_id === invoiceId && !p.is_void);
  const list = invoiceInstallments(db, invoiceId);

  // amounts explicitly allocated to an installment
  const direct = new Map<string, number>();
  let pool = 0;
  for (const p of payments) {
    if (p.installment_id && list.some((i) => i.id === p.installment_id)) {
      direct.set(p.installment_id, (direct.get(p.installment_id) ?? 0) + p.amount);
    } else {
      pool += p.amount;
    }
  }

  for (const ins of list) {
    let paid = direct.get(ins.id) ?? 0;
    if (paid < ins.amount && pool > 0) {
      const take = Math.min(pool, ins.amount - paid);
      paid += take;
      pool -= take;
    }
    ins.status = paid >= ins.amount ? "paid" : paid > 0 ? "partial" : "due";
    ins.updated_at = new Date().toISOString();
  }

  if (inv.status !== "cancelled") {
    const total = payments.reduce((s, p) => s + p.amount, 0);
    inv.status = total >= inv.total ? "paid" : "open";
  }
}

/** Creates an enrollment + invoice + installments atomically. */
export function createEnrollmentWithInvoice(
  args: {
    student_id: ID;
    class_id: ID;
    price: number;
    discount: number;
    registration_fee?: number;
    discount_reason: string;
    installments: { due_date: string; amount: number }[];
  },
  actor: Actor,
): void {
  transact((db) => {
    const fee = Math.max(0, args.registration_fee ?? 0);
    const tuition = Math.max(0, args.price - args.discount);
    const total = tuition + fee;
    const sum = args.installments.reduce((s, i) => s + i.amount, 0);
    if (args.installments.length > 0 && sum !== tuition) {
      throw new Error("مجموع الأقساط لا يساوي قيمة الدورة الصافية (بدون رسوم التسجيل)");
    }

    const enrollment = {
      ...baseFields(),
      student_id: args.student_id,
      class_id: args.class_id,
      enrolled_at: new Date().toISOString(),
      price_snapshot: args.price,
      discount_snapshot: args.discount,
      discount_reason: args.discount_reason,
      status: "active" as const,
    };
    db.enrollments.push(enrollment);

    const invoice: Invoice = {
      ...baseFields(),
      number: `INV-${String(db.invoices.length + 1).padStart(5, "0")}`,
      enrollment_id: enrollment.id,
      student_id: args.student_id,
      total,
      status: total === 0 ? "paid" : "open",
      issued_at: new Date().toISOString(),
    };
    db.invoices.push(invoice);

    if (fee > 0) {
      db.installments.push({
        ...baseFields(),
        invoice_id: invoice.id,
        due_date: new Date().toISOString().slice(0, 10),
        amount: fee,
        status: "due",
        kind: "registration",
        seq: 0,
      });
    }

    const list = args.installments.length
      ? args.installments
      : tuition > 0
        ? [{ due_date: new Date().toISOString().slice(0, 10), amount: tuition }]
        : [];
    list.forEach((ins, idx) => {
      const row: Installment = {
        ...baseFields(),
        invoice_id: invoice.id,
        due_date: ins.due_date,
        amount: ins.amount,
        status: "due",
        kind: "installment",
        seq: idx + 1,
      };
      db.installments.push(row);
    });

    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "create", `تسجيل جديد بفاتورة ${invoice.number}`);
  });
}

/** Records a payment (receipt) against an invoice, optionally targeting one installment. */
export function recordPayment(
  args: {
    invoice_id: ID;
    installment_id?: ID | null;
    amount: number;
    method: Payment["method"];
    note?: string;
  },
  actor: Actor,
): ID {
  let created: ID = "";
  transact((db) => {
    const inv = db.invoices.find((i) => i.id === args.invoice_id);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status === "cancelled") throw new Error("لا يمكن القبض على فاتورة ملغاة");
    if (args.amount <= 0) throw new Error("المبلغ غير صالح");

    const paidBefore = db.payments
      .filter((p) => p.invoice_id === inv.id && !p.is_void)
      .reduce((s, p) => s + p.amount, 0);
    if (paidBefore + args.amount > inv.total) throw new Error("المبلغ يتجاوز رصيد الفاتورة");

    let installmentId: ID | null = args.installment_id ?? null;
    if (installmentId) {
      const ins = db.installments.find((i) => i.id === installmentId && i.invoice_id === inv.id);
      if (!ins) throw new Error("القسط غير موجود ضمن هذه الفاتورة");
      const remaining = ins.amount - installmentPaid(db, ins.id);
      if (args.amount > remaining) throw new Error("المبلغ يتجاوز المتبقي من هذه الدفعة");
    }

    const payment: Payment = {
      ...baseFields(),
      invoice_id: inv.id,
      installment_id: installmentId,
      student_id: inv.student_id,
      receipt_no: nextReceiptNo(db),
      amount: args.amount,
      method: args.method,
      paid_at: new Date().toISOString(),
      is_void: false,
      void_reason: "",
      user_id: actor.id,
      note: args.note ?? "",
    };
    db.payments.push(payment);
    created = payment.id;

    recomputeInvoice(db, inv.id);
    audit(db, actor, "payments", payment.id, "create", `قبض ${payment.receipt_no} بقيمة ${args.amount / 100}`);
  });
  return created;
}

/** Financial records are never deleted — only voided with a reason. */
export function voidPayment(paymentId: ID, reason: string, actor: Actor): void {
  transact((db) => {
    const p = db.payments.find((x) => x.id === paymentId);
    if (!p) throw new Error("الدفعة غير موجودة");
    if (p.is_void) throw new Error("الدفعة ملغاة مسبقًا");
    if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
    p.is_void = true;
    p.void_reason = reason.trim();
    p.updated_at = new Date().toISOString();

    recomputeInvoice(db, p.invoice_id);
    audit(db, actor, "payments", p.id, "void", `إلغاء إيصال ${p.receipt_no} — ${reason}`);
  });
}

export function profitAndLoss(db: DB, from: string, to: string) {
  const inRange = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  // Tuition + registration fees come exclusively from receipts (payments) — never re-entered as income.
  const tuition = db.payments.filter((p) => !p.is_void && inRange(p.paid_at)).reduce((s, p) => s + p.amount, 0);
  const otherIncome = db.incomes.filter((i) => !i.is_void && inRange(i.date)).reduce((s, i) => s + i.amount, 0);
  const expenses = db.expenses.filter((e) => !e.is_void && inRange(e.date)).reduce((s, e) => s + e.amount, 0);
  const payroll = db.payroll_items
    .filter((p) => p.status === "paid" && p.paid_at && inRange(p.paid_at))
    .reduce((s, p) => s + p.net, 0);
  const income = tuition + otherIncome;
  const cost = expenses + payroll;
  return { tuition, otherIncome, expenses, payroll, income, cost, net: income - cost };
}

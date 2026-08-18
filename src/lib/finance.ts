import { audit, baseFields, nextReceiptNo, transact, type Actor } from "./db";
import type { DB, ID, Installment, Invoice, Payment } from "./types";

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

/** Creates an enrollment + invoice + installments atomically. */
export function createEnrollmentWithInvoice(
  args: {
    student_id: ID;
    class_id: ID;
    price: number;
    discount: number;
    discount_reason: string;
    installments: { due_date: string; amount: number }[];
  },
  actor: Actor,
): void {
  transact((db) => {
    const total = Math.max(0, args.price - args.discount);
    const sum = args.installments.reduce((s, i) => s + i.amount, 0);
    if (args.installments.length > 0 && sum !== total) {
      throw new Error("مجموع الأقساط لا يساوي المبلغ الصافي");
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

    const list = args.installments.length
      ? args.installments
      : [{ due_date: new Date().toISOString().slice(0, 10), amount: total }];
    for (const ins of list) {
      const row: Installment = {
        ...baseFields(),
        invoice_id: invoice.id,
        due_date: ins.due_date,
        amount: ins.amount,
        status: total === 0 ? "paid" : "due",
      };
      db.installments.push(row);
    }

    audit(db, actor, "enrollments", enrollment.id, "create", `تسجيل جديد بفاتورة ${invoice.number}`);
  });
}

/** Records a payment, updates installments and invoice status atomically. */
export function recordPayment(
  args: { invoice_id: ID; amount: number; method: Payment["method"]; note?: string },
  actor: Actor,
): void {
  transact((db) => {
    const inv = db.invoices.find((i) => i.id === args.invoice_id);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status === "cancelled") throw new Error("لا يمكن القبض على فاتورة ملغاة");
    if (args.amount <= 0) throw new Error("المبلغ غير صالح");

    const paidBefore = db.payments
      .filter((p) => p.invoice_id === inv.id && !p.is_void)
      .reduce((s, p) => s + p.amount, 0);
    if (paidBefore + args.amount > inv.total) throw new Error("المبلغ يتجاوز رصيد الفاتورة");

    const payment: Payment = {
      ...baseFields(),
      invoice_id: inv.id,
      installment_id: null,
      student_id: inv.student_id,
      receipt_no: nextReceiptNo(db),
      amount: args.amount,
      method: args.method,
      paid_at: new Date().toISOString(),
      is_void: false,
      void_reason: "",
      user_id: actor.id,
    };
    db.payments.push(payment);

    // allocate across installments oldest-first
    let remaining = paidBefore + args.amount;
    const inst = db.installments
      .filter((i) => i.invoice_id === inv.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    for (const i of inst) {
      if (remaining >= i.amount) {
        i.status = "paid";
        remaining -= i.amount;
      } else if (remaining > 0) {
        i.status = "partial";
        remaining = 0;
      } else {
        i.status = "due";
      }
    }
    inv.status = paidBefore + args.amount >= inv.total ? "paid" : "open";

    audit(db, actor, "payments", payment.id, "create", `قبض ${payment.receipt_no} بقيمة ${args.amount / 100}`);
  });
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

    const inv = db.invoices.find((i) => i.id === p.invoice_id);
    if (inv) {
      const paid = db.payments
        .filter((x) => x.invoice_id === inv.id && !x.is_void)
        .reduce((s, x) => s + x.amount, 0);
      inv.status = paid >= inv.total ? "paid" : "open";
      let remaining = paid;
      for (const i of db.installments
        .filter((i) => i.invoice_id === inv.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))) {
        if (remaining >= i.amount) {
          i.status = "paid";
          remaining -= i.amount;
        } else if (remaining > 0) {
          i.status = "partial";
          remaining = 0;
        } else {
          i.status = "due";
        }
      }
    }
    audit(db, actor, "payments", p.id, "void", `إلغاء إيصال ${p.receipt_no} — ${reason}`);
  });
}

export function profitAndLoss(db: DB, from: string, to: string) {
  const inRange = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
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

import { audit, baseFields, nextReceiptNo, transact, type Actor } from "./db";
import type { DB, ID, Installment, Invoice, Payment } from "./types";
import { localDateKey, today } from "./format";

export interface InvoiceFinancials {
  total: number;
  paid: number;
  due: number;
  status: Invoice["status"];
}

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
  return invoiceFinancials(db, invoiceId).due;
}

export function invoiceFinancials(db: DB, invoiceOrId: Invoice | ID): InvoiceFinancials {
  const invoice = typeof invoiceOrId === "string"
    ? db.invoices.find((item) => item.id === invoiceOrId)
    : invoiceOrId;
  if (!invoice) return { total: 0, paid: 0, due: 0, status: "cancelled" };

  const paid = db.payments
    .filter((payment) => payment.invoice_id === invoice.id && !payment.is_void)
    .reduce((sum, payment) => sum + payment.amount, 0);

  return {
    total: invoice.total,
    paid,
    due: invoice.status === "cancelled" ? 0 : Math.max(0, invoice.total - paid),
    status: invoice.status,
  };
}

export function studentBalanceMap(db: DB): Map<ID, { billed: number; paid: number; due: number }> {
  const result = new Map<ID, { billed: number; paid: number; due: number }>();
  const activeInvoiceIds = new Set<ID>();

  for (const invoice of db.invoices) {
    if (invoice.status === "cancelled") continue;
    activeInvoiceIds.add(invoice.id);
    const current = result.get(invoice.student_id) ?? { billed: 0, paid: 0, due: 0 };
    current.billed += invoice.total;
    result.set(invoice.student_id, current);
  }

  for (const payment of db.payments) {
    if (payment.is_void || !activeInvoiceIds.has(payment.invoice_id)) continue;
    const current = result.get(payment.student_id) ?? { billed: 0, paid: 0, due: 0 };
    current.paid += payment.amount;
    result.set(payment.student_id, current);
  }

  for (const current of result.values()) current.due = Math.max(0, current.billed - current.paid);
  return result;
}

export function studentBalance(db: DB, studentId: ID): { billed: number; paid: number; due: number } {
  return studentBalanceMap(db).get(studentId) ?? { billed: 0, paid: 0, due: 0 };
}

export function overdueInstallments(db: DB, onDate = today()) {
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
    const student = db.students.find((item) => item.id === args.student_id);
    if (!student || student.status !== "active") throw new Error("لا يمكن تسجيل طالب غير نشط أو مؤرشف");
    const klass = db.classes.find((item) => item.id === args.class_id);
    if (!klass) throw new Error("الصف غير موجود");
    if (db.enrollments.some((item) => item.student_id === args.student_id && item.class_id === args.class_id && item.status === "active")) {
      throw new Error("الطالب مسجّل مسبقًا في هذا الصف");
    }
    const enrolledCount = db.enrollments.filter(
      (item) => item.class_id === args.class_id && item.status !== "cancelled" && item.status !== "withdrawn",
    ).length;
    if (klass.capacity > 0 && enrolledCount >= klass.capacity) throw new Error("الصف مكتمل العدد");
    if (![args.price, args.discount, args.registration_fee ?? 0].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل المالية غير صالحة");
    }
    if (args.discount > args.price) throw new Error("الخصم لا يمكن أن يتجاوز سعر الدورة");

    const fee = args.registration_fee ?? 0;
    const tuition = args.price - args.discount;
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

    let invoiceSequence = db.invoices.length + 1;
    let invoiceNumber = `INV-${String(invoiceSequence).padStart(5, "0")}`;
    while (db.invoices.some((item) => item.number === invoiceNumber)) {
      invoiceSequence += 1;
      invoiceNumber = `INV-${String(invoiceSequence).padStart(5, "0")}`;
    }
    const invoice: Invoice = {
      ...baseFields(),
      number: invoiceNumber,
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
        due_date: today(),
        amount: fee,
        status: "due",
        kind: "registration",
        seq: 0,
      });
    }

    const list = args.installments.length
      ? args.installments
      : tuition > 0
        ? [{ due_date: today(), amount: tuition }]
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

/** Updates an existing enrollment and rebuilds its invoice installments.
 * Financial values can only be changed while the invoice has no active receipts.
 */
export function updateEnrollmentWithInvoice(
  args: {
    enrollment_id: ID;
    price: number;
    discount: number;
    registration_fee?: number;
    discount_reason: string;
    installments: { due_date: string; amount: number }[];
  },
  actor: Actor,
): void {
  transact((db) => {
    const enrollment = db.enrollments.find((e) => e.id === args.enrollment_id);
    if (!enrollment) throw new Error("التسجيل غير موجود");
    if (enrollment.status === "cancelled") throw new Error("لا يمكن تعديل تسجيل ملغى");

    const invoice = db.invoices.find((i) => i.enrollment_id === enrollment.id && i.status !== "cancelled");
    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");

    const hasPayments = db.payments.some((p) => p.invoice_id === invoice.id && !p.is_void);
    if (hasPayments) {
      throw new Error("لا يمكن تعديل قيمة تسجيل عليه سند قبض. ألغِ السند المالي أولاً ثم عدّل التسجيل.");
    }

    if (![args.price, args.discount, args.registration_fee ?? 0].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل المالية غير صالحة");
    }
    if (args.discount > args.price) throw new Error("الخصم لا يمكن أن يتجاوز سعر الدورة");

    const fee = args.registration_fee ?? 0;
    const tuition = args.price - args.discount;
    const total = tuition + fee;
    const sum = args.installments.reduce((s, i) => s + i.amount, 0);
    if (args.installments.length > 0 && sum !== tuition) {
      throw new Error("مجموع الأقساط لا يساوي قيمة الدورة الصافية (بدون رسوم التسجيل)");
    }

    enrollment.price_snapshot = args.price;
    enrollment.discount_snapshot = args.discount;
    enrollment.discount_reason = args.discount_reason;
    enrollment.updated_at = new Date().toISOString();

    invoice.total = total;
    invoice.status = total === 0 ? "paid" : "open";
    invoice.updated_at = new Date().toISOString();

    // Safe because editing is blocked when active receipts exist.
    db.installments = db.installments.filter((i) => i.invoice_id !== invoice.id);

    if (fee > 0) {
      db.installments.push({
        ...baseFields(),
        invoice_id: invoice.id,
        due_date: today(),
        amount: fee,
        status: "due",
        kind: "registration",
        seq: 0,
      });
    }

    const list = args.installments.length
      ? args.installments
      : tuition > 0
        ? [{ due_date: today(), amount: tuition }]
        : [];

    list.forEach((ins, idx) => {
      db.installments.push({
        ...baseFields(),
        invoice_id: invoice.id,
        due_date: ins.due_date,
        amount: ins.amount,
        status: "due",
        kind: "installment",
        seq: idx + 1,
      });
    });

    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "update", `تعديل التسجيل والفاتورة ${invoice.number}`);
  });
}

/** Cancels an enrollment and its invoice when no active receipt exists. */
export function cancelEnrollmentWithInvoice(enrollmentId: ID, actor: Actor): void {
  transact((db) => {
    const enrollment = db.enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment) throw new Error("التسجيل غير موجود");
    if (enrollment.status === "cancelled") throw new Error("التسجيل ملغى مسبقًا");

    const invoice = db.invoices.find((i) => i.enrollment_id === enrollment.id && i.status !== "cancelled");
    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");

    const hasPayments = db.payments.some((p) => p.invoice_id === invoice.id && !p.is_void);
    if (hasPayments) {
      throw new Error("لا يمكن إلغاء تسجيل عليه سند قبض. ألغِ السند المالي أولاً ثم ألغِ التسجيل.");
    }

    enrollment.status = "cancelled";
    enrollment.updated_at = new Date().toISOString();
    invoice.status = "cancelled";
    invoice.updated_at = new Date().toISOString();

    audit(db, actor, "enrollments", enrollment.id, "cancel", `إلغاء التسجيل والفاتورة ${invoice.number}`);
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
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("المبلغ غير صالح");

    const paidBefore = db.payments
      .filter((p) => p.invoice_id === inv.id && !p.is_void)
      .reduce((s, p) => s + p.amount, 0);
    if (paidBefore + args.amount > inv.total) throw new Error("المبلغ يتجاوز رصيد الفاتورة");

    const installmentId: ID | null = args.installment_id ?? null;
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
      voided_at: null,
      user_id: actor.id,
      note: args.note ?? "",
      invoice_total_snapshot: inv.total,
      paid_after_snapshot: paidBefore + args.amount,
      due_after_snapshot: Math.max(0, inv.total - paidBefore - args.amount),
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
    p.voided_at = new Date().toISOString();
    p.updated_at = new Date().toISOString();

    recomputeInvoice(db, p.invoice_id);
    audit(db, actor, "payments", p.id, "void", `إلغاء إيصال ${p.receipt_no} — ${reason}`);
  });
}

export function voidExpense(expenseId: ID, actor: Actor): void {
  transact((db) => {
    const expense = db.expenses.find((item) => item.id === expenseId);
    if (!expense) throw new Error("المصروف غير موجود");
    if (expense.is_void) throw new Error("المصروف ملغى مسبقًا");
    expense.is_void = true;
    expense.updated_at = new Date().toISOString();
    audit(db, actor, "expenses", expense.id, "void", `إلغاء مصروف ${expense.category} بقيمة ${expense.amount / 100}`);
  });
}

export function profitAndLoss(db: DB, from: string, to: string) {
  const inRange = (d: string) => {
    const key = localDateKey(d);
    return key >= from && key <= to;
  };
  const activeInvoiceIds = new Set(
    db.invoices.filter((invoice) => invoice.status !== "cancelled").map((invoice) => invoice.id),
  );
  // Tuition + registration fees come exclusively from receipts (payments) — never re-entered as income.
  const tuition = db.payments
    .filter((payment) => !payment.is_void && activeInvoiceIds.has(payment.invoice_id) && inRange(payment.paid_at))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const otherIncome = db.incomes.filter((i) => !i.is_void && inRange(i.date)).reduce((s, i) => s + i.amount, 0);
  const expenses = db.expenses.filter((e) => !e.is_void && inRange(e.date)).reduce((s, e) => s + e.amount, 0);
  // مصروف الراتب الحقيقي لا ينقص بسبب السلفة؛ السلفة دُفعت للموظف مسبقًا
  // ثم تُخصم من صافي الراتب عند التسوية. لذلك نحسب: الصافي المدفوع + السلفة المخصومة.
  const payroll = db.payroll_items
    .filter((p) => p.status === "paid" && p.paid_at && inRange(p.paid_at))
    .reduce((sum, item) => sum + payrollItemCost(item), 0);
  const income = tuition + otherIncome;
  const cost = expenses + payroll;
  return { tuition, otherIncome, expenses, payroll, income, cost, net: income - cost };
}

export function payrollItemCost(item: { base_snapshot: number; bonus: number; deduction: number }): number {
  return Math.max(0, item.base_snapshot + item.bonus - item.deduction);
}

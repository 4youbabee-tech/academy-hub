import { audit, baseFields, nextReceiptNo, transact, type Actor } from "./db";
import type { DB, Enrollment, ID, Installment, Invoice, Payment } from "./types";
import { localDateKey, today } from "./format";

export interface InvoiceFinancials {
  total: number;
  paid: number;
  due: number;
  status: Invoice["status"];
}

export interface MonthlyLedgerRow {
  installment_id: ID;
  invoice_id: ID;
  enrollment_id: ID;
  period: string;
  due_date: string;
  amount: number;
  paid: number;
  due: number;
  status: Installment["status"];
}

export interface MonthlyChargeGenerationResult {
  period: string;
  created: number;
  skipped: number;
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("الفترة الشهرية غير صالحة");
}

function periodRange(from: string, to: string): string[] {
  assertPeriod(from);
  assertPeriod(to);
  if (from > to) return [];
  const startParts = from.split("-");
  const endParts = to.split("-");
  const startYear = Number(startParts[0]);
  const startMonth = Number(startParts[1]);
  const endYear = Number(endParts[0]);
  const endMonth = Number(endParts[1]);
  const rows: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    rows.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return rows;
}

export function installmentLabel(ins: Installment): string {
  if (ins.kind === "registration") return "رسوم التسجيل";
  if (ins.kind === "monthly" && ins.period) return `استحقاق ${ins.period}`;
  return `قسط رقم ${ins.seq ?? 1}`;
}

/** Sorted, active installments of an invoice. Registration is first, then chronological due date. */
export function invoiceInstallments(db: DB, invoiceId: ID): Installment[] {
  return db.installments
    .filter((item) => item.invoice_id === invoiceId && !item.is_void)
    .sort((a, b) => {
      const kind = Number(a.kind !== "registration") - Number(b.kind !== "registration");
      return kind || a.due_date.localeCompare(b.due_date) || (a.seq ?? 1) - (b.seq ?? 1);
    });
}

/** One authoritative receipt allocator. Unassigned receipts are FIFO to the oldest balance. */
export function installmentAllocationMap(db: DB, invoiceId: ID): Map<ID, number> {
  const list = invoiceInstallments(db, invoiceId);
  const ids = new Set(list.map((item) => item.id));
  const allocated = new Map<ID, number>();
  let pool = 0;

  for (const payment of db.payments.filter((item) => item.invoice_id === invoiceId && !item.is_void)) {
    if (payment.installment_id && ids.has(payment.installment_id)) {
      allocated.set(payment.installment_id, (allocated.get(payment.installment_id) ?? 0) + payment.amount);
    } else {
      pool += payment.amount;
    }
  }

  for (const installment of list) {
    const direct = allocated.get(installment.id) ?? 0;
    const remaining = Math.max(0, installment.amount - direct);
    const take = Math.min(pool, remaining);
    if (take > 0) {
      allocated.set(installment.id, direct + take);
      pool -= take;
    }
  }
  return allocated;
}

export function installmentPaid(db: DB, installmentId: ID): number {
  const installment = db.installments.find((item) => item.id === installmentId && !item.is_void);
  if (!installment) return 0;
  return installmentAllocationMap(db, installment.invoice_id).get(installmentId) ?? 0;
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
  return db.installments.filter((installment) => {
    if (installment.is_void || installment.status === "paid") return false;
    const invoice = db.invoices.find((item) => item.id === installment.invoice_id);
    if (!invoice || invoice.status === "cancelled") return false;
    return installment.due_date < onDate;
  });
}

/** Recomputes installment + invoice statuses and total from active installments + non-void receipts. */
export function recomputeInvoice(db: DB, invoiceId: ID): void {
  const invoice = db.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  const list = invoiceInstallments(db, invoiceId);
  const allocated = installmentAllocationMap(db, invoiceId);
  const now = new Date().toISOString();
  if (list.length > 0) invoice.total = list.reduce((sum, item) => sum + item.amount, 0);
  for (const installment of list) {
    const paid = allocated.get(installment.id) ?? 0;
    installment.status = paid >= installment.amount ? "paid" : paid > 0 ? "partial" : "due";
    installment.updated_at = now;
  }
  if (invoice.status !== "cancelled") {
    const paid = db.payments
      .filter((payment) => payment.invoice_id === invoice.id && !payment.is_void)
      .reduce((sum, payment) => sum + payment.amount, 0);
    invoice.status = paid >= invoice.total ? "paid" : "open";
    invoice.updated_at = now;
  }
}

function nextInvoiceNumber(db: DB): string {
  let sequence = db.invoices.length + 1;
  let number = `INV-${String(sequence).padStart(5, "0")}`;
  while (db.invoices.some((item) => item.number === number)) {
    sequence += 1;
    number = `INV-${String(sequence).padStart(5, "0")}`;
  }
  return number;
}

function assertEnrollmentAvailable(db: DB, studentId: ID, classId: ID): void {
  const student = db.students.find((item) => item.id === studentId);
  if (!student || student.status !== "active") throw new Error("لا يمكن تسجيل طالب غير نشط أو مؤرشف");
  const klass = db.classes.find((item) => item.id === classId);
  if (!klass) throw new Error("الصف غير موجود");
  if (db.enrollments.some((item) => item.student_id === studentId && item.class_id === classId && item.status === "active")) {
    throw new Error("الطالب مسجّل مسبقًا في هذا الصف");
  }
  const enrolledCount = db.enrollments.filter(
    (item) => item.class_id === classId && item.status !== "cancelled" && item.status !== "withdrawn",
  ).length;
  if (klass.capacity > 0 && enrolledCount >= klass.capacity) throw new Error("الصف مكتمل العدد");
}

function activeEnrollmentInvoice(db: DB, enrollmentId: ID): Invoice | undefined {
  return db.invoices.find((item) => item.enrollment_id === enrollmentId && item.status !== "cancelled");
}

function createMonthlyChargeInDb(db: DB, enrollment: Enrollment, period: string): boolean {
  if (enrollment.billing_mode !== "monthly") return false;
  assertPeriod(period);
  if (!enrollment.billing_start_period || period < enrollment.billing_start_period) return false;
  if (enrollment.billing_end_period && period > enrollment.billing_end_period) return false;
  if (enrollment.status !== "active" && !enrollment.billing_end_period) return false;
  if (enrollment.skipped_periods?.includes(period)) return false;
  const invoice = activeEnrollmentInvoice(db, enrollment.id);
  if (!invoice) return false;
  if (db.installments.some(
    (item) => item.invoice_id === invoice.id && item.kind === "monthly" && item.period === period && !item.is_void,
  )) return false;

  const amount = enrollment.monthly_price_snapshot ?? Math.max(0, enrollment.price_snapshot - enrollment.discount_snapshot);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("قيمة الاستحقاق الشهري غير صالحة");
  db.installments.push({
    ...baseFields(),
    invoice_id: invoice.id,
    due_date: `${period}-01`,
    amount,
    status: amount === 0 ? "paid" : "due",
    kind: "monthly",
    seq: invoiceInstallments(db, invoice.id).filter((item) => item.kind === "monthly").length + 1,
    period,
    is_void: false,
    void_reason: "",
    voided_at: null,
  });
  recomputeInvoice(db, invoice.id);
  return true;
}

/** Creates a legacy one-time enrollment + invoice + installments atomically. */
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
    assertEnrollmentAvailable(db, args.student_id, args.class_id);
    if (![args.price, args.discount, args.registration_fee ?? 0].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل المالية غير صالحة");
    }
    if (args.discount > args.price) throw new Error("الخصم لا يمكن أن يتجاوز سعر الدورة");
    const fee = args.registration_fee ?? 0;
    const tuition = args.price - args.discount;
    const total = tuition + fee;
    const sum = args.installments.reduce((value, item) => value + item.amount, 0);
    if (args.installments.length > 0 && sum !== tuition) {
      throw new Error("مجموع الأقساط لا يساوي قيمة الدورة الصافية (بدون رسوم التسجيل)");
    }

    const enrollment: Enrollment = {
      ...baseFields(),
      student_id: args.student_id,
      class_id: args.class_id,
      enrolled_at: new Date().toISOString(),
      price_snapshot: args.price,
      discount_snapshot: args.discount,
      discount_reason: args.discount_reason,
      billing_mode: "legacy",
      billing_start_period: null,
      billing_end_period: null,
      monthly_price_snapshot: 0,
      discount_preset_id: null,
      discount_title_snapshot: args.discount_reason,
      status: "active",
    };
    db.enrollments.push(enrollment);
    const invoice: Invoice = {
      ...baseFields(),
      number: nextInvoiceNumber(db),
      enrollment_id: enrollment.id,
      student_id: args.student_id,
      total,
      status: total === 0 ? "paid" : "open",
      issued_at: new Date().toISOString(),
    };
    db.invoices.push(invoice);
    if (fee > 0) {
      db.installments.push({
        ...baseFields(), invoice_id: invoice.id, due_date: today(), amount: fee, status: "due",
        kind: "registration", seq: 0, period: null, is_void: false, void_reason: "", voided_at: null,
      });
    }
    const list = args.installments.length
      ? args.installments
      : tuition > 0
        ? [{ due_date: today(), amount: tuition }]
        : [];
    list.forEach((item, index) => db.installments.push({
      ...baseFields(), invoice_id: invoice.id, due_date: item.due_date, amount: item.amount, status: "due",
      kind: "installment", seq: index + 1, period: null, is_void: false, void_reason: "", voided_at: null,
    }));
    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "create", `تسجيل جديد بفاتورة ${invoice.number}`);
  });
}

/** Creates a recurring monthly enrollment. Existing legacy enrollments are never reinterpreted. */
export function createMonthlyEnrollmentWithInvoice(
  args: {
    student_id: ID;
    class_id: ID;
    monthly_price: number;
    discount: number;
    discount_preset_id?: ID | null;
    discount_title?: string;
    registration_fee?: number;
    start_period: string;
  },
  actor: Actor,
): void {
  assertPeriod(args.start_period);
  transact((db) => {
    assertEnrollmentAvailable(db, args.student_id, args.class_id);
    const fee = args.registration_fee ?? 0;
    if (![args.monthly_price, args.discount, fee].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل الشهرية غير صالحة");
    }
    if (args.discount > args.monthly_price) throw new Error("الخصم لا يمكن أن يتجاوز القسط الشهري");
    const monthlyNet = args.monthly_price - args.discount;
    const enrollment: Enrollment = {
      ...baseFields(), student_id: args.student_id, class_id: args.class_id, enrolled_at: new Date().toISOString(),
      price_snapshot: args.monthly_price, discount_snapshot: args.discount,
      discount_reason: args.discount_title?.trim() ?? "", billing_mode: "monthly",
      billing_start_period: args.start_period, billing_end_period: null,
      monthly_price_snapshot: monthlyNet, discount_preset_id: args.discount_preset_id ?? null,
      discount_title_snapshot: args.discount_title?.trim() ?? "", skipped_periods: [], status: "active",
    };
    db.enrollments.push(enrollment);
    const invoice: Invoice = {
      ...baseFields(), number: nextInvoiceNumber(db), enrollment_id: enrollment.id, student_id: args.student_id,
      total: fee, status: fee === 0 ? "paid" : "open", issued_at: new Date().toISOString(),
    };
    db.invoices.push(invoice);
    if (fee > 0) {
      db.installments.push({
        ...baseFields(), invoice_id: invoice.id, due_date: today(), amount: fee, status: "due",
        kind: "registration", seq: 0, period: null, is_void: false, void_reason: "", voided_at: null,
      });
    }
    const currentPeriod = today().slice(0, 7);
    for (const period of periodRange(args.start_period, currentPeriod)) createMonthlyChargeInDb(db, enrollment, period);
    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "create", `تسجيل شهري جديد بفاتورة ${invoice.number}`);
  });
}

/** Converts one active legacy registration to a new monthly account without altering its historical invoice. */
export function transitionLegacyEnrollmentToMonthly(
  args: {
    enrollment_id: ID;
    monthly_price: number;
    discount: number;
    discount_preset_id?: ID | null;
    discount_title?: string;
    start_period: string;
  },
  actor: Actor,
): ID {
  assertPeriod(args.start_period);
  let createdId: ID = "";
  transact((db) => {
    const legacy = db.enrollments.find((item) => item.id === args.enrollment_id);
    if (!legacy) throw new Error("التسجيل القديم غير موجود");
    if (legacy.billing_mode === "monthly") throw new Error("هذا التسجيل شهري بالفعل");
    if (legacy.status !== "active") throw new Error("يمكن تحويل التسجيلات القديمة النشطة فقط");
    if (![args.monthly_price, args.discount].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل الشهرية غير صالحة");
    }
    if (args.discount > args.monthly_price) throw new Error("الخصم لا يمكن أن يتجاوز القسط الشهري");
    const student = db.students.find((item) => item.id === legacy.student_id);
    if (!student || student.status !== "active") throw new Error("لا يمكن تحويل تسجيل طالب غير نشط أو مؤرشف");
    if (!db.classes.some((item) => item.id === legacy.class_id)) throw new Error("الصف غير موجود");

    legacy.status = "withdrawn";
    legacy.updated_at = new Date().toISOString();

    const monthlyNet = args.monthly_price - args.discount;
    const enrollment: Enrollment = {
      ...baseFields(),
      student_id: legacy.student_id,
      class_id: legacy.class_id,
      enrolled_at: new Date().toISOString(),
      price_snapshot: args.monthly_price,
      discount_snapshot: args.discount,
      discount_reason: args.discount_title?.trim() ?? "",
      billing_mode: "monthly",
      billing_start_period: args.start_period,
      billing_end_period: null,
      monthly_price_snapshot: monthlyNet,
      discount_preset_id: args.discount_preset_id ?? null,
      discount_title_snapshot: args.discount_title?.trim() ?? "",
      skipped_periods: [],
      status: "active",
    };
    db.enrollments.push(enrollment);
    createdId = enrollment.id;
    const invoice: Invoice = {
      ...baseFields(),
      number: nextInvoiceNumber(db),
      enrollment_id: enrollment.id,
      student_id: enrollment.student_id,
      total: 0,
      status: "paid",
      issued_at: new Date().toISOString(),
    };
    db.invoices.push(invoice);
    const currentPeriod = today().slice(0, 7);
    for (const period of periodRange(args.start_period, currentPeriod)) createMonthlyChargeInDb(db, enrollment, period);
    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "transition-monthly", `تحويل التسجيل القديم ${legacy.id} إلى نظام شهري من ${args.start_period} دون تعديل الفاتورة التاريخية`);
  });
  return createdId;
}

/** Updates the price/discount snapshot used only by future monthly charges. Existing months remain immutable. */
export function updateMonthlyEnrollmentTerms(
  args: {
    enrollment_id: ID;
    monthly_price: number;
    discount: number;
    discount_preset_id?: ID | null;
    discount_title?: string;
  },
  actor: Actor,
): void {
  transact((db) => {
    const enrollment = db.enrollments.find((item) => item.id === args.enrollment_id);
    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");
    if (enrollment.status !== "active") throw new Error("لا يمكن تعديل شروط تسجيل شهري غير نشط");
    if (![args.monthly_price, args.discount].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل الشهرية غير صالحة");
    }
    if (args.discount > args.monthly_price) throw new Error("الخصم لا يمكن أن يتجاوز القسط الشهري");
    enrollment.price_snapshot = args.monthly_price;
    enrollment.discount_snapshot = args.discount;
    enrollment.monthly_price_snapshot = args.monthly_price - args.discount;
    enrollment.discount_preset_id = args.discount_preset_id ?? null;
    enrollment.discount_title_snapshot = args.discount_title?.trim() ?? "";
    enrollment.discount_reason = args.discount_title?.trim() ?? "";
    enrollment.updated_at = new Date().toISOString();
    audit(db, actor, "enrollments", enrollment.id, "update-monthly-terms", `تحديث شروط القسط الشهري للمستقبل إلى ${enrollment.monthly_price_snapshot / 100}`);
  });
}

export function generateMonthlyStudentChargesInDb(db: DB, period: string): number {
  assertPeriod(period);
  let created = 0;
  for (const enrollment of db.enrollments.filter((item) => item.billing_mode === "monthly")) {
    if (createMonthlyChargeInDb(db, enrollment, period)) created += 1;
  }
  return created;
}

/** Generates exactly one target period for all eligible monthly enrollments; safe to call repeatedly. */
export function generateMonthlyStudentCharges(period: string, actor: Actor): MonthlyChargeGenerationResult {
  assertPeriod(period);
  const result: MonthlyChargeGenerationResult = { period, created: 0, skipped: 0 };
  transact((db) => {
    const eligible = db.enrollments.filter((item) => item.billing_mode === "monthly").length;
    result.created = generateMonthlyStudentChargesInDb(db, period);
    result.skipped = Math.max(0, eligible - result.created);
    if (result.created > 0) audit(db, actor, "installments", null, "generate", `توليد استحقاقات ${period}: ${result.created}`);
  });
  return result;
}

/** Fills every missing monthly charge from each enrollment start through targetPeriod. */
export function catchUpMonthlyStudentCharges(targetPeriod: string, actor: Actor): MonthlyChargeGenerationResult {
  assertPeriod(targetPeriod);
  const result: MonthlyChargeGenerationResult = { period: targetPeriod, created: 0, skipped: 0 };
  transact((db) => {
    for (const enrollment of db.enrollments.filter((item) => item.billing_mode === "monthly" && item.billing_start_period)) {
      const end = enrollment.billing_end_period && enrollment.billing_end_period < targetPeriod
        ? enrollment.billing_end_period
        : targetPeriod;
      for (const period of periodRange(enrollment.billing_start_period!, end)) {
        if (createMonthlyChargeInDb(db, enrollment, period)) result.created += 1;
        else result.skipped += 1;
      }
    }
    if (result.created > 0) audit(db, actor, "installments", null, "catch-up", `استكمال الاستحقاقات حتى ${targetPeriod}: ${result.created}`);
  });
  return result;
}

/** Stops future monthly generation without touching historical debt. */
export function stopMonthlyEnrollment(enrollmentId: ID, endPeriod: string, actor: Actor): void {
  assertPeriod(endPeriod);
  transact((db) => {
    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");
    if (enrollment.billing_start_period && endPeriod < enrollment.billing_start_period) {
      throw new Error("شهر الإيقاف لا يمكن أن يسبق شهر البداية");
    }
    enrollment.billing_end_period = endPeriod;
    enrollment.status = "withdrawn";
    enrollment.updated_at = new Date().toISOString();
    audit(db, actor, "enrollments", enrollment.id, "withdraw", `إيقاف الاستحقاق الشهري بعد ${endPeriod}`);
  });
}

export function voidInstallment(installmentId: ID, reason: string, actor: Actor): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const installment = db.installments.find((item) => item.id === installmentId);
    if (!installment) throw new Error("الاستحقاق غير موجود");
    if (installment.is_void) throw new Error("الاستحقاق ملغى مسبقًا");
    const allocated = installmentAllocationMap(db, installment.invoice_id).get(installment.id) ?? 0;
    if (allocated > 0) throw new Error("لا يمكن إلغاء استحقاق عليه دفعة. ألغِ سند القبض المرتبط أولًا.");
    installment.is_void = true;
    installment.void_reason = reason.trim();
    installment.voided_at = new Date().toISOString();
    installment.updated_at = installment.voided_at;
    recomputeInvoice(db, installment.invoice_id);
    audit(db, actor, "installments", installment.id, "void", `إلغاء ${installmentLabel(installment)} — ${reason.trim()}`);
  });
}

/** Marks one month as intentionally not attended. It never deletes history. */
export function skipMonthlyEnrollmentPeriod(enrollmentId: ID, period: string, reason: string, actor: Actor): void {
  assertPeriod(period);
  if (!reason.trim()) throw new Error("سبب تخطي الشهر إلزامي");
  transact((db) => {
    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");
    if (enrollment.billing_start_period && period < enrollment.billing_start_period) {
      throw new Error("لا يمكن تخطي شهر يسبق بداية التسجيل");
    }
    if (enrollment.billing_end_period && period > enrollment.billing_end_period) {
      throw new Error("هذا الشهر خارج فترة التسجيل بعد الإيقاف");
    }
    if (enrollment.skipped_periods?.includes(period)) return;
    const invoice = activeEnrollmentInvoice(db, enrollment.id);
    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");
    const installment = db.installments.find((item) =>
      item.invoice_id === invoice.id && item.kind === "monthly" && item.period === period && !item.is_void,
    );
    if (installment) {
      const allocated = installmentAllocationMap(db, invoice.id).get(installment.id) ?? 0;
      if (allocated > 0) throw new Error("لا يمكن تخطي شهر عليه دفعة. ألغِ سند القبض المرتبط أولًا.");
      installment.is_void = true;
      installment.void_reason = "شهر متخطّى: " + reason.trim();
      installment.voided_at = new Date().toISOString();
      installment.updated_at = installment.voided_at;
      recomputeInvoice(db, invoice.id);
    }
    enrollment.skipped_periods = [...new Set([...(enrollment.skipped_periods ?? []), period])].sort();
    enrollment.updated_at = new Date().toISOString();
    audit(db, actor, "enrollments", enrollment.id, "skip-month", "تخطي شهر " + period + " — " + reason.trim());
  });
}

/** Restores a skipped month. If the period is already due, its charge is recreated immediately. */
export function restoreMonthlyEnrollmentPeriod(enrollmentId: ID, period: string, actor: Actor): void {
  assertPeriod(period);
  transact((db) => {
    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");
    if (!(enrollment.skipped_periods ?? []).includes(period)) throw new Error("هذا الشهر غير متخطّى");
    enrollment.skipped_periods = (enrollment.skipped_periods ?? []).filter((item) => item !== period);
    enrollment.updated_at = new Date().toISOString();
    if (period <= today().slice(0, 7)) createMonthlyChargeInDb(db, enrollment, period);
    audit(db, actor, "enrollments", enrollment.id, "restore-month", "إعادة شهر " + period + " إلى خطة التسجيل");
  });
}

export function studentMonthlyLedger(db: DB, studentId: ID): MonthlyLedgerRow[] {
  const invoiceById = new Map(db.invoices.map((item) => [item.id, item]));
  const enrollmentById = new Map(db.enrollments.map((item) => [item.id, item]));
  const allocations = new Map<ID, Map<ID, number>>();
  const rows: MonthlyLedgerRow[] = [];
  for (const installment of db.installments) {
    if (installment.kind !== "monthly" || installment.is_void || !installment.period) continue;
    const invoice = invoiceById.get(installment.invoice_id);
    if (!invoice || invoice.student_id !== studentId || invoice.status === "cancelled") continue;
    const enrollment = enrollmentById.get(invoice.enrollment_id);
    if (!enrollment) continue;
    let allocation = allocations.get(invoice.id);
    if (!allocation) {
      allocation = installmentAllocationMap(db, invoice.id);
      allocations.set(invoice.id, allocation);
    }
    const paid = Math.min(installment.amount, allocation.get(installment.id) ?? 0);
    rows.push({
      installment_id: installment.id, invoice_id: invoice.id, enrollment_id: enrollment.id,
      period: installment.period, due_date: installment.due_date, amount: installment.amount,
      paid, due: Math.max(0, installment.amount - paid),
      status: paid >= installment.amount ? "paid" : paid > 0 ? "partial" : "due",
    });
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period) || a.due_date.localeCompare(b.due_date));
}

/** Updates an existing legacy enrollment and rebuilds its invoice installments. */
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
    const enrollment = db.enrollments.find((item) => item.id === args.enrollment_id);
    if (!enrollment) throw new Error("التسجيل غير موجود");
    if (enrollment.billing_mode === "monthly") throw new Error("استخدم إعدادات التسجيل الشهري لتعديل هذا التسجيل");
    if (enrollment.status === "cancelled") throw new Error("لا يمكن تعديل تسجيل ملغى");
    const invoice = activeEnrollmentInvoice(db, enrollment.id);
    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");
    if (db.payments.some((item) => item.invoice_id === invoice.id && !item.is_void)) {
      throw new Error("لا يمكن تعديل قيمة تسجيل عليه سند قبض. ألغِ السند المالي أولاً ثم عدّل التسجيل.");
    }
    if (![args.price, args.discount, args.registration_fee ?? 0].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error("قيم التسجيل المالية غير صالحة");
    }
    if (args.discount > args.price) throw new Error("الخصم لا يمكن أن يتجاوز سعر الدورة");
    const fee = args.registration_fee ?? 0;
    const tuition = args.price - args.discount;
    const sum = args.installments.reduce((value, item) => value + item.amount, 0);
    if (args.installments.length > 0 && sum !== tuition) {
      throw new Error("مجموع الأقساط لا يساوي قيمة الدورة الصافية (بدون رسوم التسجيل)");
    }
    enrollment.price_snapshot = args.price;
    enrollment.discount_snapshot = args.discount;
    enrollment.discount_reason = args.discount_reason;
    enrollment.discount_title_snapshot = args.discount_reason;
    enrollment.updated_at = new Date().toISOString();
    db.installments = db.installments.filter((item) => item.invoice_id !== invoice.id);
    if (fee > 0) {
      db.installments.push({
        ...baseFields(), invoice_id: invoice.id, due_date: today(), amount: fee, status: "due",
        kind: "registration", seq: 0, period: null, is_void: false, void_reason: "", voided_at: null,
      });
    }
    const list = args.installments.length ? args.installments : tuition > 0 ? [{ due_date: today(), amount: tuition }] : [];
    list.forEach((item, index) => db.installments.push({
      ...baseFields(), invoice_id: invoice.id, due_date: item.due_date, amount: item.amount, status: "due",
      kind: "installment", seq: index + 1, period: null, is_void: false, void_reason: "", voided_at: null,
    }));
    recomputeInvoice(db, invoice.id);
    audit(db, actor, "enrollments", enrollment.id, "update", `تعديل التسجيل والفاتورة ${invoice.number}`);
  });
}

/** Cancels an enrollment and invoice when no active receipt exists. Historical rows stay preserved. */
export function cancelEnrollmentWithInvoice(enrollmentId: ID, actor: Actor): void {
  transact((db) => {
    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);
    if (!enrollment) throw new Error("التسجيل غير موجود");
    if (enrollment.status === "cancelled") throw new Error("التسجيل ملغى مسبقًا");
    const invoice = activeEnrollmentInvoice(db, enrollment.id);
    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");
    if (db.payments.some((item) => item.invoice_id === invoice.id && !item.is_void)) {
      throw new Error("لا يمكن إلغاء تسجيل عليه سند قبض. ألغِ السند المالي أولاً ثم ألغِ التسجيل.");
    }
    enrollment.status = "cancelled";
    enrollment.updated_at = new Date().toISOString();
    invoice.status = "cancelled";
    invoice.updated_at = new Date().toISOString();
    audit(db, actor, "enrollments", enrollment.id, "cancel", `إلغاء التسجيل والفاتورة ${invoice.number}`);
  });
}

/** Records a receipt, optionally targeting exactly one installment. */
export function recordPayment(
  args: { invoice_id: ID; installment_id?: ID | null; amount: number; method: Payment["method"]; note?: string },
  actor: Actor,
): ID {
  let created: ID = "";
  transact((db) => {
    const invoice = db.invoices.find((item) => item.id === args.invoice_id);
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status === "cancelled") throw new Error("لا يمكن القبض على فاتورة ملغاة");
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("المبلغ غير صالح");
    recomputeInvoice(db, invoice.id);
    const paidBefore = db.payments
      .filter((item) => item.invoice_id === invoice.id && !item.is_void)
      .reduce((sum, item) => sum + item.amount, 0);
    if (paidBefore + args.amount > invoice.total) throw new Error("المبلغ يتجاوز رصيد الفاتورة");
    const installmentId = args.installment_id ?? null;
    if (installmentId) {
      const installment = db.installments.find(
        (item) => item.id === installmentId && item.invoice_id === invoice.id && !item.is_void,
      );
      if (!installment) throw new Error("القسط غير موجود ضمن هذه الفاتورة");
      const remaining = installment.amount - installmentPaid(db, installment.id);
      if (args.amount > remaining) throw new Error("المبلغ يتجاوز المتبقي من هذه الدفعة");
    }
    const payment: Payment = {
      ...baseFields(), invoice_id: invoice.id, installment_id: installmentId, student_id: invoice.student_id,
      receipt_no: nextReceiptNo(db), amount: args.amount, method: args.method, paid_at: new Date().toISOString(),
      is_void: false, void_reason: "", voided_at: null, user_id: actor.id, note: args.note ?? "",
      invoice_total_snapshot: invoice.total, paid_after_snapshot: paidBefore + args.amount,
      due_after_snapshot: Math.max(0, invoice.total - paidBefore - args.amount),
    };
    db.payments.push(payment);
    created = payment.id;
    recomputeInvoice(db, invoice.id);
    audit(db, actor, "payments", payment.id, "create", `قبض ${payment.receipt_no} بقيمة ${payment.amount / 100}`);
  });
  return created;
}

export function voidPayment(paymentId: ID, reason: string, actor: Actor): void {
  transact((db) => {
    const payment = db.payments.find((item) => item.id === paymentId);
    if (!payment) throw new Error("الدفعة غير موجودة");
    if (payment.is_void) throw new Error("الدفعة ملغاة مسبقًا");
    if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
    payment.is_void = true;
    payment.void_reason = reason.trim();
    payment.voided_at = new Date().toISOString();
    payment.updated_at = payment.voided_at;
    recomputeInvoice(db, payment.invoice_id);
    audit(db, actor, "payments", payment.id, "void", `إلغاء إيصال ${payment.receipt_no} — ${reason.trim()}`);
  });
}

export function recordExpense(
  args: { category: string; amount: number; date: string; note?: string },
  actor: Actor,
): ID {
  const category = args.category.trim();
  if (!category) throw new Error("بند المصروف إلزامي");
  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("مبلغ المصروف غير صالح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("تاريخ المصروف غير صالح");
  let created: ID = "";
  transact((db) => {
    const expense = {
      ...baseFields(), category, amount: args.amount, date: args.date, note: args.note?.trim() ?? "",
      user_id: actor.id, is_void: false,
    };
    db.expenses.push(expense);
    created = expense.id;
    audit(db, actor, "expenses", expense.id, "create", `مصروف ${category} بقيمة ${args.amount / 100}`);
  });
  return created;
}

export function recordIncome(
  args: { source: string; amount: number; date: string; note?: string },
  actor: Actor,
): ID {
  const source = args.source.trim();
  if (!source) throw new Error("مصدر المدخول إلزامي");
  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("مبلغ المدخول غير صالح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("تاريخ المدخول غير صالح");
  let created: ID = "";
  transact((db) => {
    const income = {
      ...baseFields(), source, amount: args.amount, date: args.date, note: args.note?.trim() ?? "",
      user_id: actor.id, is_void: false,
    };
    db.incomes.push(income);
    created = income.id;
    audit(db, actor, "incomes", income.id, "create", `مدخول ${source} بقيمة ${args.amount / 100}`);
  });
  return created;
}

export function voidExpense(expenseId: ID, actor: Actor, reason: string): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const expense = db.expenses.find((item) => item.id === expenseId);
    if (!expense) throw new Error("المصروف غير موجود");
    if (expense.is_void) throw new Error("المصروف ملغى مسبقًا");
    expense.is_void = true;
    expense.updated_at = new Date().toISOString();
    audit(db, actor, "expenses", expense.id, "void", `${reason.trim()} — ${expense.category} بقيمة ${expense.amount / 100}`);
  });
}

export function voidIncome(incomeId: ID, actor: Actor, reason: string): void {
  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");
  transact((db) => {
    const income = db.incomes.find((item) => item.id === incomeId);
    if (!income) throw new Error("المدخول غير موجود");
    if (income.is_void) throw new Error("المدخول ملغى مسبقًا");
    income.is_void = true;
    income.updated_at = new Date().toISOString();
    audit(db, actor, "incomes", income.id, "void", `${reason.trim()} — ${income.source} بقيمة ${income.amount / 100}`);
  });
}

export function profitAndLoss(db: DB, from: string, to: string) {
  const inRange = (date: string) => {
    const key = localDateKey(date);
    return key >= from && key <= to;
  };
  const activeInvoiceIds = new Set(db.invoices.filter((item) => item.status !== "cancelled").map((item) => item.id));
  const tuition = db.payments
    .filter((item) => !item.is_void && activeInvoiceIds.has(item.invoice_id) && inRange(item.paid_at))
    .reduce((sum, item) => sum + item.amount, 0);
  const otherIncome = db.incomes.filter((item) => !item.is_void && inRange(item.date)).reduce((sum, item) => sum + item.amount, 0);
  const expenses = db.expenses.filter((item) => !item.is_void && inRange(item.date)).reduce((sum, item) => sum + item.amount, 0);

  const payrollItemsWithNewPayments = new Set(
    db.payroll_payments.filter((item) => !item.is_void).map((item) => item.payroll_item_id),
  );
  const legacyPayroll = db.payroll_items
    .filter((item) => item.status === "paid" && item.paid_at && !payrollItemsWithNewPayments.has(item.id) && inRange(item.paid_at))
    .reduce((sum, item) => sum + payrollItemCost(item), 0);
  const payrollPayments = db.payroll_payments
    .filter((item) => !item.is_void && inRange(item.paid_at))
    .reduce((sum, item) => sum + item.amount, 0);
  const payrollByAdvanceId = new Map<ID, ID>();
  for (const item of db.payroll_items) for (const id of item.advance_ids ?? []) payrollByAdvanceId.set(id, item.id);
  const payrollAdvances = db.advances
    .filter((advance) => {
      const payrollId = payrollByAdvanceId.get(advance.id);
      if (!payrollId || !inRange(advance.date)) return false;
      const payrollItem = db.payroll_items.find((item) => item.id === payrollId);
      return Boolean(payrollItem && (payrollItemsWithNewPayments.has(payrollId) || payrollItem.status !== "draft"));
    })
    .reduce((sum, item) => sum + item.amount, 0);
  const payroll = legacyPayroll + payrollPayments + payrollAdvances;
  const income = tuition + otherIncome;
  const cost = expenses + payroll;
  return { tuition, otherIncome, expenses, payroll, income, cost, net: income - cost };
}

export function payrollItemCost(item: { base_snapshot: number; bonus: number; deduction: number }): number {
  return Math.max(0, item.base_snapshot + item.bonus - item.deduction);
}

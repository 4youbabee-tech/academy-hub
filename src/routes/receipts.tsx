import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { installmentPaid, invoiceBalance, invoiceFinancials, invoiceInstallments } from "@/lib/finance";
import { dateStr, money, numericMonthPeriodLabel, toMinor } from "@/lib/format";
import { printInvoice } from "@/lib/invoice-print";
import { printReceipt } from "@/lib/receipt-print";
import { recordStudentAllocatedReceipt, voidStudentReceiptGroup } from "@/lib/student-settlement";
import type { Installment, Payment } from "@/lib/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "الفواتير والتحصيل — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إدارة الفواتير والمقبوضات وسندات القبض من مكان واحد." },
    ],
  }),
  component: ReceiptsPage,
});

type InvoiceFilter = "all" | "open" | "paid" | "cancelled";

function ReceiptsPage() {
  const { db, actor, allowed } = useApp();
  const [q, setQ] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [note, setNote] = useState("");
  const [selectedInstallments, setSelectedInstallments] = useState<Record<string, boolean>>({});
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [printAfterPaymentId, setPrintAfterPaymentId] = useState<string | null>(null);
  const [invoiceReceiptsFor, setInvoiceReceiptsFor] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(q);

  const invoiceRows = useMemo(() => {
    if (!db) return [];
    const term = debouncedQ.trim().toLowerCase();
    const students = new Map(db.students.map((student) => [student.id, student]));
    const enrollments = new Map(db.enrollments.map((enrollment) => [enrollment.id, enrollment]));
    const classes = new Map(db.classes.map((klass) => [klass.id, klass]));
    const courses = new Map(db.courses.map((course) => [course.id, course]));
    return db.invoices
      .map((inv) => {
        const student = students.get(inv.student_id);
        const enrollment = enrollments.get(inv.enrollment_id);
        const klass = enrollment ? classes.get(enrollment.class_id) : undefined;
        const course = klass ? courses.get(klass.course_id) : undefined;
        const financials = invoiceFinancials(db, inv);
        return { inv, student, klass, course, balance: financials.due, paid: financials.paid };
      })
      .filter((row) => (invoiceFilter === "all" ? true : row.inv.status === invoiceFilter))
      .filter((row) => {
        if (!term) return true;
        return (
          row.inv.number.toLowerCase().includes(term) ||
          (row.student?.full_name ?? "").toLowerCase().includes(term) ||
          (row.student?.code ?? "").toLowerCase().includes(term) ||
          (row.course?.name ?? "").toLowerCase().includes(term) ||
          (row.klass?.name ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.inv.issued_at.localeCompare(a.inv.issued_at));
  }, [db, debouncedQ, invoiceFilter]);

  const invoicePagination = usePagination(invoiceRows, `${debouncedQ}|${invoiceFilter}`);

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const currentDb = db;
  const canPay = allowed("finance.pay") || allowed("finance.create");
  const canVoid = allowed("finance.void");
  const cur = currentDb.settings.currency;

  function receiptKey(payment: Payment): string {
    return payment.receipt_group_id || payment.id;
  }

  function visibleReceiptsForInvoice(invoiceId: string): Payment[] {
    const seen = new Set<string>();
    return currentDb.payments
      .filter((payment) => payment.invoice_id === invoiceId)
      .slice()
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))
      .filter((payment) => {
        const key = receiptKey(payment);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function receiptGroupAmount(payment: Payment): number {
    if (!payment.receipt_group_id) return payment.amount;
    return currentDb.payments
      .filter((row) => row.receipt_group_id === payment.receipt_group_id)
      .reduce((sum, row) => sum + row.amount, 0);
  }

  function receiptGroupVoid(payment: Payment): boolean {
    if (!payment.receipt_group_id) return payment.is_void;
    const rows = currentDb.payments.filter((row) => row.receipt_group_id === payment.receipt_group_id);
    return rows.length > 0 && rows.every((row) => row.is_void);
  }

  const activeInvoiceIds = new Set(currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").map((invoice) => invoice.id));
  const validPayments = currentDb.payments.filter((payment) => !payment.is_void && activeInvoiceIds.has(payment.invoice_id));
  const uniqueReceiptKeys = new Set(validPayments.map((payment) => receiptKey(payment)));
  const totalReceipts = uniqueReceiptKeys.size;
  const totalAmount = validPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalBilled = currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((sum, invoice) => sum + invoice.total, 0);
  const totalDue = currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((sum, invoice) => sum + invoiceBalance(currentDb, invoice.id), 0);

  const currentInvoice = payFor ? currentDb.invoices.find((invoice) => invoice.id === payFor) ?? null : null;
  const currentStudent = currentInvoice ? currentDb.students.find((student) => student.id === currentInvoice.student_id) ?? null : null;
  const currentEnrollment = currentInvoice ? currentDb.enrollments.find((enrollment) => enrollment.id === currentInvoice.enrollment_id) ?? null : null;
  const currentClass = currentEnrollment ? currentDb.classes.find((klass) => klass.id === currentEnrollment.class_id) ?? null : null;
  const currentCourse = currentClass ? currentDb.courses.find((course) => course.id === currentClass.course_id) ?? null : null;
  const invoiceRemaining = currentInvoice ? invoiceBalance(currentDb, currentInvoice.id) : 0;
  const payableInstallments = currentInvoice
    ? invoiceInstallments(currentDb, currentInvoice.id)
        .map((installment) => ({
          installment,
          paid: installmentPaid(currentDb, installment.id),
          remaining: Math.max(0, installment.amount - installmentPaid(currentDb, installment.id)),
        }))
        .filter((row) => row.remaining > 0)
    : [];
  const selectedTotal = payableInstallments.reduce((sum, row) => {
    if (!selectedInstallments[row.installment.id]) return sum;
    try {
      return sum + toMinor(allocationAmounts[row.installment.id] || "0");
    } catch {
      return sum;
    }
  }, 0);

  const justCreatedPayment = printAfterPaymentId
    ? currentDb.payments.find((payment) => payment.id === printAfterPaymentId)
    : undefined;
  const receiptHistoryInvoice = invoiceReceiptsFor
    ? currentDb.invoices.find((invoice) => invoice.id === invoiceReceiptsFor)
    : undefined;
  const receiptHistoryRows = invoiceReceiptsFor ? visibleReceiptsForInvoice(invoiceReceiptsFor) : [];

  function installmentLabel(installment: Installment): string {
    if (installment.kind === "registration") return "رسوم التسجيل";
    if (installment.kind === "monthly" && installment.period) return `شهر ${numericMonthPeriodLabel(installment.period)}`;
    return `قسط ${installment.seq ?? 1}`;
  }

  function fillPaymentForm(invoiceId: string | null) {
    setPayFor(invoiceId);
    setMethod("cash");
    setNote("");
    setSelectedInstallments({});
    setAllocationAmounts({});
    setError(null);
  }

  function setAllocation(installmentId: string, selected: boolean, defaultAmount = "") {
    setSelectedInstallments((current) => ({ ...current, [installmentId]: selected }));
    setAllocationAmounts((current) => ({ ...current, [installmentId]: selected ? (current[installmentId] || defaultAmount) : "" }));
    setError(null);
  }

  function submitPayment() {
    if (!payFor) return;
    try {
      const allocations = payableInstallments
        .filter((row) => selectedInstallments[row.installment.id])
        .map((row) => ({
          installment_id: row.installment.id,
          amount: toMinor(allocationAmounts[row.installment.id] || "0"),
        }))
        .filter((row) => row.amount > 0);
      const result = recordStudentAllocatedReceipt(
        { invoice_id: payFor, allocations, method, note: note.trim() },
        actor,
      );
      setPrintAfterPaymentId(result.payment_ids[0] ?? null);
      setPayFor(null);
      setSelectedInstallments({});
      setAllocationAmounts({});
      setMethod("cash");
      setNote("");
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function submitVoid() {
    if (!voidFor) return;
    try {
      voidStudentReceiptGroup(voidFor, reason, actor);
      setVoidFor(null);
      setReason("");
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الفواتير والتحصيل"
        subtitle="الفاتورة والقبض والطباعة وسجل السندات في صف واحد بدون التنقل بين شاشتين"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إجمالي المستحق" value={money(totalBilled, cur)} />
        <Stat label="إجمالي المقبوض" value={money(totalAmount, cur)} tone="success" />
        <Stat label="إجمالي المتبقي" value={money(totalDue, cur)} tone={totalDue > 0 ? "danger" : "success"} />
        <Stat label="عدد سندات القبض" value={String(totalReceipts)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="بحث بالطالب أو رقم الفاتورة أو العام الدراسي..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select className="w-44" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value as InvoiceFilter)}>
          <option value="all">كل الفواتير</option>
          <option value="open">عليها رصيد</option>
          <option value="paid">مسددة</option>
          <option value="cancelled">ملغاة</option>
        </Select>
      </div>

      {invoiceRows.length === 0 ? (
        <Empty text="لا توجد فواتير مطابقة." />
      ) : (
        <>
          <Table head={["الفاتورة", "الطالب", "العام الدراسي / الصف", "المستحق", "المقبوض", "المتبقي", "الحالة", "الإجراءات"]}>
            {invoicePagination.rows.map(({ inv, student, course, klass, balance, paid }) => {
              const invoiceReceipts = visibleReceiptsForInvoice(inv.id);
              const latestPayment = invoiceReceipts.find((payment) => !receiptGroupVoid(payment)) ?? invoiceReceipts[0];
              return (
                <tr key={inv.id}>
                  <Td className="font-semibold">{inv.number}</Td>
                  <Td>
                    <Link to="/students/$id" params={{ id: inv.student_id }} className="font-semibold text-primary hover:underline">
                      {student?.full_name || "—"}
                    </Link>
                  </Td>
                  <Td>{course?.name ? `${course.name}${klass ? ` — ${klass.name}` : ""}` : "—"}</Td>
                  <Td className="tabular-nums">{money(inv.total, cur)}</Td>
                  <Td className="tabular-nums text-emerald-700">{money(paid, cur)}</Td>
                  <Td className={balance > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(balance, cur)}</Td>
                  <Td>
                    {inv.status === "paid" ? <Badge tone="success">مسددة</Badge>
                      : inv.status === "cancelled" ? <Badge tone="danger">ملغاة</Badge>
                        : paid > 0 ? <Badge tone="primary">مدفوعة جزئيًا</Badge>
                          : <Badge tone="primary">عليها رصيد</Badge>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {canPay && inv.status === "open" && balance > 0 ? (
                        <Button variant="secondary" onClick={() => fillPaymentForm(inv.id)}>قبض</Button>
                      ) : null}
                      <Button variant="secondary" onClick={() => printInvoice(currentDb, inv)}>🖨️ طباعة الفاتورة</Button>
                      {latestPayment ? (
                        <Button variant="secondary" onClick={() => printReceipt(currentDb, latestPayment)}>🖨️ آخر سند</Button>
                      ) : null}
                      {invoiceReceipts.length ? (
                        <Button variant="ghost" onClick={() => setInvoiceReceiptsFor(inv.id)}>🧾 كل السندات</Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
          <PaginationControls
            page={invoicePagination.page}
            pageCount={invoicePagination.pageCount}
            pageSize={invoicePagination.pageSize}
            total={invoicePagination.total}
            from={invoicePagination.from}
            to={invoicePagination.to}
            onPrevious={invoicePagination.previous}
            onNext={invoicePagination.next}
            onPageSizeChange={invoicePagination.setPageSize}
          />
        </>
      )}

      <Modal open={!!printAfterPaymentId} title="تم تسجيل سند القبض" onClose={() => setPrintAfterPaymentId(null)}>
        {justCreatedPayment ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-success/5 p-4 text-sm">
              <p className="font-bold text-success">تم حفظ سند القبض وتوزيعه على الاستحقاقات المحددة.</p>
              <p className="mt-2"><b>رقم السند:</b> {justCreatedPayment.receipt_no}</p>
              <p><b>إجمالي السند:</b> {money(receiptGroupAmount(justCreatedPayment), cur)}</p>
              <p><b>التاريخ:</b> {dateStr(justCreatedPayment.paid_at)}</p>
            </div>
            <Button className="w-full" onClick={() => printReceipt(currentDb, justCreatedPayment)}>🖨️ طباعة السند الآن</Button>
          </div>
        ) : <Empty text="تم تسجيل السند." />}
      </Modal>

      <Modal open={!!invoiceReceiptsFor} title="كل سندات الفاتورة" onClose={() => setInvoiceReceiptsFor(null)} wide>
        {receiptHistoryInvoice ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/40 p-3 text-sm"><b>الفاتورة:</b> {receiptHistoryInvoice.number}</div>
            {receiptHistoryRows.length ? (
              <div className="space-y-2">
                {receiptHistoryRows.map((payment) => {
                  const isVoid = receiptGroupVoid(payment);
                  return (
                    <div key={receiptKey(payment)} className={`rounded-xl border p-3 ${isVoid ? "bg-destructive/5" : "bg-card"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 text-sm">
                          <p><b>رقم السند:</b> {payment.receipt_no}</p>
                          <p><b>المبلغ:</b> {money(receiptGroupAmount(payment), cur)}</p>
                          <p><b>التاريخ:</b> {dateStr(payment.paid_at)}</p>
                          <p>{isVoid ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</p>
                          {isVoid && payment.void_reason ? <p className="text-xs text-destructive">سبب الإلغاء: {payment.void_reason}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" onClick={() => printReceipt(currentDb, payment)}>
                            {isVoid || receiptHistoryInvoice.status === "cancelled" ? "🖨️ طباعة نسخة تاريخية" : "🖨️ طباعة السند"}
                          </Button>
                          {!isVoid && receiptHistoryInvoice.status !== "cancelled" && canVoid ? (
                            <Button variant="ghost" onClick={() => { setVoidFor(payment.id); setInvoiceReceiptsFor(null); }}>إلغاء</Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <Empty text="لا توجد سندات لهذه الفاتورة." />}
          </div>
        ) : null}
      </Modal>

      <Modal open={!!payFor} title="قبض وتوزيع الدفعة" onClose={() => setPayFor(null)} wide>
        <div className="space-y-4">
          {currentInvoice ? (
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <p><b>الفاتورة:</b> {currentInvoice.number}</p>
              <p><b>الطالب:</b> {currentStudent?.full_name || "—"}</p>
              <p><b>العام الدراسي / الصف:</b> {currentCourse?.name || "—"}{currentClass ? ` — ${currentClass.name}` : ""}</p>
              <p><b>إجمالي المستحق:</b> {money(currentInvoice.total, cur)}</p>
              <p><b>المتبقي الكلي:</b> {money(invoiceRemaining, cur)}</p>
            </div>
          ) : null}

          <div className="rounded-xl border p-3">
            <p className="mb-1 text-sm font-bold">اختر الشهر وحدد مبلغ القبض</p>
            <p className="mb-3 text-xs leading-6 text-muted-foreground">
              عند تحديد الشهر يُكتب كامل المتبقي تلقائيًا، ويمكنك تعديل المبلغ في نفس السطر إذا كانت الدفعة جزئية.
            </p>
            <div className="space-y-2">
              {payableInstallments.map(({ installment, paid, remaining }) => {
                const selected = Boolean(selectedInstallments[installment.id]);
                return (
                  <div key={installment.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_150px] sm:items-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => setAllocation(installment.id, event.target.checked, (remaining / 100).toFixed(2))}
                      aria-label={`اختيار ${installmentLabel(installment)}`}
                      className="h-5 w-5"
                    />
                    <div className="text-sm">
                      <p className="font-semibold">{installmentLabel(installment)}</p>
                      <p className="text-xs text-muted-foreground">المستحق {money(installment.amount, cur)} — المدفوع {money(paid, cur)} — المتبقي {money(remaining, cur)}</p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!selected}
                      value={allocationAmounts[installment.id] || ""}
                      onChange={(event) => {
                        setAllocationAmounts((current) => ({ ...current, [installment.id]: event.target.value }));
                        setError(null);
                      }}
                      placeholder="المبلغ"
                      aria-label={`مبلغ ${installmentLabel(installment)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-muted/30 p-3 text-sm">
            <b>إجمالي الدفعة المحددة:</b> {money(selectedTotal, cur)}
            <span className="mx-2">—</span>
            <b>المتبقي المتوقع بعد الدفعة:</b> {money(Math.max(0, invoiceRemaining - selectedTotal), cur)}
          </div>

          <Field label="طريقة الدفع">
            <Select value={method} onChange={(event) => setMethod(event.target.value as Payment["method"])}>
              <option value="cash">نقدًا</option>
              <option value="bank">بنك</option>
              <option value="other">أخرى</option>
            </Select>
          </Field>
          <Field label="البيان / الملاحظة">
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظة اختيارية تظهر على السند" />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>إلغاء</Button>
            <Button onClick={submitPayment} disabled={selectedTotal <= 0}>تسجيل القبض</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!voidFor} title="إلغاء سند قبض" onClose={() => setVoidFor(null)}>
        <div className="space-y-3">
          <Field label="سبب الإلغاء">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="السبب إلزامي..." />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidFor(null)}>تراجع</Button>
            <Button variant="danger" onClick={submitVoid} disabled={!reason.trim()}>تأكيد الإلغاء</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

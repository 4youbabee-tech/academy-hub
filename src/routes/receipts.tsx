import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { snapshot } from "@/lib/db";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceBalance, invoiceFinancials, recordPayment, voidPayment } from "@/lib/finance";
import { dateStr, money, toMinor } from "@/lib/format";
import { printReceipt } from "@/lib/receipt-print";
import type { Payment } from "@/lib/types";
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

type Section = "invoices" | "receipts";
type ReceiptFilter = "all" | "paid" | "void";
type InvoiceFilter = "all" | "open" | "paid" | "cancelled";

function ReceiptsPage() {
  const { db, actor, allowed } = useApp();
  const [section, setSection] = useState<Section>("invoices");
  const [q, setQ] = useState("");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("all");
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const debouncedQ = useDebouncedValue(q);

  const openInvoices = useMemo(
    () => (db ? db.invoices.filter((invoice) => invoice.status === "open" && invoiceBalance(db, invoice.id) > 0) : []),
    [db],
  );

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
        return { inv, student, enrollment, klass, course, balance: financials.due, paid: financials.paid };
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

  const receipts = useMemo(() => {
    if (!db) return [];
    const term = debouncedQ.trim().toLowerCase();
    let list = db.payments.slice();

    if (receiptFilter === "paid") list = list.filter((p) => !p.is_void);
    else if (receiptFilter === "void") list = list.filter((p) => p.is_void);

    if (term) {
      list = list.filter((p) => {
        const student = db.students.find((s) => s.id === p.student_id);
        const invoice = db.invoices.find((i) => i.id === p.invoice_id);
        return (
          p.receipt_no.toLowerCase().includes(term) ||
          (student?.full_name ?? "").toLowerCase().includes(term) ||
          (student?.code ?? "").toLowerCase().includes(term) ||
          (invoice?.number ?? "").toLowerCase().includes(term)
        );
      });
    }

    return list.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [db, debouncedQ, receiptFilter]);

  const invoicePagination = usePagination(invoiceRows, `${debouncedQ}|${invoiceFilter}`);
  const receiptPagination = usePagination(receipts, `${debouncedQ}|${receiptFilter}`);

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const currentDb = db;
  const canPay = allowed("finance.pay") || allowed("finance.create");
  const canVoid = allowed("finance.void");
  const cur = currentDb.settings.currency;

  const activeInvoiceIds = new Set(currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").map((invoice) => invoice.id));
  const validPayments = currentDb.payments.filter((payment) => !payment.is_void && activeInvoiceIds.has(payment.invoice_id));
  const totalReceipts = validPayments.length;
  const totalAmount = validPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalBilled = currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((sum, invoice) => sum + invoice.total, 0);
  const totalDue = currentDb.invoices.filter((invoice) => invoice.status !== "cancelled").reduce((sum, invoice) => sum + invoiceBalance(currentDb, invoice.id), 0);

  const currentInvoice = payFor ? currentDb.invoices.find((i) => i.id === payFor) ?? null : null;
  const currentStudent = currentInvoice ? currentDb.students.find((s) => s.id === currentInvoice.student_id) ?? null : null;
  const currentEnrollment = currentInvoice ? currentDb.enrollments.find((e) => e.id === currentInvoice.enrollment_id) ?? null : null;
  const currentClass = currentEnrollment ? currentDb.classes.find((k) => k.id === currentEnrollment.class_id) ?? null : null;
  const currentCourse = currentClass ? currentDb.courses.find((c) => c.id === currentClass.course_id) ?? null : null;
  const invoiceRemaining = currentInvoice ? invoiceBalance(currentDb, currentInvoice.id) : 0;

  function fillPaymentForm(invoiceId: string | null) {
    setPayFor(invoiceId);
    setMethod("cash");
    setNote("");
    setAmount("");
    setError(null);
  }

  function submitPayment() {
    if (!payFor) return;
    try {
      const paymentId = recordPayment(
        {
          invoice_id: payFor,
          amount: toMinor(amount),
          method,
          note: note.trim(),
        },
        actor,
      );
      const updated = snapshot();
      const createdPayment = updated?.payments.find((payment) => payment.id === paymentId);
      if (updated && createdPayment) printReceipt(updated, createdPayment);
      setPayFor(null);
      setSection("invoices");
      setAmount("");
      setMethod("cash");
      setNote("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function submitVoid() {
    if (!voidFor) return;
    try {
      voidPayment(voidFor, reason, actor);
      setVoidFor(null);
      setReason("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الفواتير والتحصيل"
        subtitle="المستحق والقبض والطباعة من نفس شاشة الفاتورة"
        actions={
          <Button variant="secondary" onClick={() => setSection((current) => current === "receipts" ? "invoices" : "receipts")}>
            {section === "receipts" ? "العودة للفواتير" : "سجل القبض"}
          </Button>
        }
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
          placeholder={section === "invoices" ? "بحث بالطالب أو رقم الفاتورة أو العام الدراسي..." : "بحث برقم السند أو اسم الطالب..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {section === "invoices" ? (
          <Select className="w-44" value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value as InvoiceFilter)}>
            <option value="all">كل الفواتير</option>
            <option value="open">عليها رصيد</option>
            <option value="paid">مسددة</option>
            <option value="cancelled">ملغاة</option>
          </Select>
        ) : (
          <Select className="w-44" value={receiptFilter} onChange={(e) => setReceiptFilter(e.target.value as ReceiptFilter)}>
            <option value="all">كل السندات</option>
            <option value="paid">سارية</option>
            <option value="void">ملغاة</option>
          </Select>
        )}
      </div>

      {section === "invoices" ? (
        invoiceRows.length === 0 ? (
          <Empty text="لا توجد فواتير مطابقة." />
        ) : (
          <>
          <Table head={["الفاتورة", "الطالب", "العام الدراسي / الصف", "المستحق", "المقبوض", "المتبقي", "الحالة", ""]}>
            {invoicePagination.rows.map(({ inv, student, course, klass, balance, paid }) => (
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
                  {inv.status === "paid" ? (
                    <Badge tone="success">مسددة</Badge>
                  ) : inv.status === "cancelled" ? (
                    <Badge tone="danger">ملغاة</Badge>
                  ) : (
                    <Badge tone="primary">عليها رصيد</Badge>
                  )}
                </Td>
                <Td>
                  {canPay && inv.status === "open" && balance > 0 ? (
                    <Button variant="secondary" onClick={() => fillPaymentForm(inv.id)}>
                      قبض
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
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
        )
      ) : receipts.length === 0 ? (
        <Empty text="لا توجد سندات قبض مطابقة." />
      ) : (
        <>
        <Table head={["رقم السند", "الطالب", "البيان / الملاحظة", "العام الدراسي / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {receiptPagination.rows.map((p) => {
            const student = currentDb.students.find((s) => s.id === p.student_id);
            const invoice = currentDb.invoices.find((i) => i.id === p.invoice_id);
            const enrollment = currentDb.enrollments.find((e) => e.id === invoice?.enrollment_id);
            const klass = currentDb.classes.find((k) => k.id === enrollment?.class_id);
            const course = currentDb.courses.find((c) => c.id === klass?.course_id);

            return (
              <tr key={p.id} className={p.is_void ? "opacity-60" : ""}>
                <Td className="font-semibold">{p.receipt_no}</Td>
                <Td>
                  <Link to="/students/$id" params={{ id: p.student_id }} className="text-primary hover:underline">
                    {student?.full_name || "—"}
                  </Link>
                </Td>
                <Td>{p.note?.trim() || "دفعة"}</Td>
                <Td>{course?.name ? `${course.name}${klass ? ` — ${klass.name}` : ""}` : "—"}</Td>
                <Td className="tabular-nums">{money(p.amount, cur)}</Td>
                <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "بنك" : "أخرى"}</Td>
                <Td>{dateStr(p.paid_at)}</Td>
                <Td>{p.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>
                <Td>
                  <div className="flex gap-1">
                    {!p.is_void && invoice?.status !== "cancelled" ? (
                      <>
                        <Button variant="ghost" onClick={() => printReceipt(currentDb, p)}>
                          🖨️
                        </Button>
                        {canVoid ? (
                          <Button variant="ghost" onClick={() => setVoidFor(p.id)}>
                            إلغاء
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
        <PaginationControls
          page={receiptPagination.page}
          pageCount={receiptPagination.pageCount}
          pageSize={receiptPagination.pageSize}
          total={receiptPagination.total}
          from={receiptPagination.from}
          to={receiptPagination.to}
          onPrevious={receiptPagination.previous}
          onNext={receiptPagination.next}
          onPageSizeChange={receiptPagination.setPageSize}
        />
        </>
      )}

      <Modal open={!!payFor} title="قبض على الفاتورة" onClose={() => setPayFor(null)}>
        <div className="space-y-3">
          <Field label="الفاتورة / الطالب">
            <Select value={payFor || ""} onChange={(e) => fillPaymentForm(e.target.value || null)}>
              <option value="">— اختر فاتورة —</option>
              {openInvoices.map((inv) => {
                const student = currentDb.students.find((s) => s.id === inv.student_id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {student?.full_name || "—"} (المتبقي: {money(invoiceBalance(currentDb, inv.id), cur)})
                  </option>
                );
              })}
            </Select>
          </Field>

          {currentInvoice ? (
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <p><b>الطالب:</b> {currentStudent?.full_name || "—"}</p>
              <p><b>العام الدراسي / الصف:</b> {currentCourse?.name || "—"}{currentClass ? ` — ${currentClass.name}` : ""}</p>
              <p><b>إجمالي المستحق:</b> {money(currentInvoice.total, cur)}</p>
              <p><b>المتبقي:</b> {money(invoiceRemaining, cur)}</p>
            </div>
          ) : null}

          <Field label="المبلغ المقبوض">
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="أدخل المبلغ..." />
          </Field>

          <Field label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["method"])}>
              <option value="cash">نقدًا</option>
              <option value="bank">بنك</option>
              <option value="other">أخرى</option>
            </Select>
          </Field>

          <Field label="البيان / الملاحظة">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: رسوم تسجيل، قسط أول، دفعة شهر آب..."
            />
          </Field>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>إلغاء</Button>
            <Button onClick={submitPayment}>تسجيل القبض وطباعة السند</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!voidFor} title="إلغاء سند قبض" onClose={() => setVoidFor(null)}>
        <div className="space-y-3">
          <Field label="سبب الإلغاء">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب إلزامي..." />
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

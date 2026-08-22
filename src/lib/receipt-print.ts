import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceBalance, recordPayment, voidPayment } from "@/lib/finance";
import { dateStr, money, toMinor } from "@/lib/format";
import { printReceipt } from "@/lib/receipt-print";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "الإيصالات والفواتير — نظام إدارة المعهد" },
      { name: "description", content: "إدارة الفواتير والمقبوضات وسندات القبض من مكان واحد." },
    ],
  }),
  component: ReceiptsPage,
});

type Section = "invoices" | "receipts";
type ReceiptFilter = "all" | "paid" | "void";
type InvoiceFilter = "all" | "open" | "paid";

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

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const canPay = allowed("finance.pay") || allowed("finance.create");
  const cur = db.settings.currency;

  const openInvoices = useMemo(() => db.invoices.filter((i) => i.status === "open"), [db]);

  const invoiceRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.invoices
      .map((inv) => {
        const student = db.students.find((s) => s.id === inv.student_id);
        const enrollment = db.enrollments.find((e) => e.id === inv.enrollment_id);
        const klass = db.classes.find((k) => k.id === enrollment?.class_id);
        const course = db.courses.find((c) => c.id === klass?.course_id);
        const balance = invoiceBalance(db, inv.id);
        const paid = Math.max(0, inv.total - balance);
        return { inv, student, enrollment, klass, course, balance, paid };
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
  }, [db, q, invoiceFilter]);

  const receipts = useMemo(() => {
    const term = q.trim().toLowerCase();
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
  }, [db, q, receiptFilter]);

  const totalReceipts = db.payments.filter((p) => !p.is_void).length;
  const totalAmount = db.payments.filter((p) => !p.is_void).reduce((sum, p) => sum + p.amount, 0);
  const totalBilled = db.invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + i.total, 0);
  const totalDue = db.invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + invoiceBalance(db, i.id), 0);

  const currentInvoice = payFor ? db.invoices.find((i) => i.id === payFor) ?? null : null;
  const currentStudent = currentInvoice ? db.students.find((s) => s.id === currentInvoice.student_id) ?? null : null;
  const currentEnrollment = currentInvoice ? db.enrollments.find((e) => e.id === currentInvoice.enrollment_id) ?? null : null;
  const currentClass = currentEnrollment ? db.classes.find((k) => k.id === currentEnrollment.class_id) ?? null : null;
  const currentCourse = currentClass ? db.courses.find((c) => c.id === currentClass.course_id) ?? null : null;
  const invoiceRemaining = currentInvoice ? invoiceBalance(db, currentInvoice.id) : 0;

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
      recordPayment(
        {
          invoice_id: payFor,
          amount: toMinor(amount),
          method,
          note: note.trim(),
        },
        actor,
      );
      setPayFor(null);
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
        title="الإيصالات والفواتير"
        subtitle="كل ما يخص مستحقات الطلاب والقبض في مكان واحد"
        actions={
          canPay && openInvoices.length > 0 ? (
            <Button onClick={() => fillPaymentForm(openInvoices[0]?.id || null)}>+ سند قبض جديد</Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إجمالي المستحق" value={money(totalBilled, cur)} />
        <Stat label="إجمالي المقبوض" value={money(totalAmount, cur)} tone="success" />
        <Stat label="إجمالي المتبقي" value={money(totalDue, cur)} tone={totalDue > 0 ? "danger" : "success"} />
        <Stat label="عدد سندات القبض" value={String(totalReceipts)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <Button variant={section === "invoices" ? "primary" : "ghost"} onClick={() => setSection("invoices")}>
          الفواتير والمستحقات
        </Button>
        <Button variant={section === "receipts" ? "primary" : "ghost"} onClick={() => setSection("receipts")}>
          سندات القبض
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder={section === "invoices" ? "بحث بالطالب أو رقم الفاتورة أو الدورة..." : "بحث برقم السند أو اسم الطالب..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {section === "invoices" ? (
          <Select className="w-44" value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value as InvoiceFilter)}>
            <option value="all">كل الفواتير</option>
            <option value="open">عليها رصيد</option>
            <option value="paid">مسددة</option>
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
          <Table head={["الفاتورة", "الطالب", "الدورة / الصف", "المستحق", "المقبوض", "المتبقي", "الحالة", ""]}>
            {invoiceRows.map(({ inv, student, course, klass, balance, paid }) => (
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
        )
      ) : receipts.length === 0 ? (
        <Empty text="لا توجد سندات قبض مطابقة." />
      ) : (
        <Table head={["رقم السند", "الطالب", "البيان / الملاحظة", "الدورة / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {receipts.map((p) => {
            const student = db.students.find((s) => s.id === p.student_id);
            const invoice = db.invoices.find((i) => i.id === p.invoice_id);
            const enrollment = db.enrollments.find((e) => e.id === invoice?.enrollment_id);
            const klass = db.classes.find((k) => k.id === enrollment?.class_id);
            const course = db.courses.find((c) => c.id === klass?.course_id);

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
                    {!p.is_void ? (
                      <>
                        <Button variant="ghost" onClick={() => printReceipt(db, p)}>
                          🖨️
                        </Button>
                        {canPay ? (
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
      )}

      <Modal open={!!payFor} title="سند قبض جديد" onClose={() => setPayFor(null)}>
        <div className="space-y-3">
          <Field label="الفاتورة / الطالب">
            <Select value={payFor || ""} onChange={(e) => fillPaymentForm(e.target.value || null)}>
              <option value="">— اختر فاتورة —</option>
              {openInvoices.map((inv) => {
                const student = db.students.find((s) => s.id === inv.student_id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {student?.full_name || "—"} (المتبقي: {money(invoiceBalance(db, inv.id), cur)})
                  </option>
                );
              })}
            </Select>
          </Field>

          {currentInvoice ? (
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <p><b>الطالب:</b> {currentStudent?.full_name || "—"}</p>
              <p><b>الدورة / الصف:</b> {currentCourse?.name || "—"}{currentClass ? ` — ${currentClass.name}` : ""}</p>
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
            <Button onClick={submitPayment}>تسجيل السند</Button>
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

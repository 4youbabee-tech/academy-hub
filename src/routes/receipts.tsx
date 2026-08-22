import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { installmentLabel, installmentPaid, invoiceBalance, invoiceInstallments, recordPayment, voidPayment } from "@/lib/finance";
import { dateStr, fromMinor, money, toMinor } from "@/lib/format";
import { printReceipt } from "@/lib/receipt-print";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "الإيصالات — نظام إدارة المعهد" },
      { name: "description", content: "جميع الإيصالات الصادرة مع إمكانية الطباعة والإلغاء." },
    ],
  }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { db, actor, allowed } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "void">("all");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [installmentId, setInstallmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const canPay = allowed("finance.pay") || allowed("finance.create");

  const openInvoices = useMemo(() => db.invoices.filter((i) => i.status === "open"), [db]);

  function fillPaymentForm(invoiceId: string | null, preferredInstallmentId?: string) {
    setPayFor(invoiceId);
    setMethod("cash");
    setNote("");
    setError(null);

    if (!invoiceId) {
      setInstallmentId("");
      setAmount("");
      return;
    }

    const list = invoiceInstallments(db, invoiceId);
    const unpaid = list.filter((ins) => ins.amount - installmentPaid(db, ins.id) > 0);
    const chosen = preferredInstallmentId
      ? list.find((ins) => ins.id === preferredInstallmentId) ?? null
      : unpaid[0] ?? null;

    const suggested = chosen
      ? Math.max(0, chosen.amount - installmentPaid(db, chosen.id))
      : invoiceBalance(db, invoiceId);

    setInstallmentId(chosen?.id ?? "");
    setAmount(suggested > 0 ? fromMinor(suggested) : "");
  }

  const receipts = useMemo(() => {
    let list = db.payments.slice();
    const term = q.trim().toLowerCase();

    if (filter === "paid") list = list.filter((p) => !p.is_void);
    else if (filter === "void") list = list.filter((p) => p.is_void);

    if (term) {
      list = list.filter((p) => {
        const student = db.students.find((s) => s.id === p.student_id);
        return (
          p.receipt_no.toLowerCase().includes(term) ||
          (student?.full_name ?? "").toLowerCase().includes(term) ||
          (student?.code ?? "").toLowerCase().includes(term)
        );
      });
    }

    return list.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [db, q, filter]);

  const totalReceipts = db.payments.filter((p) => !p.is_void).length;
  const totalAmount = db.payments.filter((p) => !p.is_void).reduce((s, p) => s + p.amount, 0);
  const voidCount = db.payments.filter((p) => p.is_void).length;

  const currentInvoice = payFor ? db.invoices.find((i) => i.id === payFor) ?? null : null;
  const currentStudent = currentInvoice ? db.students.find((s) => s.id === currentInvoice.student_id) ?? null : null;
  const currentEnrollment = currentInvoice ? db.enrollments.find((e) => e.id === currentInvoice.enrollment_id) ?? null : null;
  const currentClass = currentEnrollment ? db.classes.find((c) => c.id === currentEnrollment.class_id) ?? null : null;
  const currentCourse = currentClass ? db.courses.find((c) => c.id === currentClass.course_id) ?? null : null;
  const currentInstallments = currentInvoice ? invoiceInstallments(db, currentInvoice.id) : [];
  const currentInstallment = currentInstallments.find((ins) => ins.id === installmentId) ?? null;
  const invoiceRemaining = currentInvoice ? invoiceBalance(db, currentInvoice.id) : 0;
  const installmentRemaining = currentInstallment
    ? Math.max(0, currentInstallment.amount - installmentPaid(db, currentInstallment.id))
    : 0;

  function submitPayment() {
    if (!payFor) return;
    try {
      recordPayment(
        {
          invoice_id: payFor,
          installment_id: installmentId || null,
          amount: toMinor(amount),
          method,
          note: note.trim(),
        },
        actor,
      );
      setPayFor(null);
      setInstallmentId("");
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
        title="📋 الإيصالات"
        subtitle="مركز القبض: رسوم التسجيل، الأقساط، وطباعة السندات"
        actions={
          canPay && openInvoices.length > 0 ? (
            <Button onClick={() => fillPaymentForm(openInvoices[0]?.id || null)}>+ سند قبض جديد</Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="عدد الإيصالات" value={String(totalReceipts)} />
        <Stat label="إجمالي المقبوض" value={money(totalAmount, db.settings.currency)} tone="success" />
        <Stat label="الإيصالات الملغاة" value={String(voidCount)} tone="danger" />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-[200px] flex-1"
          placeholder="بحث برقم الإيصال أو اسم الطالب..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select className="w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">الكل</option>
          <option value="paid">مدفوعة</option>
          <option value="void">ملغاة</option>
        </Select>
      </div>

      {receipts.length === 0 ? (
        <Empty text="لا توجد إيصالات مطابقة." />
      ) : (
        <Table head={["رقم الإيصال", "الطالب", "نوع القبض", "الدورة / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {receipts.map((p) => {
            const student = db.students.find((s) => s.id === p.student_id);
            const invoice = db.invoices.find((i) => i.id === p.invoice_id);
            const enrollment = db.enrollments.find((e) => e.id === invoice?.enrollment_id);
            const klass = db.classes.find((c) => c.id === enrollment?.class_id);
            const course = db.courses.find((c) => c.id === klass?.course_id);
            const inst = db.installments.find((i) => i.id === p.installment_id);
            return (
              <tr key={p.id} className={p.is_void ? "opacity-60" : ""}>
                <Td className="font-semibold">{p.receipt_no}</Td>
                <Td>
                  <Link to="/students/$id" params={{ id: p.student_id }} className="text-primary hover:underline">
                    {student?.full_name || "—"}
                  </Link>
                </Td>
                <Td>{inst ? installmentLabel(inst) : "دفعة على الحساب"}</Td>
                <Td>{course?.name ? `${course.name}${klass ? ` — ${klass.name}` : ""}` : "—"}</Td>
                <Td className="tabular-nums">{money(p.amount, db.settings.currency)}</Td>
                <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "بنك" : "أخرى"}</Td>
                <Td>{dateStr(p.paid_at)}</Td>
                <Td>{p.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>
                <Td>
                  <div className="flex gap-1">
                    {!p.is_void && (
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
                    )}
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
                    {inv.number} — {student?.full_name || "—"} (المتبقي: {money(invoiceBalance(db, inv.id), db.settings.currency)})
                  </option>
                );
              })}
            </Select>
          </Field>

          {currentInvoice ? (
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <p>
                <b>الطالب:</b> {currentStudent?.full_name || "—"}
              </p>
              <p>
                <b>الدورة / الصف:</b> {currentCourse?.name || "—"}{currentClass ? ` — ${currentClass.name}` : ""}
              </p>
              <p>
                <b>المتبقي على الفاتورة:</b> {money(invoiceRemaining, db.settings.currency)}
              </p>
            </div>
          ) : null}

          <Field label="نوع القبض">
            <Select
              value={installmentId}
              onChange={(e) => {
                const next = e.target.value;
                setInstallmentId(next);
                if (!payFor) return;
                if (!next) {
                  setAmount(fromMinor(invoiceBalance(db, payFor)));
                  return;
                }
                const ins = currentInstallments.find((x) => x.id === next);
                const remaining = ins ? Math.max(0, ins.amount - installmentPaid(db, ins.id)) : 0;
                setAmount(remaining > 0 ? fromMinor(remaining) : "");
              }}
            >
              <option value="">دفعة على الحساب / عام</option>
              {currentInstallments
                .filter((ins) => ins.amount - installmentPaid(db, ins.id) > 0)
                .map((ins) => {
                  const remaining = Math.max(0, ins.amount - installmentPaid(db, ins.id));
                  return (
                    <option key={ins.id} value={ins.id}>
                      {installmentLabel(ins)} — المتبقي {money(remaining, db.settings.currency)}
                    </option>
                  );
                })}
            </Select>
          </Field>

          {currentInstallment ? (
            <p className="text-xs text-muted-foreground">
              المبلغ المتبقي في {installmentLabel(currentInstallment)}: {money(installmentRemaining, db.settings.currency)}
            </p>
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

          <Field label="ملاحظة (اختياري)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: قبض تسجيل / القسط الأول" />
          </Field>

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>
              إلغاء
            </Button>
            <Button onClick={submitPayment}>تسجيل السند</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!voidFor} title="إلغاء إيصال" onClose={() => setVoidFor(null)}>
        <div className="space-y-3">
          <Field label="سبب الإلغاء">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب إلزامي..." />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidFor(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={submitVoid} disabled={!reason.trim()}>
              تأكيد الإلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

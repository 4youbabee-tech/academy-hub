import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { StudentEnrollmentModal } from "@/components/StudentEnrollmentModal";
import { StudentAnnualBillingCard } from "@/components/StudentAnnualBillingCard";
import { Badge, Button, Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { money, dateStr } from "@/lib/format";
import { invoiceFinancials, studentBalance } from "@/lib/finance";
import { printInvoice } from "@/lib/invoice-print";
import { printReceipt } from "@/lib/receipt-print";
import { receiptGroupRows } from "@/lib/student-settlement";
import { printStudentStatement } from "@/lib/student-statement-print";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/students/$id")({
  head: () => ({
    meta: [
      { title: "ملف الطالب — نظام إدارة المركز التعليمي" },
      { name: "description", content: "ملف الطالب: البيانات، التسجيلات، الفواتير والإيصالات." },
      { property: "og:title", content: "ملف الطالب — نظام إدارة المركز التعليمي" },
      { property: "og:description", content: "التسجيلات وكشف الحساب المالي للطالب." },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const { id } = Route.useParams();
  const { db, allowed } = useApp();
  const [enrollOpen, setEnrollOpen] = useState(false);
  if (!db) return null;
  if (!allowed("students.view")) return <Denied />;
  const currentDb = db;
  const canViewFinance = allowed("finance.view");
  const canEnroll = allowed("enrollments.create");

  const student = currentDb.students.find((s) => s.id === id);
  if (!student) return <Empty text="الطالب غير موجود." />;

  const cur = currentDb.settings.currency;
  const bal = studentBalance(currentDb, student.id);
  const enrollments = currentDb.enrollments
    .filter((e) => e.student_id === student.id)
    .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
  const invoices = currentDb.invoices
    .filter((i) => i.student_id === student.id)
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at));

  function receiptKey(payment: Payment): string {
    return payment.receipt_group_id || payment.id;
  }

  function receiptAmount(payment: Payment): number {
    return receiptGroupRows(currentDb, payment).reduce((sum, row) => sum + row.amount, 0);
  }

  function receiptVoid(payment: Payment): boolean {
    const rows = receiptGroupRows(currentDb, payment);
    return rows.length > 0 && rows.every((row) => row.is_void);
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

  const payments = (() => {
    const seen = new Set<string>();
    return currentDb.payments
      .filter((payment) => payment.student_id === student.id)
      .slice()
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))
      .filter((payment) => {
        const key = receiptKey(payment);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })();

  function courseAndClassForInvoice(invoiceId: string): string {
    const invoice = currentDb.invoices.find((i) => i.id === invoiceId);
    const enrollment = currentDb.enrollments.find((e) => e.id === invoice?.enrollment_id);
    const klass = currentDb.classes.find((c) => c.id === enrollment?.class_id);
    const course = currentDb.courses.find((c) => c.id === klass?.course_id);
    if (!course && !klass) return "—";
    return `${course?.name ?? "—"}${klass ? ` — ${klass.name}` : ""}`;
  }

  return (
    <div>
      <PageHeader
        title={student.full_name}
        subtitle={`الرمز ${student.code} — ${student.phone || "بدون هاتف"}`}
        actions={
          <>
            {canEnroll && student.status === "active" ? (
              <Button onClick={() => setEnrollOpen(true)}>+ تسجيل في صف</Button>
            ) : null}
            <Button variant="secondary" onClick={() => printStudentStatement(currentDb, student.id)}>
              🖨️ طباعة كشف الحساب
            </Button>
            <Link to="/students"><Button variant="ghost">رجوع</Button></Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canViewFinance ? (
          <>
            <Stat label="إجمالي المستحق" value={money(bal.billed, cur)} />
            <Stat label="المقبوض" value={money(bal.paid, cur)} tone="success" />
            <Stat label="المتبقي" value={money(bal.due, cur)} tone={bal.due > 0 ? "danger" : "success"} />
          </>
        ) : null}
        <Stat label="عدد التسجيلات" value={String(enrollments.length)} />
      </div>

      <Panel className="mt-4">
        <h2 className="text-sm font-bold">بيانات الطالب</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>تاريخ الميلاد: {dateStr(student.birth_date)}</p>
          <p>الجنس: {student.gender === "male" ? "ذكر" : student.gender === "female" ? "أنثى" : "—"}</p>
          <p>المستوى التعليمي: {student.education_level || "—"}</p>
          <p>ولي الأمر: {student.guardian_name || "—"} {student.guardian_phone ? `(${student.guardian_phone})` : ""}</p>
          <p>الهاتف: {student.phone || "—"}</p>
          <p>اسم الأم: {student.mother_name || "—"}</p>
          <p>المدرسة: {student.school_name || "—"}</p>
          <p>العنوان: {student.address || "—"}</p>
          {student.notes ? <p className="sm:col-span-2">ملاحظات: {student.notes}</p> : null}
        </div>
      </Panel>

      <StudentAnnualBillingCard studentId={student.id} />

      <h2 className="mb-2 mt-6 text-sm font-bold">التسجيلات</h2>
      {enrollments.length ? (
        <Table head={canViewFinance ? ["الصف", "العام الدراسي", "تاريخ التسجيل", "إجمالي الفاتورة الفعلية", "الحالة"] : ["الصف", "العام الدراسي", "تاريخ التسجيل", "الحالة"]}>
          {enrollments.map((e) => {
            const klass = currentDb.classes.find((c) => c.id === e.class_id);
            const course = currentDb.courses.find((c) => c.id === klass?.course_id);
            const invoice = currentDb.invoices.find((i) => i.enrollment_id === e.id);
            return (
              <tr key={e.id}>
                <Td>{klass?.name ?? "—"}</Td>
                <Td>{course?.name ?? "—"}</Td>
                <Td>{dateStr(e.enrolled_at)}</Td>
                {canViewFinance ? <Td className="tabular-nums">{money(invoice?.total ?? 0, cur)}</Td> : null}
                <Td>{e.status === "active" ? <Badge tone="success">نشط</Badge> : e.status === "completed" ? <Badge tone="primary">منتهٍ</Badge> : e.status === "withdrawn" ? <Badge tone="muted">متوقف</Badge> : <Badge tone="danger">ملغى</Badge>}</Td>
              </tr>
            );
          })}
        </Table>
      ) : <Empty text="لا توجد تسجيلات." />}

      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">كشف الحساب المالي</h2> : null}
      {canViewFinance && invoices.length ? (
        <Table head={["الفاتورة", "العام الدراسي / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", "التاريخ", "الإجراءات"]}>
          {invoices.map((invoice) => {
            const financials = invoiceFinancials(currentDb, invoice);
            const invoiceReceipts = visibleReceiptsForInvoice(invoice.id);
            const latestPayment = invoiceReceipts.find((payment) => !receiptVoid(payment)) ?? invoiceReceipts[0];
            return (
              <tr key={invoice.id}>
                <Td className="font-semibold">{invoice.number}</Td>
                <Td>{courseAndClassForInvoice(invoice.id)}</Td>
                <Td className="tabular-nums">{money(invoice.total, cur)}</Td>
                <Td className="tabular-nums">{money(financials.paid, cur)}</Td>
                <Td className="tabular-nums">{money(financials.due, cur)}</Td>
                <Td>{invoice.status === "paid" ? <Badge tone="success">مسددة</Badge> : invoice.status === "open" ? <Badge tone="danger">عليها رصيد</Badge> : <Badge tone="muted">ملغاة</Badge>}</Td>
                <Td>{dateStr(invoice.issued_at)}</Td>
                <Td><div className="flex flex-wrap gap-1"><Button variant="secondary" onClick={() => printInvoice(currentDb, invoice)}>🖨️ الفاتورة</Button>{latestPayment ? <Button variant="secondary" onClick={() => printReceipt(currentDb, latestPayment)}>🖨️ آخر سند</Button> : null}</div></Td>
              </tr>
            );
          })}
        </Table>
      ) : canViewFinance ? <Empty text="لا توجد فواتير." /> : null}

      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">سجل القبض — كل السندات</h2> : null}
      {canViewFinance && payments.length ? (
        <Table head={["رقم السند", "البيان / الملاحظة", "العام الدراسي / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {payments.map((payment) => {
            const isVoid = receiptVoid(payment);
            return (
              <tr key={receiptKey(payment)} className={isVoid ? "opacity-50" : ""}>
                <Td className="font-semibold">{payment.receipt_no}</Td>
                <Td>{payment.note?.trim() || "دفعة"}</Td>
                <Td>{courseAndClassForInvoice(payment.invoice_id)}</Td>
                <Td className="tabular-nums">{money(receiptAmount(payment), cur)}</Td>
                <Td>{payment.method === "cash" ? "نقدًا" : payment.method === "bank" ? "مصرف" : "أخرى"}</Td>
                <Td>{dateStr(payment.paid_at)}</Td>
                <Td>{isVoid ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">مقبوض</Badge>}</Td>
                <Td><Button variant="secondary" onClick={() => printReceipt(currentDb, payment)}>{isVoid || currentDb.invoices.find((invoice) => invoice.id === payment.invoice_id)?.status === "cancelled" ? "🖨️ طباعة نسخة تاريخية" : "🖨️ طباعة السند"}</Button></Td>
              </tr>
            );
          })}
        </Table>
      ) : canViewFinance ? <Empty text="لا توجد دفعات قبض." /> : null}

      <StudentEnrollmentModal open={enrollOpen} studentId={student.id} onClose={() => setEnrollOpen(false)} />
    </div>
  );
}

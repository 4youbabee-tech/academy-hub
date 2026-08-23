import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { money, dateStr } from "@/lib/format";
import { invoiceFinancials, studentBalance } from "@/lib/finance";
import { printReceipt } from "@/lib/receipt-print";

export const Route = createFileRoute("/students/$id")({
  head: () => ({
    meta: [
      { title: "ملف الطالب — نظام إدارة المعهد" },
      { name: "description", content: "ملف الطالب: البيانات، التسجيلات، الفواتير والإيصالات." },
      { property: "og:title", content: "ملف الطالب — نظام إدارة المعهد" },
      { property: "og:description", content: "التسجيلات وكشف الحساب المالي للطالب." },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const { id } = Route.useParams();
  const { db, allowed } = useApp();
  if (!db) return null;
  if (!allowed("students.view")) return <Denied />;
  const currentDb = db;
  const canViewFinance = allowed("finance.view");

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
  const payments = currentDb.payments
    .filter((p) => p.student_id === student.id)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at));

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
            <Button variant="secondary" onClick={() => window.print()}>
              طباعة كشف الحساب
            </Button>
            <Link to="/students">
              <Button variant="ghost">رجوع</Button>
            </Link>
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
          <p>
            ولي الأمر: {student.guardian_name || "—"} {student.guardian_phone ? `(${student.guardian_phone})` : ""}
          </p>
          <p>الهاتف: {student.phone || "—"}</p>
          <p>العنوان: {student.address || "—"}</p>
          {student.notes ? <p className="sm:col-span-2">ملاحظات: {student.notes}</p> : null}
        </div>
      </Panel>

      <h2 className="mb-2 mt-6 text-sm font-bold">التسجيلات</h2>
      {enrollments.length ? (
        <Table head={canViewFinance
          ? ["الصف", "الدورة", "تاريخ التسجيل", "قيمة التسجيل", "الحالة"]
          : ["الصف", "الدورة", "تاريخ التسجيل", "الحالة"]}>
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
                <Td>
                  {e.status === "active"
                    ? <Badge tone="success">نشط</Badge>
                    : e.status === "completed"
                      ? <Badge tone="primary">منتهٍ</Badge>
                      : e.status === "withdrawn"
                        ? <Badge tone="muted">منسحب</Badge>
                        : <Badge tone="danger">ملغى</Badge>}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty text="لا توجد تسجيلات." />
      )}

      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">كشف الحساب المالي</h2> : null}
      {canViewFinance && invoices.length ? (
        <Table head={["الفاتورة", "الدورة / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", "التاريخ"]}>
          {invoices.map((i) => {
            const financials = invoiceFinancials(currentDb, i);
            return (
              <tr key={i.id}>
                <Td className="font-semibold">{i.number}</Td>
                <Td>{courseAndClassForInvoice(i.id)}</Td>
                <Td className="tabular-nums">{money(i.total, cur)}</Td>
                <Td className="tabular-nums">{money(financials.paid, cur)}</Td>
                <Td className="tabular-nums">{money(financials.due, cur)}</Td>
                <Td>
                  {i.status === "paid"
                    ? <Badge tone="success">مسددة</Badge>
                    : i.status === "open"
                      ? <Badge tone="danger">عليها رصيد</Badge>
                      : <Badge tone="muted">ملغاة</Badge>}
                </Td>
                <Td>{dateStr(i.issued_at)}</Td>
              </tr>
            );
          })}
        </Table>
      ) : canViewFinance ? (
        <Empty text="لا توجد فواتير." />
      ) : null}

      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">سندات القبض</h2> : null}
      {canViewFinance && payments.length ? (
        <Table head={["رقم السند", "البيان / الملاحظة", "الدورة / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {payments.map((p) => {
            return (
              <tr key={p.id} className={p.is_void ? "opacity-50" : ""}>
                <Td className="font-semibold">{p.receipt_no}</Td>
                <Td>{p.note?.trim() || "دفعة"}</Td>
                <Td>{courseAndClassForInvoice(p.invoice_id)}</Td>
                <Td className="tabular-nums">{money(p.amount, cur)}</Td>
                <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "مصرف" : "أخرى"}</Td>
                <Td>{dateStr(p.paid_at)}</Td>
                <Td>
                  {p.is_void ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">مقبوض</Badge>}
                </Td>
                <Td>
                  {!p.is_void && currentDb.invoices.find((invoice) => invoice.id === p.invoice_id)?.status !== "cancelled" ? (
                    <Button variant="ghost" onClick={() => printReceipt(currentDb, p)}>
                      🖨️ طباعة
                    </Button>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : canViewFinance ? (
        <Empty text="لا توجد سندات قبض." />
      ) : null}
    </div>
  );
}

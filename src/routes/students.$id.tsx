import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { money, dateStr } from "@/lib/format";
import { invoiceBalance, studentBalance } from "@/lib/finance";
import { attendanceRate, finalResult } from "@/lib/grading";

export const Route = createFileRoute("/students/$id")({
  head: () => ({
    meta: [
      { title: "ملف الطالب — نظام إدارة المعهد" },
      { name: "description", content: "ملف الطالب الكامل: التسجيلات، الحضور، العلامات وكشف الحساب المالي." },
      { property: "og:title", content: "ملف الطالب — نظام إدارة المعهد" },
      { property: "og:description", content: "التسجيلات والحضور والعلامات وكشف الحساب." },
    ],
  }),
  component: StudentProfile,
});

function StudentProfile() {
  const { id } = Route.useParams();
  const { db, allowed } = useApp();
  if (!db) return null;
  if (!allowed("students.view")) return <Denied />;

  const student = db.students.find((s) => s.id === id);
  if (!student) return <Empty text="الطالب غير موجود." />;

  const cur = db.settings.currency;
  const bal = studentBalance(db, student.id);
  const enrollments = db.enrollments.filter((e) => e.student_id === student.id);
  const invoices = db.invoices.filter((i) => i.student_id === student.id);
  const payments = db.payments.filter((p) => p.student_id === student.id);

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
        <Stat label="إجمالي الفواتير" value={money(bal.billed, cur)} />
        <Stat label="المدفوع" value={money(bal.paid, cur)} tone="success" />
        <Stat label="المتبقي" value={money(bal.due, cur)} tone={bal.due > 0 ? "danger" : "success"} />
        <Stat label="عدد التسجيلات" value={String(enrollments.length)} />
      </div>

      <Panel className="mt-4">
        <h2 className="text-sm font-bold">البيانات الشخصية</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>تاريخ الميلاد: {dateStr(student.birth_date)}</p>
          <p>الجنس: {student.gender === "male" ? "ذكر" : student.gender === "female" ? "أنثى" : "—"}</p>
          <p>ولي الأمر: {student.guardian_name || "—"} {student.guardian_phone ? `(${student.guardian_phone})` : ""}</p>
          <p>العنوان: {student.address || "—"}</p>
          {student.notes ? <p className="sm:col-span-2">ملاحظات: {student.notes}</p> : null}
        </div>
      </Panel>

      <h2 className="mb-2 mt-6 text-sm font-bold">التاريخ الأكاديمي</h2>
      {enrollments.length ? (
        <Table head={["الصف", "الدورة", "تاريخ التسجيل", "الحضور", "النتيجة", "الحالة"]}>
          {enrollments.map((e) => {
            const klass = db.classes.find((c) => c.id === e.class_id);
            const course = db.courses.find((c) => c.id === klass?.course_id);
            const att = attendanceRate(db, e.id);
            const res = finalResult(db, e.id);
            return (
              <tr key={e.id}>
                <Td>{klass?.name ?? "—"}</Td>
                <Td>{course?.name ?? "—"}</Td>
                <Td>{dateStr(e.enrolled_at)}</Td>
                <Td className="tabular-nums">{att === null ? "—" : `${att.toFixed(0)}%`}</Td>
                <Td className="tabular-nums">
                  {res?.total == null ? "—" : (
                    <Badge tone={res.passed ? "success" : "danger"}>{res.total.toFixed(1)}%</Badge>
                  )}
                </Td>
                <Td>{e.status === "active" ? "نشط" : e.status === "completed" ? "منتهٍ" : e.status === "withdrawn" ? "منسحب" : "ملغى"}</Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty text="لا توجد تسجيلات." />
      )}

      <h2 className="mb-2 mt-6 text-sm font-bold">كشف الحساب المالي</h2>
      {invoices.length ? (
        <Table head={["الفاتورة", "الإجمالي", "المتبقي", "الحالة", "التاريخ"]}>
          {invoices.map((i) => (
            <tr key={i.id}>
              <Td>{i.number}</Td>
              <Td className="tabular-nums">{money(i.total, cur)}</Td>
              <Td className="tabular-nums">{money(invoiceBalance(db, i.id), cur)}</Td>
              <Td>{i.status === "paid" ? "مدفوعة" : i.status === "open" ? "مفتوحة" : "ملغاة"}</Td>
              <Td>{dateStr(i.issued_at)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="لا توجد فواتير." />
      )}

      <h2 className="mb-2 mt-6 text-sm font-bold">الإيصالات</h2>
      {payments.length ? (
        <Table head={["الإيصال", "المبلغ", "الطريقة", "التاريخ", "ملاحظة"]}>
          {payments.map((p) => (
            <tr key={p.id} className={p.is_void ? "opacity-50" : ""}>
              <Td>{p.receipt_no}</Td>
              <Td className="tabular-nums">{money(p.amount, cur)}</Td>
              <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "مصرف" : "أخرى"}</Td>
              <Td>{dateStr(p.paid_at)}</Td>
              <Td>{p.is_void ? `ملغاة — ${p.void_reason}` : "—"}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="لا توجد دفعات." />
      )}
    </div>
  );
}

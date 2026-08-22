import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/session";
import { Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { Denied } from "@/components/AppShell";
import { money, dateStr, today } from "@/lib/format";
import { profitAndLoss, studentBalance } from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات — نظام إدارة المعهد" },
      { name: "description", content: "نظرة عامة على الطلاب والصفوف والمقبوضات والمصروفات والأرصدة." },
      { property: "og:title", content: "لوحة المعلومات — نظام إدارة المعهد" },
      { property: "og:description", content: "نظرة عامة على الطلاب والصفوف والمقبوضات والمصروفات والأرصدة." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { db, allowed } = useApp();
  if (!db) return null;
  if (!allowed("students.view")) return <Denied />;

  const cur = db.settings.currency;
  const activeStudents = db.students.filter((s) => s.status === "active").length;
  const runningClasses = db.classes.filter((c) => c.status === "running").length;
  const billed = db.invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.total, 0);
  const paid = db.payments.filter((p) => !p.is_void).reduce((s, p) => s + p.amount, 0);
  const studentsDue = Math.max(0, billed - paid);
  const month = today().slice(0, 7);

  let pl = { net: 0, income: 0, cost: 0, tuition: 0, otherIncome: 0, expenses: 0, payroll: 0 };
  try {
    pl = profitAndLoss(db, `${month}-01`, `${month}-31`);
  } catch (error) {
    console.error("خطأ في حساب الربح والخسارة:", error);
  }

  const studentsWithBalance = db.students
    .map((student) => ({ student, balance: studentBalance(db, student.id) }))
    .filter((row) => row.balance.due > 0)
    .sort((a, b) => b.balance.due - a.balance.due);

  return (
    <div>
      <PageHeader title="لوحة المعلومات" subtitle={`${db.settings.institute_name} — السنة ${db.settings.academic_year}`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="الطلاب النشطون" value={String(activeStudents)} hint={`إجمالي الطلاب: ${db.students.length}`} />
        <Stat label="صفوف قيد التنفيذ" value={String(runningClasses)} hint={`إجمالي الصفوف: ${db.classes.length}`} />
        <Stat
          label="إجمالي المتبقي على الطلاب"
          value={money(studentsDue, cur)}
          hint="المبالغ المستحقة على الطلاب ناقص ما تم قبضه"
          tone={studentsDue > 0 ? "warning" : "success"}
        />
        <Stat
          label="مقبوضات الطلاب هذا الشهر"
          value={money(pl.tuition, cur)}
          hint="مجموع سندات القبض السارية خلال الشهر الحالي"
          tone="success"
        />
        <Stat
          label="إجمالي مصروفات الشركة هذا الشهر"
          value={money(pl.cost, cur)}
          hint={`تشغيلية ${money(pl.expenses, cur)} + رواتب ${money(pl.payroll, cur)}`}
          tone={pl.cost > 0 ? "danger" : "muted"}
        />
        <Stat
          label="صافي الشهر الحالي"
          value={money(pl.net, cur)}
          hint="إجمالي المداخيل ناقص إجمالي مصروفات الشركة"
          tone={pl.net >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold">طلاب عليهم رصيد ({studentsWithBalance.length})</h2>
          {studentsWithBalance.length ? (
            <Table head={["الطالب", "المستحق", "المقبوض", "المتبقي"]}>
              {studentsWithBalance.slice(0, 8).map(({ student, balance }) => (
                <tr key={student.id}>
                  <Td>
                    <Link className="font-semibold text-primary hover:underline" to="/students/$id" params={{ id: student.id }}>
                      {student.full_name}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{money(balance.billed, cur)}</Td>
                  <Td className="tabular-nums text-emerald-700">{money(balance.paid, cur)}</Td>
                  <Td className="tabular-nums text-destructive">{money(balance.due, cur)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty text="لا يوجد طلاب عليهم رصيد حاليًا." />
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold">آخر الدفعات</h2>
          {db.payments.length ? (
            <Table head={["الإيصال", "الطالب", "المبلغ", "التاريخ"]}>
              {[...db.payments]
                .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
                .slice(0, 8)
                .map((p) => (
                  <tr key={p.id} className={p.is_void ? "opacity-50 line-through" : ""}>
                    <Td>{p.receipt_no}</Td>
                    <Td>{db.students.find((s) => s.id === p.student_id)?.full_name ?? "—"}</Td>
                    <Td className="tabular-nums">{money(p.amount, cur)}</Td>
                    <Td>{dateStr(p.paid_at)}</Td>
                  </tr>
                ))}
            </Table>
          ) : (
            <Empty text="لم تُسجَّل دفعات بعد." />
          )}
        </div>
      </div>

      <Panel className="mt-6">
        <h2 className="text-sm font-bold">بداية سريعة</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="text-primary underline" to="/students">إضافة طالب</Link>
          <Link className="text-primary underline" to="/courses">إنشاء دورة</Link>
          <Link className="text-primary underline" to="/classes">فتح صف وتسجيل الطلاب</Link>
          <Link className="text-primary underline" to="/backup">أخذ نسخة احتياطية</Link>
        </div>
      </Panel>
    </div>
  );
}

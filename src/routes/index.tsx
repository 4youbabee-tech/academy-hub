import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/session";
import { Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { Denied } from "@/components/AppShell";
import { money, dateStr, today } from "@/lib/format";
import { overdueInstallments, profitAndLoss } from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات — نظام إدارة المعهد" },
      { name: "description", content: "نظرة عامة على الطلاب والصفوف والمالية والمتأخرات في المعهد." },
      { property: "og:title", content: "لوحة المعلومات — نظام إدارة المعهد" },
      { property: "og:description", content: "نظرة عامة على الطلاب والصفوف والمالية والمتأخرات." },
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

  const overdue = overdueInstallments(db);

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
          <h2 className="mb-2 text-sm font-bold">أقساط متأخرة ({overdue.length})</h2>
          {overdue.length ? (
            <Table head={["الطالب", "تاريخ الاستحقاق", "المبلغ"]}>
              {overdue.slice(0, 8).map((ins) => {
                const inv = db.invoices.find((i) => i.id === ins.invoice_id);
                const st = db.students.find((s) => s.id === inv?.student_id);
                return (
                  <tr key={ins.id}>
                    <Td>{st?.full_name ?? "—"}</Td>
                    <Td>{dateStr(ins.due_date)}</Td>
                    <Td className="tabular-nums text-destructive">{money(ins.amount, cur)}</Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty text="لا توجد أقساط متأخرة." />
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

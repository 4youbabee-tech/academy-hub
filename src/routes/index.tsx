import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/session";
import { Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { Denied } from "@/components/AppShell";
import { money, dateStr, today } from "@/lib/format";
import { profitAndLoss, studentBalanceMap } from "@/lib/finance";

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
  const canViewFinance = allowed("finance.view");
  const activeStudents = db.students.filter((s) => s.status === "active").length;
  const runningClasses = db.classes.filter((c) => c.status === "running").length;
  const balancesByStudent = studentBalanceMap(db);
  const studentsDue = [...balancesByStudent.values()].reduce((sum, balance) => sum + balance.due, 0);
  const month = today().slice(0, 7);

  let pl = { net: 0, income: 0, cost: 0, tuition: 0, otherIncome: 0, expenses: 0, payroll: 0 };
  if (canViewFinance) {
    try {
      pl = profitAndLoss(db, `${month}-01`, `${month}-31`);
    } catch (error) {
      console.error("خطأ في حساب الربح والخسارة:", error);
    }
  }

  const studentsWithBalance = canViewFinance ? db.students
    .map((student) => ({ student, balance: balancesByStudent.get(student.id) ?? { billed: 0, paid: 0, due: 0 } }))
    .filter((row) => row.balance.due > 0)
    .sort((a, b) => b.balance.due - a.balance.due) : [];

  const activeInvoiceIds = new Set(db.invoices.filter((invoice) => invoice.status !== "cancelled").map((invoice) => invoice.id));
  const latestPayments = canViewFinance
    ? db.payments
        .filter((payment) => !payment.is_void && activeInvoiceIds.has(payment.invoice_id))
        .slice()
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
        .slice(0, 8)
    : [];

  return (
    <div>
      <PageHeader title="لوحة المعلومات" subtitle={`${db.settings.institute_name} — السنة ${db.settings.academic_year}`} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="الطلاب النشطون" value={String(activeStudents)} hint={`إجمالي الطلاب: ${db.students.length}`} />
        <Stat label="صفوف قيد التنفيذ" value={String(runningClasses)} hint={`إجمالي الصفوف: ${db.classes.length}`} />
        {canViewFinance ? (
          <>
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
              tone={pl.cost > 0 ? "danger" : "default"}
            />
            <Stat
              label="صافي الشهر الحالي"
              value={money(pl.net, cur)}
              hint="إجمالي المداخيل ناقص إجمالي مصروفات الشركة"
              tone={pl.net >= 0 ? "success" : "danger"}
            />
          </>
        ) : null}
      </div>

      {canViewFinance ? <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
          {latestPayments.length ? (
            <Table head={["الإيصال", "الطالب", "المبلغ", "التاريخ"]}>
              {latestPayments.map((p) => (
                  <tr key={p.id}>
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
      </div> : null}

      <Panel className="mt-6">
        <h2 className="text-sm font-bold">بداية سريعة</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {allowed("students.create") ? <Link className="text-primary underline" to="/students">إضافة طالب</Link> : null}
          {allowed("courses.create") ? <Link className="text-primary underline" to="/courses">إنشاء دورة</Link> : null}
          {allowed("classes.view") ? <Link className="text-primary underline" to="/classes">فتح صف وتسجيل الطلاب</Link> : null}
          {allowed("backup.view") ? <Link className="text-primary underline" to="/backup">أخذ نسخة احتياطية</Link> : null}
        </div>
      </Panel>
    </div>
  );
}

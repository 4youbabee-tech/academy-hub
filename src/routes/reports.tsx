import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Button, Empty, Field, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceBalance, profitAndLoss } from "@/lib/finance";
import { fromMinor, money, today } from "@/lib/format";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام إدارة المعهد" },
      { name: "description", content: "التقارير المالية، المقبوضات، المصروفات، الرواتب، وأرصدة الطلاب." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "profit" | "balances";

function ReportsPage() {
  const { db, allowed } = useApp();
  const [type, setType] = useState<ReportType>("profit");
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());

  if (!db) return null;
  if (!allowed("reports.view")) return <Denied />;

  const cur = db.settings.currency;

  const profitData = useMemo(() => {
    if (type !== "profit") return null;
    return profitAndLoss(db, from, to);
  }, [db, from, to, type]);

  const balances = useMemo(() => {
    if (type !== "balances") return [];

    return db.invoices
      .filter((inv) => inv.status !== "cancelled")
      .map((inv) => {
        const student = db.students.find((s) => s.id === inv.student_id);
        const enrollment = db.enrollments.find((e) => e.id === inv.enrollment_id);
        const klass = db.classes.find((k) => k.id === enrollment?.class_id);
        const course = db.courses.find((c) => c.id === klass?.course_id);
        const due = Math.max(0, invoiceBalance(db, inv.id));
        const paid = Math.max(0, inv.total - due);
        return { inv, student, klass, course, paid, due };
      })
      .filter((row) => row.due > 0)
      .sort((a, b) => b.due - a.due);
  }, [db, type]);

  function exportCSV() {
    let headers: string[] = [];
    let rows: string[][] = [];

    const csvCell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
    const amount = (minor: number) => fromMinor(minor);

    if (type === "profit" && profitData) {
      headers = ["البيان", `القيمة (${cur})`];
      rows = [
        ["مقبوضات الطلاب", amount(profitData.tuition)],
        ["مداخيل أخرى", amount(profitData.otherIncome)],
        ["إجمالي الإيرادات", amount(profitData.income)],
        ["المصاريف التشغيلية", amount(profitData.expenses)],
        ["الرواتب المدفوعة", amount(profitData.payroll)],
        ["إجمالي مصروفات الشركة", amount(profitData.cost)],
        ["صافي الربح/الخسارة", amount(profitData.net)],
      ];
    } else if (type === "balances") {
      headers = ["الطالب", "الدورة / الصف", `إجمالي المستحق (${cur})`, `المقبوض (${cur})`, `المتبقي (${cur})`];
      rows = balances.map((row) => [
        row.student?.full_name || "—",
        row.course?.name ? `${row.course.name}${row.klass ? ` — ${row.klass.name}` : ""}` : "—",
        amount(row.inv.total),
        amount(row.paid),
        amount(row.due),
      ]);
    }

    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}_report_${from}_to_${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalStudentDue = balances.reduce((sum, row) => sum + row.due, 0);
  const totalStudentPaid = balances.reduce((sum, row) => sum + row.paid, 0);

  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="تقارير مالية واضحة ومباشرة"
        actions={<Button onClick={exportCSV}>📥 تصدير CSV</Button>}
      />

      <div className="panel mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="نوع التقرير">
            <Select value={type} onChange={(e) => setType(e.target.value as ReportType)} className="min-w-40">
              <option value="profit">الربح والخسارة</option>
              <option value="balances">أرصدة الطلاب</option>
            </Select>
          </Field>
          {type === "profit" ? (
            <>
              <Field label="من تاريخ">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="إلى تاريخ">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
      </div>

      {type === "profit" && profitData ? (
        <div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="إجمالي الإيرادات" value={money(profitData.income, cur)} tone="success" />
            <Stat label="إجمالي مصروفات الشركة" value={money(profitData.cost, cur)} tone="danger" />
            <Stat
              label="صافي الربح/الخسارة"
              value={money(profitData.net, cur)}
              tone={profitData.net >= 0 ? "success" : "danger"}
            />
            <div className="panel p-4">
              <p className="text-xs font-semibold text-muted-foreground">تفصيل المصروفات</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>مصاريف تشغيلية: {money(profitData.expenses, cur)}</p>
                <p>رواتب مدفوعة: {money(profitData.payroll, cur)}</p>
              </div>
            </div>
          </div>

          <div className="panel mt-4 p-4">
            <p className="mb-3 text-sm font-bold">تفصيل الحركة المالية</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">مقبوضات الطلاب</p>
                <p className="mt-1 font-bold tabular-nums">{money(profitData.tuition, cur)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مداخيل أخرى</p>
                <p className="mt-1 font-bold tabular-nums">{money(profitData.otherIncome, cur)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المصاريف التشغيلية</p>
                <p className="mt-1 font-bold tabular-nums">{money(profitData.expenses, cur)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الرواتب المدفوعة</p>
                <p className="mt-1 font-bold tabular-nums">{money(profitData.payroll, cur)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {type === "balances" ? (
        <div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat label="عدد الفواتير التي عليها رصيد" value={String(balances.length)} />
            <Stat label="المقبوض منها" value={money(totalStudentPaid, cur)} tone="success" />
            <Stat label="إجمالي المتبقي على الطلاب" value={money(totalStudentDue, cur)} tone="danger" />
          </div>

          {balances.length === 0 ? (
            <Empty text="لا توجد أرصدة متبقية على الطلاب." />
          ) : (
            <Table head={["الطالب", "الدورة / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", ""]}>
              {balances.map((row) => (
                <tr key={row.inv.id}>
                  <Td className="font-semibold">{row.student?.full_name || "—"}</Td>
                  <Td>{row.course?.name ? `${row.course.name}${row.klass ? ` — ${row.klass.name}` : ""}` : "—"}</Td>
                  <Td className="tabular-nums">{money(row.inv.total, cur)}</Td>
                  <Td className="tabular-nums text-emerald-700">{money(row.paid, cur)}</Td>
                  <Td className="tabular-nums text-destructive">{money(row.due, cur)}</Td>
                  <Td>
                    {row.student ? (
                      <Link to="/students/$id" params={{ id: row.student.id }} className="text-primary hover:underline">
                        فتح الطالب
                      </Link>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}

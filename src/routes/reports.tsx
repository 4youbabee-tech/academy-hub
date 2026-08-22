import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Button, Empty, Field, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { overdueInstallments, profitAndLoss } from "@/lib/finance";
import { dateStr, money, today } from "@/lib/format";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام إدارة المعهد" },
      { name: "description", content: "التقارير المالية، المقبوضات، المصروفات، الرواتب، والمتأخرات." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "profit" | "arrears";

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

  const arrears = useMemo(() => {
    if (type !== "arrears") return [];
    const overdue = overdueInstallments(db);
    return overdue.map((ins) => {
      const inv = db.invoices.find((i) => i.id === ins.invoice_id);
      const student = db.students.find((s) => s.id === inv?.student_id);
      return {
        student: student?.full_name || "—",
        amount: ins.amount,
        due: ins.due_date,
      };
    });
  }, [db, type]);

  function exportCSV() {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === "profit" && profitData) {
      headers = ["البيان", "القيمة"];
      rows = [
        ["مقبوضات الطلاب", String(profitData.tuition)],
        ["مداخيل أخرى", String(profitData.otherIncome)],
        ["إجمالي الإيرادات", String(profitData.income)],
        ["المصاريف التشغيلية", String(profitData.expenses)],
        ["الرواتب المدفوعة", String(profitData.payroll)],
        ["إجمالي مصروفات الشركة", String(profitData.cost)],
        ["صافي الربح/الخسارة", String(profitData.net)],
      ];
    } else if (type === "arrears") {
      headers = ["الطالب", "المبلغ المتأخر", "تاريخ الاستحقاق"];
      rows = arrears.map((a) => [a.student, String(a.amount), a.due]);
    }

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${type}_report_${from}_to_${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="تقارير مالية واضحة مع إمكانية التصدير إلى CSV"
        actions={<Button onClick={exportCSV}>📥 تصدير CSV</Button>}
      />

      <div className="panel mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="نوع التقرير">
            <Select value={type} onChange={(e) => setType(e.target.value as ReportType)} className="min-w-40">
              <option value="profit">الربح والخسارة</option>
              <option value="arrears">المتأخرات</option>
            </Select>
          </Field>
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
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

      {type === "arrears" ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            إجمالي المتأخرات: {money(arrears.reduce((sum, item) => sum + item.amount, 0), cur)}
          </p>
          {arrears.length === 0 ? (
            <Empty text="لا توجد متأخرات." />
          ) : (
            <Table head={["الطالب", "المبلغ المتأخر", "تاريخ الاستحقاق"]}>
              {arrears.map((item, index) => (
                <tr key={`${item.student}-${item.due}-${index}`}>
                  <Td className="font-semibold">{item.student}</Td>
                  <Td className="text-destructive tabular-nums">{money(item.amount, cur)}</Td>
                  <Td>{dateStr(item.due)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { profitAndLoss, overdueInstallments } from "@/lib/finance";
import { money, dateStr, today } from "@/lib/format";
import { attendanceRate, finalResult } from "@/lib/grading";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام إدارة المعهد" },
      { name: "description", content: "تقارير الربح والخسارة، المتأخرات، الحضور، والنتائج." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "profit" | "arrears" | "attendance" | "grades";

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
      return { student: student?.full_name || "—", amount: ins.amount, due: ins.due_date };
    });
  }, [db, type]);

  const attendanceReport = useMemo(() => {
    if (type !== "attendance") return null;
    const records = db.attendance;
    const present = records.filter((a) => a.status === "present" || a.status === "excused").length;
    const absent = records.filter((a) => a.status === "absent").length;
    const late = records.filter((a) => a.status === "late").length;
    return { present, absent, late, total: records.length };
  }, [db, type]);

  const gradesReport = useMemo(() => {
    if (type !== "grades") return [];
    const enrollments = db.enrollments.filter((e) => e.status === "active" || e.status === "completed");
    return enrollments
      .map((e) => {
        const student = db.students.find((s) => s.id === e.student_id);
        const klass = db.classes.find((c) => c.id === e.class_id);
        const res = finalResult(db, e.id);
        const att = attendanceRate(db, e.id);
        return {
          student: student?.full_name || "—",
          course: klass?.name || "—",
          attendance: att !== null ? `${att.toFixed(0)}%` : "—",
          result: res?.total !== undefined && res?.total !== null ? `${res.total.toFixed(1)}%` : "—",
          passed: res?.passed ?? false,
        };
      })
      .sort((a, b) => (a.result > b.result ? -1 : 1));
  }, [db, type]);

  function exportCSV() {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === "profit" && profitData) {
      headers = ["البيان", "القيمة"];
      rows = [
        ["الإيرادات (رسوم)", `${profitData.tuition}`],
        ["الإيرادات (أخرى)", `${profitData.otherIncome}`],
        ["إجمالي الإيرادات", `${profitData.income}`],
        ["المصروفات", `${profitData.expenses}`],
        ["الرواتب", `${profitData.payroll}`],
        ["إجمالي المصروفات", `${profitData.cost}`],
        ["صافي الربح/الخسارة", `${profitData.net}`],
      ];
    } else if (type === "arrears") {
      headers = ["الطالب", "المبلغ المتأخر", "تاريخ الاستحقاق"];
      rows = arrears.map((a) => [a.student, String(a.amount), a.due]);
    } else if (type === "attendance" && attendanceReport) {
      headers = ["الحالة", "العدد"];
      rows = [
        ["حاضر", String(attendanceReport.present)],
        ["متأخر", String(attendanceReport.late)],
        ["غائب", String(attendanceReport.absent)],
        ["الإجمالي", String(attendanceReport.total)],
      ];
    } else if (type === "grades") {
      headers = ["الطالب", "الدورة", "الحضور", "النتيجة", "الحالة"];
      rows = gradesReport.map((g) => [g.student, g.course, g.attendance, g.result, g.passed ? "ناجح" : "راسب"]);
    }

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${type}_report_${from}_to_${to}.csv`;
    link.click();
  }

  const typeLabels: Record<ReportType, string> = {
    profit: "📊 الربح والخسارة",
    arrears: "💰 المتأخرات",
    attendance: "📋 الحضور والغياب",
    grades: "📈 نتائج العلامات",
  };

  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle="تقارير شاملة مع إمكانية التصدير إلى CSV"
        actions={<Button onClick={exportCSV}>📥 تصدير CSV</Button>}
      />

      <div className="panel mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="نوع التقرير">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className="min-w-40"
            >
              <option value="profit">الربح والخسارة</option>
              <option value="arrears">المتأخرات</option>
              <option value="attendance">الحضور والغياب</option>
              <option value="grades">نتائج العلامات</option>
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

      {type === "profit" && profitData && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="إجمالي الإيرادات" value={money(profitData.income, cur)} tone="success" />
          <Stat label="إجمالي المصروفات" value={money(profitData.cost, cur)} tone="danger" />
          <Stat label="صافي الربح/الخسارة" value={money(profitData.net, cur)} tone={profitData.net >= 0 ? "success" : "danger"} />
          <div className="panel p-4">
            <p className="text-xs font-semibold text-muted-foreground">التفاصيل</p>
            <div className="mt-2 space-y-1 text-sm">
              <p>رسوم: {money(profitData.tuition, cur)}</p>
              <p>مداخيل أخرى: {money(profitData.otherIncome, cur)}</p>
              <p>مصاريف: {money(profitData.expenses, cur)}</p>
              <p>رواتب: {money(profitData.payroll, cur)}</p>
            </div>
          </div>
        </div>
      )}

      {type === "arrears" && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">إجمالي المتأخرات: {money(arrears.reduce((s, a) => s + a.amount, 0), cur)}</p>
          {arrears.length === 0 ? (
            <Empty text="لا توجد متأخرات." />
          ) : (
            <Table head={["الطالب", "المبلغ", "تاريخ الاستحقاق"]}>
              {arrears.map((a, i) => (
                <tr key={i}>
                  <Td className="font-semibold">{a.student}</Td>
                  <Td className="text-destructive">{money(a.amount, cur)}</Td>
                  <Td>{dateStr(a.due)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {type === "attendance" && attendanceReport && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="حاضر" value={String(attendanceReport.present)} tone="success" />
          <Stat label="متأخر" value={String(attendanceReport.late)} tone="warning" />
          <Stat label="غائب" value={String(attendanceReport.absent)} tone="danger" />
          <Stat label="الإجمالي" value={String(attendanceReport.total)} />
        </div>
      )}

      {type === "grades" && (
        <div>
          {gradesReport.length === 0 ? (
            <Empty text="لا توجد علامات مسجلة." />
          ) : (
            <Table head={["الطالب", "الدورة", "الحضور", "النتيجة", "الحالة"]}>
              {gradesReport.map((g, i) => (
                <tr key={i}>
                  <Td className="font-semibold">{g.student}</Td>
                  <Td>{g.course}</Td>
                  <Td>{g.attendance}</Td>
                  <Td className="tabular-nums font-bold">{g.result}</Td>
                  <Td>
                    <Badge tone={g.passed ? "success" : "danger"}>{g.passed ? "ناجح" : "راسب"}</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

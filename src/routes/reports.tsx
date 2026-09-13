import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Button, Empty, Field, Input, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceFinancials, profitAndLoss, studentMonthlyLedger } from "@/lib/finance";
import { fromMinor, localMonthKey, money, today } from "@/lib/format";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام إدارة المعهد" },
      { name: "description", content: "التقارير المالية، المقبوضات، المصروفات، الرواتب، وأرصدة الطلاب." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "profit" | "balances" | "monthly-status";

function ReportsPage() {
  const { db, allowed } = useApp();
  const [type, setType] = useState<ReportType>("profit");
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [reportMonth, setReportMonth] = useState(localMonthKey());
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [studentQuery, setStudentQuery] = useState("");

  const profitData = useMemo(() => {
    if (!db || type !== "profit") return null;
    return profitAndLoss(db, from, to);
  }, [db, from, to, type]);

  const balances = useMemo(() => {
    if (!db || type !== "balances") return [];

    return db.invoices
      .filter((inv) => inv.status !== "cancelled")
      .map((inv) => {
        const student = db.students.find((s) => s.id === inv.student_id);
        const enrollment = db.enrollments.find((e) => e.id === inv.enrollment_id);
        const klass = db.classes.find((k) => k.id === enrollment?.class_id);
        const course = db.courses.find((c) => c.id === klass?.course_id);
        const financials = invoiceFinancials(db, inv);
        return { inv, student, klass, course, paid: financials.paid, due: financials.due };
      })
      .filter((row) => row.due > 0)
      .sort((a, b) => b.due - a.due);
  }, [db, type]);
  const monthlyStatusRows = useMemo(() => {
    if (!db || type !== "monthly-status") return [];
    const term = studentQuery.trim().toLowerCase();
    return db.students.flatMap((student) => {
      const ledger = studentMonthlyLedger(db, student.id);
      const current = ledger.filter((row) => row.period === reportMonth);
      if (!current.length) return [];
      const amount = current.reduce((sum, row) => sum + row.amount, 0);
      const paid = current.reduce((sum, row) => sum + row.paid, 0);
      const due = current.reduce((sum, row) => sum + row.due, 0);
      const priorDue = ledger.filter((row) => row.period < reportMonth).reduce((sum, row) => sum + row.due, 0);
      const status = due <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
      if (paymentStatus !== "all" && status !== paymentStatus) return [];
      if (term && !student.full_name.toLowerCase().includes(term) && !student.code.toLowerCase().includes(term)) return [];
      return [{ student, amount, paid, due, priorDue, status }];
    }).sort((a, b) => b.due - a.due || a.student.full_name.localeCompare(b.student.full_name, "ar"));
  }, [db, type, reportMonth, paymentStatus, studentQuery]);
  const pagination = usePagination(balances, type);
  const monthlyPagination = usePagination(monthlyStatusRows, `${reportMonth}|${paymentStatus}|${studentQuery}`);

  if (!db) return null;
  if (!allowed("reports.view")) return <Denied />;

  const cur = db.settings.currency;

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
      headers = ["الطالب", "العام الدراسي / الصف", `إجمالي المستحق (${cur})`, `المقبوض (${cur})`, `المتبقي (${cur})`];
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
              <option value="monthly-status">مدفوع / غير مدفوع شهرياً</option>
            </Select>
          </Field>
          {type === "monthly-status" ? (
            <>
              <Field label="الشهر"><Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></Field>
              <Field label="الحالة">
                <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option value="all">الكل</option><option value="paid">مدفوع</option><option value="partial">مدفوع جزئياً</option><option value="unpaid">غير مدفوع</option>
                </Select>
              </Field>
              <Field label="بحث بالطالب"><Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="الاسم أو الرمز" /></Field>
            </>
          ) : null}
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

      {type === "monthly-status" ? (
        <div>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Stat label="عدد الطلاب" value={String(monthlyStatusRows.length)} />
            <Stat label="مدفوع بالكامل" value={String(monthlyStatusRows.filter((row) => row.status === "paid").length)} tone="success" />
            <Stat label="مدفوع جزئياً" value={String(monthlyStatusRows.filter((row) => row.status === "partial").length)} />
            <Stat label="غير مدفوع" value={String(monthlyStatusRows.filter((row) => row.status === "unpaid").length)} tone="danger" />
          </div>
          {monthlyStatusRows.length ? (
            <>
              <Table head={["الطالب", "الشهر", "المستحق", "المدفوع", "المتبقي", "متأخرات أقدم", "الحالة", ""]}>
                {monthlyPagination.rows.map((row) => (
                  <tr key={row.student.id}>
                    <Td className="font-semibold">{row.student.full_name}</Td><Td>{reportMonth}</Td>
                    <Td className="tabular-nums">{money(row.amount, cur)}</Td><Td className="tabular-nums text-emerald-700">{money(row.paid, cur)}</Td>
                    <Td className={row.due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(row.due, cur)}</Td>
                    <Td className={row.priorDue > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(row.priorDue, cur)}</Td>
                    <Td>{row.status === "paid" ? "مدفوع" : row.status === "partial" ? "جزئي" : "غير مدفوع"}</Td>
                    <Td><Link to="/students/$id" params={{ id: row.student.id }} className="text-primary hover:underline">فتح البطاقة</Link></Td>
                  </tr>
                ))}
              </Table>
              <PaginationControls page={monthlyPagination.page} pageCount={monthlyPagination.pageCount} pageSize={monthlyPagination.pageSize} total={monthlyPagination.total} from={monthlyPagination.from} to={monthlyPagination.to} onPrevious={monthlyPagination.previous} onNext={monthlyPagination.next} onPageSizeChange={monthlyPagination.setPageSize} />
            </>
          ) : <Empty text="لا يوجد طلاب مطابقون لهذا الشهر والحالة." />}
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
            <>
            <Table head={["الطالب", "الدورة / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", ""]}>
              {pagination.rows.map((row) => (
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
            <PaginationControls
              page={pagination.page}
              pageCount={pagination.pageCount}
              pageSize={pagination.pageSize}
              total={pagination.total}
              from={pagination.from}
              to={pagination.to}
              onPrevious={pagination.previous}
              onNext={pagination.next}
              onPageSizeChange={pagination.setPageSize}
            />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

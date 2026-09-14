import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Button, Empty, Field, Input, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceFinancials, profitAndLoss, studentMonthlyLedger } from "@/lib/finance";
import { localMonthKey, money, today } from "@/lib/format";
import { payrollPaid, payrollRemaining } from "@/lib/payroll";
import { downloadXlsx } from "@/lib/xlsx";
import { usePagination } from "@/hooks/use-pagination";
import { MonthYearPicker } from "@/components/MonthYearPicker";
import { printReceipt } from "@/lib/receipt-print";
import { printPayrollPaymentReceipt } from "@/lib/payroll-print";
import { printReport, type PrintableReport } from "@/lib/report-print";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام إدارة المركز التعليمي" },
      { name: "description", content: "التقارير المالية، تحصيل الطلاب، الرواتب، وأرصدة الطلاب." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "profit" | "balances" | "monthly-status" | "payroll";
type PaymentStatus = "all" | "paid" | "partial" | "unpaid";

function numericMonth(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return `${Number(period.slice(5, 7))} / ${period.slice(0, 4)}`;
}

function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

function statusLabel(status: Exclude<PaymentStatus, "all">): string {
  return status === "paid" ? "مدفوع بالكامل" : status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع";
}

function ReportsPage() {
  const { db, allowed } = useApp();
  const [type, setType] = useState<ReportType>("profit");
  const [from, setFrom] = useState(today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today());
  const [reportMonth, setReportMonth] = useState(localMonthKey());
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("all");
  const [studentQuery, setStudentQuery] = useState("");
  const [balanceQuery, setBalanceQuery] = useState("");
  const [payrollStatus, setPayrollStatus] = useState<PaymentStatus>("all");
  const [employeeQuery, setEmployeeQuery] = useState("");

  const profitData = useMemo(() => {
    if (!db || type !== "profit") return null;
    return profitAndLoss(db, from, to);
  }, [db, from, to, type]);

  const balances = useMemo(() => {
    if (!db || type !== "balances") return [];
    const term = balanceQuery.trim().toLowerCase();
    return db.invoices
      .filter((invoice) => invoice.status !== "cancelled")
      .map((invoice) => {
        const student = db.students.find((row) => row.id === invoice.student_id);
        const enrollment = db.enrollments.find((row) => row.id === invoice.enrollment_id);
        const klass = db.classes.find((row) => row.id === enrollment?.class_id);
        const course = db.courses.find((row) => row.id === klass?.course_id);
        const financials = invoiceFinancials(db, invoice);
        return { inv: invoice, student, klass, course, paid: financials.paid, due: financials.due };
      })
      .filter((row) => row.due > 0)
      .filter((row) => !term || [row.student?.full_name, row.student?.code, row.course?.name, row.klass?.name].some((value) => (value ?? "").toLowerCase().includes(term)))
      .sort((a, b) => b.due - a.due);
  }, [db, type, balanceQuery]);

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
      const status: Exclude<PaymentStatus, "all"> = due <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
      if (paymentStatus !== "all" && status !== paymentStatus) return [];
      if (term && !student.full_name.toLowerCase().includes(term) && !student.code.toLowerCase().includes(term)) return [];
      const invoiceIds = new Set(current.map((row) => row.invoice_id));
      const latestReceipt = db.payments
        .filter((payment) => invoiceIds.has(payment.invoice_id) && !payment.is_void)
        .slice()
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))[0];
      return [{ student, amount, paid, due, priorDue, status, latestReceipt }];
    }).sort((a, b) => b.due - a.due || a.student.full_name.localeCompare(b.student.full_name, "ar"));
  }, [db, type, reportMonth, paymentStatus, studentQuery]);

  const payrollRows = useMemo(() => {
    if (!db || type !== "payroll") return [];
    const term = employeeQuery.trim().toLowerCase();
    return db.payroll_items
      .filter((item) => item.period === reportMonth)
      .map((item) => {
        const employee = db.employees.find((row) => row.id === item.employee_id);
        const paid = payrollPaid(db, item.id);
        const remaining = payrollRemaining(db, item.id);
        const status: Exclude<PaymentStatus, "all"> = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
        const latestPayment = db.payroll_payments
          .filter((payment) => payment.payroll_item_id === item.id && !payment.is_void)
          .slice()
          .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))[0];
        return { item, employee, paid, remaining, status, latestPayment };
      })
      .filter((row) => payrollStatus === "all" || row.status === payrollStatus)
      .filter((row) => !term || [row.employee?.full_name, row.employee?.job_title].some((value) => (value ?? "").toLowerCase().includes(term)))
      .sort((a, b) => b.remaining - a.remaining || (a.employee?.full_name ?? "").localeCompare(b.employee?.full_name ?? "", "ar"));
  }, [db, type, reportMonth, payrollStatus, employeeQuery]);

  const balancePagination = usePagination(balances, `${type}|${balanceQuery}`);
  const monthlyPagination = usePagination(monthlyStatusRows, `${reportMonth}|${paymentStatus}|${studentQuery}`);
  const payrollPagination = usePagination(payrollRows, `${reportMonth}|${payrollStatus}|${employeeQuery}`);

  if (!db) return null;
  if (!allowed("reports.view")) return <Denied />;
  const currentDb = db;
  const cur = currentDb.settings.currency;
  const totalStudentDue = balances.reduce((sum, row) => sum + row.due, 0);
  const totalStudentPaid = balances.reduce((sum, row) => sum + row.paid, 0);
  const payrollNet = payrollRows.reduce((sum, row) => sum + row.item.net, 0);
  const payrollPaidTotal = payrollRows.reduce((sum, row) => sum + row.paid, 0);
  const payrollDueTotal = payrollRows.reduce((sum, row) => sum + row.remaining, 0);

  function excelRows(): { sheet: string; filename: string; rows: (string | number)[][] } {
    if (type === "profit" && profitData) return {
      sheet: "الربح والخسارة", filename: `profit_${from}_${to}.xlsx`, rows: [
        ["البيان", `القيمة (${cur})`], ["مقبوضات الطلاب", toMajor(profitData.tuition)], ["مداخيل أخرى", toMajor(profitData.otherIncome)],
        ["إجمالي الإيرادات", toMajor(profitData.income)], ["المصاريف التشغيلية", toMajor(profitData.expenses)], ["الرواتب المدفوعة", toMajor(profitData.payroll)],
        ["إجمالي المصروفات", toMajor(profitData.cost)], ["صافي الربح/الخسارة", toMajor(profitData.net)],
      ],
    };
    if (type === "balances") return {
      sheet: "أرصدة الطلاب", filename: `student_balances_${today()}.xlsx`, rows: [
        ["الطالب", "الرمز", "العام الدراسي / الصف", `إجمالي المستحق (${cur})`, `المقبوض (${cur})`, `المتبقي (${cur})`],
        ...balances.map((row) => [row.student?.full_name || "—", row.student?.code || "—", row.course?.name ? `${row.course.name}${row.klass ? ` — ${row.klass.name}` : ""}` : "—", toMajor(row.inv.total), toMajor(row.paid), toMajor(row.due)]),
      ],
    };
    if (type === "monthly-status") return {
      sheet: "حالة دفع الطلاب", filename: `student_month_${reportMonth}.xlsx`, rows: [
        ["الطالب", "الرمز", "الشهر", `المستحق (${cur})`, `المدفوع (${cur})`, `المتبقي (${cur})`, `متأخرات أقدم (${cur})`, "الحالة"],
        ...monthlyStatusRows.map((row) => [row.student.full_name, row.student.code, numericMonth(reportMonth), toMajor(row.amount), toMajor(row.paid), toMajor(row.due), toMajor(row.priorDue), statusLabel(row.status)]),
      ],
    };
    return {
      sheet: "رواتب الموظفين", filename: `payroll_${reportMonth}.xlsx`, rows: [
        ["الموظف", "الوظيفة", "الشهر", `الراتب الأساسي (${cur})`, `الإضافات (${cur})`, `الحسميات (${cur})`, `خصم السلف (${cur})`, `الصافي (${cur})`, `المدفوع (${cur})`, `المتبقي (${cur})`, "الحالة"],
        ...payrollRows.map((row) => [row.employee?.full_name || "—", row.employee?.job_title || "—", numericMonth(row.item.period), toMajor(row.item.base_snapshot), toMajor(row.item.bonus), toMajor(row.item.deduction), toMajor(row.item.advance_deducted), toMajor(row.item.net), toMajor(row.paid), toMajor(row.remaining), statusLabel(row.status)]),
      ],
    };
  }

  function exportExcel() {
    const output = excelRows();
    downloadXlsx(output.filename, output.sheet, output.rows);
  }

  function printableReport(): PrintableReport {
    if (type === "profit" && profitData) return {
      title: "تقرير الربح والخسارة", subtitle: `من ${from} إلى ${to}`,
      headers: ["البيان", "القيمة"],
      rows: [["مقبوضات الطلاب", money(profitData.tuition, cur)], ["مداخيل أخرى", money(profitData.otherIncome, cur)], ["المصاريف التشغيلية", money(profitData.expenses, cur)], ["الرواتب المدفوعة", money(profitData.payroll, cur)], ["صافي الربح/الخسارة", money(profitData.net, cur)]],
      summary: [{ label: "إجمالي الإيرادات", value: money(profitData.income, cur) }, { label: "إجمالي المصروفات", value: money(profitData.cost, cur) }, { label: "الصافي", value: money(profitData.net, cur) }],
    };
    if (type === "balances") return {
      title: "تقرير أرصدة الطلاب", subtitle: `حتى ${today()}`,
      headers: ["الطالب", "الرمز", "العام الدراسي / الصف", "المستحق", "المقبوض", "المتبقي"],
      rows: balances.map((row) => [row.student?.full_name || "—", row.student?.code || "—", row.course?.name ? `${row.course.name}${row.klass ? ` — ${row.klass.name}` : ""}` : "—", money(row.inv.total, cur), money(row.paid, cur), money(row.due, cur)]),
      summary: [{ label: "عدد الفواتير عليها رصيد", value: String(balances.length) }, { label: "إجمالي المتبقي", value: money(totalStudentDue, cur) }],
    };
    if (type === "monthly-status") return {
      title: "تقرير حالة دفع الطلاب", subtitle: `شهر ${numericMonth(reportMonth)}`,
      headers: ["الطالب", "الرمز", "المستحق", "المدفوع", "المتبقي", "متأخرات أقدم", "الحالة"],
      rows: monthlyStatusRows.map((row) => [row.student.full_name, row.student.code, money(row.amount, cur), money(row.paid, cur), money(row.due, cur), money(row.priorDue, cur), statusLabel(row.status)]),
      summary: [{ label: "عدد الطلاب", value: String(monthlyStatusRows.length) }, { label: "مدفوع بالكامل", value: String(monthlyStatusRows.filter((row) => row.status === "paid").length) }, { label: "غير مدفوع/جزئي", value: String(monthlyStatusRows.filter((row) => row.status !== "paid").length) }],
    };
    return {
      title: "تقرير رواتب الموظفين", subtitle: `شهر ${numericMonth(reportMonth)}`,
      headers: ["الموظف", "الوظيفة", "الأساسي", "الإضافات", "الحسميات", "السلف", "الصافي", "المدفوع", "المتبقي", "الحالة"],
      rows: payrollRows.map((row) => [row.employee?.full_name || "—", row.employee?.job_title || "—", money(row.item.base_snapshot, cur), money(row.item.bonus, cur), money(row.item.deduction, cur), money(row.item.advance_deducted, cur), money(row.item.net, cur), money(row.paid, cur), money(row.remaining, cur), statusLabel(row.status)]),
      summary: [{ label: "عدد الموظفين", value: String(payrollRows.length) }, { label: "صافي الرواتب", value: money(payrollNet, cur) }, { label: "المدفوع", value: money(payrollPaidTotal, cur) }, { label: "المتبقي", value: money(payrollDueTotal, cur) }],
    };
  }

  return (
    <div>
      <PageHeader title="التقارير" subtitle="عرض مباشر، طباعة مستقرة، وتصدير Excel" actions={<div className="flex flex-wrap gap-2"><Button onClick={exportExcel}>📥 تصدير Excel</Button><Button variant="secondary" onClick={() => printReport(currentDb.settings, printableReport())}>🖨️ طباعة التقرير</Button></div>} />

      <div className="panel mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="نوع التقرير"><Select value={type} onChange={(event) => setType(event.target.value as ReportType)} className="min-w-44"><option value="profit">الربح والخسارة</option><option value="balances">أرصدة الطلاب</option><option value="monthly-status">حالة الدفع الشهرية للطلاب</option><option value="payroll">رواتب الموظفين الشهرية</option></Select></Field>
          {type === "profit" ? <><Field label="من تاريخ"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="إلى تاريخ"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field></> : null}
          {type === "balances" ? <Field label="بحث"><Input value={balanceQuery} onChange={(event) => setBalanceQuery(event.target.value)} placeholder="طالب، رمز، عام دراسي أو صف" /></Field> : null}
          {type === "monthly-status" ? <><MonthYearPicker period={reportMonth} onChange={setReportMonth} /><Field label="الحالة"><Select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}><option value="all">الكل</option><option value="paid">مدفوع بالكامل</option><option value="partial">مدفوع جزئيًا</option><option value="unpaid">غير مدفوع</option></Select></Field><Field label="بحث بالطالب"><Input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="الاسم أو الرمز" /></Field></> : null}
          {type === "payroll" ? <><MonthYearPicker period={reportMonth} onChange={setReportMonth} /><Field label="الحالة"><Select value={payrollStatus} onChange={(event) => setPayrollStatus(event.target.value as PaymentStatus)}><option value="all">الكل</option><option value="paid">مدفوع بالكامل</option><option value="partial">مدفوع جزئيًا</option><option value="unpaid">غير مدفوع</option></Select></Field><Field label="بحث بالموظف"><Input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="الاسم أو الوظيفة" /></Field></> : null}
        </div>
      </div>

      {type === "profit" && profitData ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Stat label="إجمالي الإيرادات" value={money(profitData.income, cur)} tone="success" /><Stat label="إجمالي المصروفات" value={money(profitData.cost, cur)} tone="danger" /><Stat label="صافي الربح/الخسارة" value={money(profitData.net, cur)} tone={profitData.net >= 0 ? "success" : "danger"} /></div><div className="mt-4"><Table head={["البيان", "القيمة"]}><tr><Td>مقبوضات الطلاب</Td><Td>{money(profitData.tuition, cur)}</Td></tr><tr><Td>مداخيل أخرى</Td><Td>{money(profitData.otherIncome, cur)}</Td></tr><tr><Td>المصاريف التشغيلية</Td><Td>{money(profitData.expenses, cur)}</Td></tr><tr><Td>الرواتب المدفوعة</Td><Td>{money(profitData.payroll, cur)}</Td></tr><tr><Td className="font-bold">صافي الربح/الخسارة</Td><Td className="font-bold">{money(profitData.net, cur)}</Td></tr></Table></div></> : null}

      {type === "balances" ? <><div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="عدد الفواتير التي عليها رصيد" value={String(balances.length)} /><Stat label="المقبوض منها" value={money(totalStudentPaid, cur)} tone="success" /><Stat label="إجمالي المتبقي على الطلاب" value={money(totalStudentDue, cur)} tone="danger" /></div>{balances.length ? <><Table head={["الطالب", "العام الدراسي / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", ""]}>{balancePagination.rows.map((row) => <tr key={row.inv.id}><Td className="font-semibold">{row.student?.full_name || "—"}</Td><Td>{row.course?.name ? `${row.course.name}${row.klass ? ` — ${row.klass.name}` : ""}` : "—"}</Td><Td>{money(row.inv.total, cur)}</Td><Td className="text-emerald-700">{money(row.paid, cur)}</Td><Td className="text-destructive">{money(row.due, cur)}</Td><Td>{row.student ? <Link to="/students/$id" params={{ id: row.student.id }} className="text-primary hover:underline">فتح البطاقة</Link> : null}</Td></tr>)}</Table><PaginationControls page={balancePagination.page} pageCount={balancePagination.pageCount} pageSize={balancePagination.pageSize} total={balancePagination.total} from={balancePagination.from} to={balancePagination.to} onPrevious={balancePagination.previous} onNext={balancePagination.next} onPageSizeChange={balancePagination.setPageSize} /></> : <Empty text="لا توجد أرصدة متبقية على الطلاب." />}</> : null}

      {type === "monthly-status" ? <><div className="mb-4 grid gap-3 sm:grid-cols-4"><Stat label="عدد الطلاب" value={String(monthlyStatusRows.length)} /><Stat label="مدفوع بالكامل" value={String(monthlyStatusRows.filter((row) => row.status === "paid").length)} tone="success" /><Stat label="مدفوع جزئيًا" value={String(monthlyStatusRows.filter((row) => row.status === "partial").length)} /><Stat label="غير مدفوع" value={String(monthlyStatusRows.filter((row) => row.status === "unpaid").length)} tone="danger" /></div>{monthlyStatusRows.length ? <><Table head={["الطالب", "الشهر", "المستحق", "المدفوع", "المتبقي", "متأخرات أقدم", "الحالة", ""]}>{monthlyPagination.rows.map((row) => <tr key={row.student.id}><Td className="font-semibold">{row.student.full_name}</Td><Td>{numericMonth(reportMonth)}</Td><Td>{money(row.amount, cur)}</Td><Td className="text-emerald-700">{money(row.paid, cur)}</Td><Td className={row.due > 0 ? "text-destructive" : ""}>{money(row.due, cur)}</Td><Td className={row.priorDue > 0 ? "text-destructive" : ""}>{money(row.priorDue, cur)}</Td><Td>{statusLabel(row.status)}</Td><Td><div className="flex flex-wrap gap-1">{row.latestReceipt ? <Button variant="secondary" onClick={() => printReceipt(currentDb, row.latestReceipt!)}>🖨️ آخر سند</Button> : null}<Link to="/students/$id" params={{ id: row.student.id }} className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-muted">فتح البطاقة</Link></div></Td></tr>)}</Table><PaginationControls page={monthlyPagination.page} pageCount={monthlyPagination.pageCount} pageSize={monthlyPagination.pageSize} total={monthlyPagination.total} from={monthlyPagination.from} to={monthlyPagination.to} onPrevious={monthlyPagination.previous} onNext={monthlyPagination.next} onPageSizeChange={monthlyPagination.setPageSize} /></> : <Empty text="لا يوجد طلاب مطابقون لهذا الشهر والحالة." />}</> : null}

      {type === "payroll" ? <><div className="mb-4 grid gap-3 sm:grid-cols-4"><Stat label="عدد الموظفين" value={String(payrollRows.length)} /><Stat label="إجمالي صافي الرواتب" value={money(payrollNet, cur)} /><Stat label="المدفوع" value={money(payrollPaidTotal, cur)} tone="success" /><Stat label="المتبقي" value={money(payrollDueTotal, cur)} tone={payrollDueTotal > 0 ? "danger" : "success"} /></div>{payrollRows.length ? <><Table head={["الموظف", "الشهر", "الأساسي", "الإضافات", "الحسميات", "السلف", "الصافي", "المدفوع", "المتبقي", "الحالة", ""]}>{payrollPagination.rows.map((row) => <tr key={row.item.id}><Td className="font-semibold">{row.employee?.full_name || "—"}</Td><Td>{numericMonth(row.item.period)}</Td><Td>{money(row.item.base_snapshot, cur)}</Td><Td>{money(row.item.bonus, cur)}</Td><Td>{money(row.item.deduction, cur)}</Td><Td>{money(row.item.advance_deducted, cur)}</Td><Td className="font-semibold">{money(row.item.net, cur)}</Td><Td className="text-emerald-700">{money(row.paid, cur)}</Td><Td className={row.remaining > 0 ? "text-destructive" : ""}>{money(row.remaining, cur)}</Td><Td>{statusLabel(row.status)}</Td><Td>{row.latestPayment ? <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, row.item, row.latestPayment!)}>🖨️ آخر سند</Button> : null}</Td></tr>)}</Table><PaginationControls page={payrollPagination.page} pageCount={payrollPagination.pageCount} pageSize={payrollPagination.pageSize} total={payrollPagination.total} from={payrollPagination.from} to={payrollPagination.to} onPrevious={payrollPagination.previous} onNext={payrollPagination.next} onPageSizeChange={payrollPagination.setPageSize} /></> : <Empty text="لا توجد رواتب مطابقة لهذا الشهر والحالة." />}</> : null}
    </div>
  );
}

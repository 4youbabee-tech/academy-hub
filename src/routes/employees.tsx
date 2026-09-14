import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { EmployeeFinancialCard } from "@/components/EmployeeFinancialCard";
import { PayrollSettlementModal } from "@/components/PayrollSettlementModal";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import { dateStr, fromMinor, localMonthKey, money, numericMonthPeriodLabel, toMinor, today } from "@/lib/format";
import type { Employee, PayrollItem } from "@/lib/types";
import { generatePayroll as createPayroll, payrollPaid, payrollRemaining, recordAdvance } from "@/lib/payroll";
import { employeePayrollBalance, payrollSettlementRows } from "@/lib/payroll-settlement";
import { payrollItemCost } from "@/lib/finance";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagination } from "@/hooks/use-pagination";
import { printHtmlDocument } from "@/lib/print-document";
import { printPayrollPaymentReceipt } from "@/lib/payroll-print";
import { MonthYearPicker } from "@/components/MonthYearPicker";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "الموظفون والرواتب — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إدارة الموظفين والمدرّسين، السلف، وكشوف الرواتب الشهرية." },
    ],
  }),
  component: EmployeesPage,
});

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch] || ch);
}

function EmployeesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", kind: "teacher" as Employee["kind"], job_title: "", phone: "", salary: "", hired_at: today(), ended_at: "", active: true });
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(localMonthKey());
  const [advFor, setAdvFor] = useState<string | null>(null);
  const [adv, setAdv] = useState({ amount: "", reason: "" });
  const [settlementEmployeeId, setSettlementEmployeeId] = useState<string | null>(null);
  const [settlementThroughPeriod, setSettlementThroughPeriod] = useState<string | null>(null);
  const [cardEmployeeId, setCardEmployeeId] = useState<string | null>(null);
  const [employeeQ, setEmployeeQ] = useState("");
  const [payrollQ, setPayrollQ] = useState("");
  const [payrollStatus, setPayrollStatus] = useState<"" | "paid" | "partial" | "unpaid">("");
  const debouncedEmployeeQ = useDebouncedValue(employeeQ);
  const debouncedPayrollQ = useDebouncedValue(payrollQ);

  const employees = useMemo(() => {
    if (!db) return [];
    const term = debouncedEmployeeQ.trim().toLowerCase();
    return db.employees
      .filter((employee) => !term || employee.full_name.toLowerCase().includes(term) || employee.job_title.toLowerCase().includes(term) || employee.phone.includes(term))
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
  }, [db, debouncedEmployeeQ]);

  const items = useMemo(() => {
    if (!db) return [];
    const term = debouncedPayrollQ.trim().toLowerCase();
    return db.payroll_items
      .filter((item) => item.period === period)
      .filter((item) => {
        const paid = payrollPaid(db, item.id);
        const remaining = payrollRemaining(db, item.id);
        const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
        return !payrollStatus || status === payrollStatus;
      })
      .filter((item) => {
        if (!term) return true;
        const employee = db.employees.find((row) => row.id === item.employee_id);
        return Boolean(employee && (employee.full_name.toLowerCase().includes(term) || employee.job_title.toLowerCase().includes(term)));
      });
  }, [db, period, debouncedPayrollQ, payrollStatus]);

  const employeePagination = usePagination(employees, debouncedEmployeeQ);
  const payrollPagination = usePagination(items, `${period}|${debouncedPayrollQ}|${payrollStatus}`);

  if (!db) return null;
  if (!allowed("payroll.view")) return <Denied />;
  const currentDb = db;
  const canEdit = allowed("payroll.create");
  const cur = currentDb.settings.currency;

  function saveEmployee() {
    if (!form.full_name.trim()) return setError("الاسم إلزامي");
    const baseSalary = toMinor(form.salary);
    if (baseSalary < 0) return setError("الراتب الأساسي لا يمكن أن يكون سالبًا");
    if (!form.hired_at) return setError("تاريخ بدء العمل إلزامي");
    if (!form.active && !form.ended_at) return setError("تاريخ انتهاء العمل إلزامي عند إيقاف الموظف");
    if (form.ended_at && form.ended_at < form.hired_at) return setError("تاريخ انتهاء العمل لا يمكن أن يسبق تاريخ البداية");
    const endedAt = form.active ? null : form.ended_at;
    if (editId) {
      const outstandingAdvances = currentDb.advances.filter((row) => row.employee_id === editId && !row.settled).reduce((sum, row) => sum + row.amount, 0);
      if (baseSalary < outstandingAdvances) return setError(`لا يمكن جعل الراتب أقل من السلف غير المسددة (${money(outstandingAdvances, cur)})`);
      update("employees", editId, {
        full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone,
        hired_at: form.hired_at, ended_at: endedAt, base_salary: baseSalary, active: form.active,
      }, actor, `تعديل موظف ${form.full_name}`);
    } else {
      insert("employees", {
        full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone,
        hired_at: form.hired_at, ended_at: null, base_salary: baseSalary, active: true,
      }, actor, `موظف جديد ${form.full_name}`);
    }
    setOpen(false);
    setError(null);
  }

  function generatePayroll() {
    try {
      createPayroll(period, actor);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function saveAdvance() {
    if (!advFor) return;
    const amount = toMinor(adv.amount);
    if (amount <= 0) return setError("مبلغ السلفة غير صالح");
    try {
      recordAdvance(advFor, amount, adv.reason, actor);
      setAdvFor(null);
      setAdv({ amount: "", reason: "" });
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function openSettlement(employeeId: string, throughPeriod: string | null = null) {
    setSettlementEmployeeId(employeeId);
    setSettlementThroughPeriod(throughPeriod);
    setError(null);
  }

  function latestPaymentForItem(item: PayrollItem) {
    return currentDb.payroll_payments
      .filter((payment) => !payment.is_void && payrollSettlementRows(currentDb, payment).some((row) => row.payroll_item_id === item.id))
      .slice()
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))[0];
  }

  function printSalaryStatement(item: PayrollItem) {
    const employee = currentDb.employees.find((row) => row.id === item.employee_id);
    const paid = payrollPaid(currentDb, item.id);
    const remaining = payrollRemaining(currentDb, item.id);
    const settings = currentDb.settings;
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8" /><title>كشف راتب ${escapeHtml(employee?.full_name || "")}</title><style>
      @page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;direction:rtl;margin:0;padding:12px;color:#111}.sheet{max-width:190mm;margin:auto;border:1px solid #ddd;border-radius:10px;padding:18px}.head{text-align:center;border-bottom:2px solid #1f6b5c;padding-bottom:10px}.title{font-size:20px;font-weight:800}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ddd}.total{margin-top:12px;padding:10px;background:#fafafa;border:1px solid #ddd;border-radius:8px;font-weight:800}@media print{body{padding:0}.sheet{border:0}}
    </style></head><body><div class="sheet"><div class="head">${settings.logo_data_url ? `<img src="${settings.logo_data_url}" style="max-height:70px;max-width:140px" />` : ""}<div class="title">${escapeHtml(settings.institute_name)}</div><div>كشف راتب شهر ${escapeHtml(numericMonthPeriodLabel(item.period))}</div></div>
    <div class="row"><span>الموظف</span><b>${escapeHtml(employee?.full_name || "—")}</b></div><div class="row"><span>الراتب الأساسي</span><b>${escapeHtml(money(item.base_snapshot, cur))}</b></div><div class="row"><span>الإضافات</span><b>${escapeHtml(money(item.bonus, cur))}</b></div><div class="row"><span>الحسميات</span><b>${escapeHtml(money(item.deduction, cur))}</b></div><div class="row"><span>خصم السلف</span><b>${escapeHtml(money(item.advance_deducted, cur))}</b></div><div class="total"><div class="row"><span>الصافي</span><b>${escapeHtml(money(item.net, cur))}</b></div><div class="row"><span>المدفوع</span><b>${escapeHtml(money(paid, cur))}</b></div><div class="row"><span>المتبقي للموظف</span><b>${escapeHtml(money(remaining, cur))}</b></div></div></div></body></html>`;
    printHtmlDocument(html, "A4");
  }

  const totalSalaryEntitlement = items.reduce((sum, item) => sum + payrollItemCost(item), 0);
  const paidNet = items.reduce((sum, item) => sum + payrollPaid(currentDb, item.id), 0);
  const remainingNet = items.reduce((sum, item) => sum + payrollRemaining(currentDb, item.id), 0);
  const advancesThisPeriod = currentDb.advances.filter((row) => row.date.slice(0, 7) === period).reduce((sum, row) => sum + row.amount, 0);

  return (
    <div>
      <PageHeader
        title="الموظفون والرواتب"
        subtitle="كل شهر مستقل محاسبيًا، مع إظهار المتأخرات للموظف ودفعها من نفس العملية"
        actions={canEdit ? <Button onClick={() => {
          setEditId(null);
          setForm({ full_name: "", kind: "teacher", job_title: "", phone: "", salary: "", hired_at: today(), ended_at: "", active: true });
          setError(null);
          setOpen(true);
        }}>موظف جديد</Button> : null}
      />

      {currentDb.employees.length ? <Input className="mb-4" placeholder="بحث باسم الموظف أو الوظيفة أو الهاتف..." value={employeeQ} onChange={(event) => setEmployeeQ(event.target.value)} /> : null}
      {employees.length === 0 ? <Empty text={employeeQ ? "لا يوجد موظفون مطابقون للبحث." : "لا يوجد موظفون."} /> : (
        <>
          <Table head={["الاسم", "النوع", "المسمى", "الهاتف", "الراتب", "المتبقي له", "الحالة", "الإجراءات"]}>
            {employeePagination.rows.map((employee) => {
              const due = employeePayrollBalance(currentDb, employee.id);
              return (
                <tr key={employee.id}>
                  <Td className="font-semibold">{employee.full_name}</Td>
                  <Td>{employee.kind === "teacher" ? "مدرّس" : "إداري"}</Td>
                  <Td>{employee.job_title || "—"}</Td>
                  <Td>{employee.phone || "—"}</Td>
                  <Td className="tabular-nums">{money(employee.base_salary, cur)}</Td>
                  <Td className={due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(due, cur)}</Td>
                  <Td>{employee.active ? <Badge tone="success">نشط</Badge> : <Badge tone="muted">موقوف</Badge>}</Td>
                  <Td><div className="flex flex-wrap gap-1">
                    <Button variant="secondary" onClick={() => setCardEmployeeId(employee.id)}>📋 بطاقة الموظف</Button>
                    {canEdit && due > 0 ? <Button variant="secondary" onClick={() => openSettlement(employee.id)}>دفع مستحقات</Button> : null}
                    {canEdit ? <>
                      <Button variant="ghost" onClick={() => {
                        setEditId(employee.id);
                        setForm({ full_name: employee.full_name, kind: employee.kind, job_title: employee.job_title, phone: employee.phone, salary: fromMinor(employee.base_salary), hired_at: employee.hired_at, ended_at: employee.ended_at ?? "", active: employee.active });
                        setOpen(true);
                      }}>تعديل</Button>
                      <Button variant="ghost" onClick={() => { setAdvFor(employee.id); setAdv({ amount: "", reason: "" }); setError(null); }}>سلفة</Button>
                    </> : null}
                  </div></Td>
                </tr>
              );
            })}
          </Table>
          <PaginationControls page={employeePagination.page} pageCount={employeePagination.pageCount} pageSize={employeePagination.pageSize} total={employeePagination.total} from={employeePagination.from} to={employeePagination.to} onPrevious={employeePagination.previous} onNext={employeePagination.next} onPageSizeChange={employeePagination.setPageSize} />
        </>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold">كشف الرواتب</h2>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_1fr_200px_auto] lg:items-end">
        <MonthYearPicker period={period} onChange={setPeriod} />
        <Field label="بحث"><Input value={payrollQ} onChange={(event) => setPayrollQ(event.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>
        <Field label="حالة الدفع"><Select value={payrollStatus} onChange={(event) => setPayrollStatus(event.target.value as "" | "paid" | "partial" | "unpaid")}><option value="">الكل</option><option value="paid">مدفوع بالكامل</option><option value="partial">مدفوع جزئيًا</option><option value="unpaid">غير مدفوع</option></Select></Field>
        {canEdit ? <Button onClick={generatePayroll}>توليد الكشف</Button> : null}
      </div>
      {error && !open && !advFor ? <p className="mb-4 text-sm font-semibold text-destructive">{error}</p> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="استحقاق الشهر" value={money(totalSalaryEntitlement, cur)} />
        <Stat label="المدفوع من رواتب الشهر" value={money(paidNet, cur)} tone="success" />
        <Stat label="المتبقي من رواتب الشهر" value={money(remainingNet, cur)} tone={remainingNet > 0 ? "danger" : "success"} />
        <Stat label="سلف مدفوعة خلال الشهر" value={money(advancesThisPeriod, cur)} />
      </div>

      {items.length === 0 ? <Empty text="لا يوجد كشف لهذه الفترة." /> : (
        <>
          <Table head={["الموظف", "الأساسي", "خصم السلف", "الصافي", "المدفوع", "المتبقي", "الحالة", "تاريخ الإكمال", "الإجراءات"]}>
            {payrollPagination.rows.map((item) => {
              const employee = currentDb.employees.find((row) => row.id === item.employee_id);
              const paid = payrollPaid(currentDb, item.id);
              const remaining = payrollRemaining(currentDb, item.id);
              const latestPayment = latestPaymentForItem(item);
              return (
                <tr key={item.id}>
                  <Td className="font-semibold">{employee?.full_name ?? "—"}</Td>
                  <Td>{money(item.base_snapshot, cur)}</Td><Td>{money(item.advance_deducted, cur)}</Td><Td className="font-semibold">{money(item.net, cur)}</Td>
                  <Td className="text-emerald-700">{money(paid, cur)}</Td><Td className={remaining > 0 ? "text-destructive" : ""}>{money(remaining, cur)}</Td>
                  <Td>{remaining <= 0 ? <Badge tone="success">مدفوع</Badge> : paid > 0 ? <Badge tone="primary">جزئي</Badge> : <Badge tone="muted">غير مدفوع</Badge>}</Td>
                  <Td>{item.paid_at ? dateStr(item.paid_at) : "—"}</Td>
                  <Td><div className="flex flex-wrap gap-1">
                    {canEdit && remaining > 0 ? <Button variant="secondary" onClick={() => openSettlement(item.employee_id, period)}>دفع</Button> : null}
                    {latestPayment ? <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, item, latestPayment)}>🖨️ آخر سند</Button> : null}
                    <Button variant="ghost" onClick={() => setCardEmployeeId(item.employee_id)}>📋 البطاقة</Button>
                    <Button variant="ghost" onClick={() => printSalaryStatement(item)}>🖨️ كشف الراتب</Button>
                  </div></Td>
                </tr>
              );
            })}
          </Table>
          <PaginationControls page={payrollPagination.page} pageCount={payrollPagination.pageCount} pageSize={payrollPagination.pageSize} total={payrollPagination.total} from={payrollPagination.from} to={payrollPagination.to} onPrevious={payrollPagination.previous} onNext={payrollPagination.next} onPageSizeChange={payrollPagination.setPageSize} />
        </>
      )}

      <Modal open={open} title={editId ? "تعديل موظف" : "موظف جديد"} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="الاسم الكامل"><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النوع"><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Employee["kind"] })}><option value="teacher">مدرّس</option><option value="staff">إداري</option></Select></Field>
            <Field label="المسمى الوظيفي"><Input value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} /></Field>
            <Field label="الهاتف"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="الراتب الأساسي"><Input type="number" min="0" step="0.01" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} /></Field>
            <Field label="تاريخ بدء العمل"><Input type="date" value={form.hired_at} onChange={(event) => setForm({ ...form, hired_at: event.target.value })} /></Field>
            <Field label="الحالة"><Select value={form.active ? "active" : "inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "active", ended_at: event.target.value === "active" ? "" : form.ended_at })}><option value="active">نشط</option><option value="inactive">منتهي / موقوف</option></Select></Field>
            {!form.active ? <Field label="تاريخ انتهاء العمل"><Input type="date" value={form.ended_at} onChange={(event) => setForm({ ...form, ended_at: event.target.value })} /></Field> : null}
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={saveEmployee}>حفظ</Button></div>
        </div>
      </Modal>

      <Modal open={!!advFor} title="سلفة موظف" onClose={() => { setAdvFor(null); setError(null); }}>
        <div className="space-y-3">
          <Field label="المبلغ"><Input type="number" min="0" step="0.01" value={adv.amount} onChange={(event) => setAdv({ ...adv, amount: event.target.value })} /></Field>
          <Field label="السبب"><Input value={adv.reason} onChange={(event) => setAdv({ ...adv, reason: event.target.value })} /></Field>
          {advFor ? <p className="text-xs text-muted-foreground">السلف غير المسددة الحالية: {money(currentDb.advances.filter((row) => row.employee_id === advFor && !row.settled).reduce((sum, row) => sum + row.amount, 0), cur)}</p> : null}
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAdvFor(null)}>إلغاء</Button><Button onClick={saveAdvance}>حفظ</Button></div>
        </div>
      </Modal>

      <PayrollSettlementModal employeeId={settlementEmployeeId} open={!!settlementEmployeeId} throughPeriod={settlementThroughPeriod} onClose={() => { setSettlementEmployeeId(null); setSettlementThroughPeriod(null); }} />
      <EmployeeFinancialCard employeeId={cardEmployeeId} open={!!cardEmployeeId} onClose={() => setCardEmployeeId(null)} />
    </div>
  );
}

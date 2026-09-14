import { useMemo, useState } from "react";
import { Badge, Button, Empty, Modal, Panel, Select, Stat, Table, Td } from "@/components/ui-kit";
import { PayrollSettlementModal } from "@/components/PayrollSettlementModal";
import { useApp } from "@/lib/session";
import { dateStr, localMonthKey, money, numericMonthPeriodLabel } from "@/lib/format";
import { payrollPaid } from "@/lib/payroll";
import { employeePayrollBalance, employeePayrollBalanceRows, payrollSettlementRows } from "@/lib/payroll-settlement";
import { printPayrollPaymentReceipt } from "@/lib/payroll-print";
import type { PayrollPayment } from "@/lib/types";

interface Props {
  employeeId: string | null;
  open: boolean;
  onClose: () => void;
}

export function EmployeeFinancialCard({ employeeId, open, onClose }: Props) {
  const { db, allowed } = useApp();
  const [payOpen, setPayOpen] = useState(false);
  const currentYear = Number(localMonthKey().slice(0, 4));
  const [year, setYear] = useState(currentYear);

  const employee = db && employeeId ? db.employees.find((row) => row.id === employeeId) : undefined;
  const yearRows = useMemo(() => {
    if (!db || !employee) return [];
    const todayPeriod = localMonthKey();
    return Array.from({ length: 12 }, (_, index) => {
      const period = `${year}-${String(index + 1).padStart(2, "0")}`;
      const actual = db.payroll_items.find((item) => item.employee_id === employee.id && item.period === period);
      const beforeHire = period < employee.hired_at.slice(0, 7);
      const afterEnd = Boolean(employee.ended_at && period > employee.ended_at.slice(0, 7));
      if (actual) {
        const paid = payrollPaid(db, actual.id);
        return { period, actual, expected: false, eligible: true, paid, remaining: Math.max(0, actual.net - paid) };
      }
      return {
        period,
        actual: undefined,
        expected: period > todayPeriod && !beforeHire && !afterEnd && employee.active,
        eligible: !beforeHire && !afterEnd,
        paid: 0,
        remaining: 0,
      };
    });
  }, [db, employee, year]);

  if (!db || !employee) return <Modal open={open} title="بطاقة الموظف" onClose={onClose}><Empty text="الموظف غير موجود." /></Modal>;
  const currentDb = db;
  const currency = currentDb.settings.currency;
  const balanceRows = employeePayrollBalanceRows(currentDb, employee.id);
  const totalEntitlement = balanceRows.reduce((sum, row) => sum + row.payroll_item.net, 0);
  const totalPaid = balanceRows.reduce((sum, row) => sum + row.paid, 0);
  const totalRemaining = employeePayrollBalance(currentDb, employee.id);
  const outstandingAdvances = currentDb.advances
    .filter((advance) => advance.employee_id === employee.id && !advance.settled)
    .reduce((sum, advance) => sum + advance.amount, 0);
  const payments = currentDb.payroll_payments
    .filter((payment) => payment.employee_id === employee.id)
    .slice()
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at));
  const visiblePayments = payments.filter((payment, index, rows) => {
    const key = payment.settlement_id || payment.id;
    return rows.findIndex((candidate) => (candidate.settlement_id || candidate.id) === key) === index;
  });

  function groupRows(payment: PayrollPayment) {
    return payrollSettlementRows(currentDb, payment);
  }
  function groupVoid(payment: PayrollPayment) {
    return groupRows(payment).every((row) => row.is_void);
  }
  function groupAmount(payment: PayrollPayment) {
    return groupRows(payment).reduce((sum, row) => sum + row.amount, 0);
  }

  return (
    <>
      <Modal open={open} title={`بطاقة الموظف — ${employee.full_name}`} onClose={onClose} extraWide>
        <div className="space-y-5">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="text-sm text-muted-foreground">{employee.job_title || (employee.kind === "teacher" ? "مدرّس" : "موظف")} — {employee.phone || "بدون هاتف"}</div>
            {allowed("payroll.create") && totalRemaining > 0 ? <Button onClick={() => setPayOpen(true)}>دفع مستحقات</Button> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="إجمالي استحقاقات الرواتب" value={money(totalEntitlement, currency)} />
            <Stat label="إجمالي المدفوع" value={money(totalPaid, currency)} tone="success" />
            <Stat label="المتبقي للموظف" value={money(totalRemaining, currency)} tone={totalRemaining > 0 ? "danger" : "success"} />
            <Stat label="السلف غير المسددة" value={money(outstandingAdvances, currency)} tone={outstandingAdvances > 0 ? "danger" : "success"} />
          </div>

          <Panel>
            <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <p><b>الوظيفة:</b> {employee.job_title || (employee.kind === "teacher" ? "مدرّس" : "موظف")}</p>
              <p><b>الراتب الأساسي الحالي:</b> {money(employee.base_salary, currency)}</p>
              <p><b>تاريخ بدء العمل:</b> {dateStr(employee.hired_at)}</p>
              <p><b>الهاتف:</b> {employee.phone || "—"}</p>
              <p><b>الحالة:</b> {employee.active ? "نشط" : "متوقف"}</p>
              {employee.ended_at ? <p><b>تاريخ الانتهاء:</b> {dateStr(employee.ended_at)}</p> : null}
            </div>
            {totalRemaining > 0 ? (
              <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
                <p className="font-bold text-destructive">المبالغ المتبقية للموظف</p>
                <p className="mt-1">{balanceRows.filter((row) => row.remaining > 0).map((row) => `${money(row.remaining, currency)} من شهر ${numericMonthPeriodLabel(row.payroll_item.period)}`).join("، ")}</p>
              </div>
            ) : null}
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">البطاقة الشهرية للرواتب</h3>
            <Select className="w-36" value={String(year)} onChange={(event) => setYear(Number(event.target.value))}>
              {Array.from({ length: 7 }, (_, index) => currentYear - 3 + index).map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </div>
          <Table head={["الشهر", "الأساسي", "إضافات", "حسميات", "خصم سلف", "الصافي", "المدفوع", "المتبقي", "الحالة", ""]}>
            {yearRows.map((row) => {
              const item = row.actual;
              const latestPayment = item
                ? visiblePayments.find((payment) => groupRows(payment).some((entry) => entry.payroll_item_id === item.id) && !groupVoid(payment))
                : undefined;
              return (
                <tr key={row.period} className={!row.eligible ? "opacity-50" : ""}>
                  <Td className="font-semibold">{numericMonthPeriodLabel(row.period)}</Td>
                  <Td>{item ? money(item.base_snapshot, currency) : row.expected ? money(employee.base_salary, currency) : "—"}</Td>
                  <Td>{item ? money(item.bonus, currency) : "—"}</Td>
                  <Td>{item ? money(item.deduction, currency) : "—"}</Td>
                  <Td>{item ? money(item.advance_deducted, currency) : "—"}</Td>
                  <Td>{item ? money(item.net, currency) : row.expected ? money(employee.base_salary, currency) : "—"}</Td>
                  <Td className="text-emerald-700">{item ? money(row.paid, currency) : "—"}</Td>
                  <Td className={row.remaining > 0 ? "text-destructive" : ""}>{item ? money(row.remaining, currency) : "—"}</Td>
                  <Td>{item ? (row.remaining <= 0 ? <Badge tone="success">مدفوع</Badge> : row.paid > 0 ? <Badge tone="primary">جزئي</Badge> : <Badge tone="danger">غير مدفوع</Badge>) : row.expected ? <Badge tone="muted">متوقع فقط</Badge> : row.eligible ? <Badge tone="muted">غير مولّد</Badge> : <Badge tone="muted">خارج الخدمة</Badge>}</Td>
                  <Td>{latestPayment && item ? <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, item, latestPayment)}>🖨️ آخر سند</Button> : null}</Td>
                </tr>
              );
            })}
          </Table>

          <h3 className="text-sm font-bold">سجل سندات صرف الرواتب</h3>
          {visiblePayments.length ? (
            <Table head={["مرجع السند", "المبلغ", "الأشهر", "التاريخ", "الحالة", ""]}>
              {visiblePayments.map((payment) => {
                const rows = groupRows(payment);
                const months = rows.map((entry) => currentDb.payroll_items.find((item) => item.id === entry.payroll_item_id)?.period).filter((period): period is string => Boolean(period)).map(numericMonthPeriodLabel).join("، ");
                const seedItem = currentDb.payroll_items.find((item) => item.id === payment.payroll_item_id);
                const isVoid = groupVoid(payment);
                return (
                  <tr key={payment.settlement_id || payment.id} className={isVoid ? "opacity-60" : ""}>
                    <Td className="font-semibold">{payment.settlement_no || payment.id.slice(0, 8).toUpperCase()}</Td>
                    <Td>{money(groupAmount(payment), currency)}</Td>
                    <Td>{months || "—"}</Td>
                    <Td>{dateStr(payment.paid_at)}</Td>
                    <Td>{isVoid ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</Td>
                    <Td>{seedItem ? <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, seedItem, payment)}>{isVoid ? "🖨️ نسخة تاريخية" : "🖨️ طباعة السند"}</Button> : null}</Td>
                  </tr>
                );
              })}
            </Table>
          ) : <Empty text="لا توجد سندات صرف رواتب لهذا الموظف." />}
        </div>
      </Modal>
      <PayrollSettlementModal employeeId={employee.id} open={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}

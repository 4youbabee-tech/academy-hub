from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_required(source: str, search: str, replacement: str, label: str) -> str:
    if search not in source:
        raise RuntimeError(f"Missing patch target: {label}")
    return source.replace(search, replacement, 1)

format_path = "src/lib/format.ts"
format_src = read(format_path)
format_src = replace_required(
    format_src,
    '''/** Calendar month on this device (YYYY-MM). */
export function localMonthKey(value: string | Date = new Date()): string {
  return localDateKey(value).slice(0, 7);
}
''',
    '''/** Calendar month on this device (YYYY-MM). */
export function localMonthKey(value: string | Date = new Date()): string {
  return localDateKey(value).slice(0, 7);
}

/** Displays a stored YYYY-MM accounting period using numeric month/year only. */
export function numericMonthPeriodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const match = /^(\\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return period;
  return `${Number(match[2])} / ${match[1]}`;
}
''',
    "numeric month period formatter",
)
write(format_path, format_src)

print_path = "src/lib/payroll-print.ts"
print_src = read(print_path)
print_src = replace_required(
    print_src,
    'import { dateStr, money } from "./format";',
    'import { dateStr, money, numericMonthPeriodLabel } from "./format";',
    "payroll print format import",
)
print_src = replace_required(
    print_src,
    '<div class="row"><span>شهر الراتب</span><b>${escapeHtml(item.period)}</b></div>',
    '<div class="row"><span>شهر الراتب</span><b>${escapeHtml(numericMonthPeriodLabel(item.period))}</b></div>',
    "payroll receipt numeric month",
)
write(print_path, print_src)

employees_path = "src/routes/employees.tsx"
employees = read(employees_path)
employees = replace_required(
    employees,
    'import { dateStr, fromMinor, localMonthKey, money, toMinor, today } from "@/lib/format";',
    'import { dateStr, fromMinor, localMonthKey, money, numericMonthPeriodLabel, toMinor, today } from "@/lib/format";',
    "employees format import",
)
employees = replace_required(
    employees,
    '''function monthNow() {
  return localMonthKey();
}
''',
    '''function monthNow() {
  return localMonthKey();
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 21 }, (_, index) => CURRENT_YEAR - 10 + index);

function periodMonth(period: string): number {
  return Number(period.slice(5, 7)) || 1;
}

function periodYear(period: string): number {
  return Number(period.slice(0, 4)) || CURRENT_YEAR;
}

function withPeriodMonth(period: string, month: number): string {
  return `${periodYear(period)}-${String(month).padStart(2, "0")}`;
}

function withPeriodYear(period: string, year: number): string {
  return `${year}-${String(periodMonth(period)).padStart(2, "0")}`;
}
''',
    "numeric payroll period helpers",
)
employees = replace_required(
    employees,
    '''  const [payAmount, setPayAmount] = useState("");
  const [paymentHistoryFor, setPaymentHistoryFor] = useState<PayrollItem | null>(null);
''',
    '''  const [payAmount, setPayAmount] = useState("");
  const [paymentHistoryFor, setPaymentHistoryFor] = useState<PayrollItem | null>(null);
  const [printAfterPayment, setPrintAfterPayment] = useState<{ itemId: string; paymentId: string } | null>(null);
''',
    "post payment print state",
)
employees = replace_required(
    employees,
    '''      const paidItem = payFor;
      recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");
      setPayFor(null);
      setPaymentHistoryFor(paidItem);
      setPayAmount("");
      setError(null);''',
    '''      const paidItem = payFor;
      const paymentId = recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");
      setPayFor(null);
      setPrintAfterPayment({ itemId: paidItem.id, paymentId });
      setPayAmount("");
      setError(null);''',
    "open print confirmation after payroll payment",
)
employees = replace_required(
    employees,
    '    const monthLabel = item.period || "—";',
    '    const monthLabel = numericMonthPeriodLabel(item.period);',
    "full salary receipt numeric month",
)
employees = replace_required(
    employees,
    '''      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_1fr_200px_auto] lg:items-end">
        <Field label="الشهر"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label="بحث"><Input value={payrollQ} onChange={(e) => setPayrollQ(e.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>''',
    '''      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[120px_120px_1fr_200px_auto] lg:items-end">
        <Field label="الشهر">
          <Select value={String(periodMonth(period))} onChange={(e) => setPeriod(withPeriodMonth(period, Number(e.target.value)))}>
            {MONTH_OPTIONS.map((month) => <option key={month} value={month}>{month}</option>)}
          </Select>
        </Field>
        <Field label="السنة">
          <Select value={String(periodYear(period))} onChange={(e) => setPeriod(withPeriodYear(period, Number(e.target.value)))}>
            {!YEAR_OPTIONS.includes(periodYear(period)) ? <option value={periodYear(period)}>{periodYear(period)}</option> : null}
            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
          </Select>
        </Field>
        <Field label="بحث"><Input value={payrollQ} onChange={(e) => setPayrollQ(e.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>''',
    "numeric payroll month and year controls",
)
employees = replace_required(
    employees,
    '''                  <Button variant="ghost" onClick={() => { setPaymentHistoryFor(i); setError(null); }}>الدفعات</Button>''',
    '''                  {(() => {
                    const latestPayment = currentDb.payroll_payments
                      .filter((payment) => payment.payroll_item_id === i.id && !payment.is_void)
                      .slice()
                      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))[0];
                    return latestPayment ? (
                      <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, i, latestPayment)}>
                        🖨️ آخر سند
                      </Button>
                    ) : null;
                  })()}
                  <Button variant="ghost" onClick={() => { setPaymentHistoryFor(i); setError(null); }}>🧾 كل السندات</Button>''',
    "visible latest receipt print action",
)
employees = replace_required(
    employees,
    '<b>{currentDb.employees.find((item) => item.id === paymentHistoryFor.employee_id)?.full_name ?? "—"}</b> — {paymentHistoryFor.period}',
    '<b>{currentDb.employees.find((item) => item.id === paymentHistoryFor.employee_id)?.full_name ?? "—"}</b> — {numericMonthPeriodLabel(paymentHistoryFor.period)}',
    "history modal numeric period",
)
employees = replace_required(
    employees,
    '''{currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).length ? (
              <Table head={["التاريخ", "المبلغ", "ملاحظة", "الحالة", ""]}>
                {currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((payment) => (
                  <tr key={payment.id} className={payment.is_void ? "opacity-60" : ""}>
                    <Td>{dateStr(payment.paid_at)}</Td><Td className="tabular-nums">{money(payment.amount, cur)}</Td><Td>{payment.note || "—"}</Td>
                    <Td>{payment.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>
                    <Td><div className="flex flex-wrap gap-1">{!payment.is_void ? <Button variant="ghost" onClick={() => printPayrollPaymentReceipt(currentDb, paymentHistoryFor, payment)}>🖨️ طباعة</Button> : null}{!payment.is_void && canVoidPayroll ? <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button> : null}</div></Td>
                  </tr>
                ))}
              </Table>
            ) : <Empty text="لا توجد دفعات راتب مسجلة بعد." />}''',
    '''{currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).length ? (
              <div className="space-y-2">
                {currentDb.payroll_payments
                  .filter((item) => item.payroll_item_id === paymentHistoryFor.id)
                  .slice()
                  .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
                  .map((payment) => (
                    <div key={payment.id} className={`rounded-xl border p-3 ${payment.is_void ? "opacity-60" : "bg-card"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 text-sm">
                          <p><b>التاريخ:</b> {dateStr(payment.paid_at)}</p>
                          <p><b>المبلغ:</b> <span className="tabular-nums">{money(payment.amount, cur)}</span></p>
                          <p><b>الملاحظة:</b> {payment.note || "—"}</p>
                          <p>{payment.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!payment.is_void ? (
                            <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, paymentHistoryFor, payment)}>
                              🖨️ طباعة السند
                            </Button>
                          ) : null}
                          {!payment.is_void && canVoidPayroll ? (
                            <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : <Empty text="لا توجد دفعات راتب مسجلة بعد." />}''',
    "mobile friendly payroll receipt history",
)
employees = replace_required(
    employees,
    '<p><b>الشهر:</b> {payFor.period}</p>',
    '<p><b>الشهر:</b> {numericMonthPeriodLabel(payFor.period)}</p>',
    "payment modal numeric period",
)
employees = replace_required(
    employees,
    '''  const totalPaidToEmployees = paidNet + advancesThisPeriod;

  return (''',
    '''  const totalPaidToEmployees = paidNet + advancesThisPeriod;
  const justPaidItem = printAfterPayment
    ? currentDb.payroll_items.find((item) => item.id === printAfterPayment.itemId)
    : undefined;
  const justPaidPayment = printAfterPayment
    ? currentDb.payroll_payments.find((payment) => payment.id === printAfterPayment.paymentId && !payment.is_void)
    : undefined;

  return (''',
    "post payment receipt lookup",
)
employees = replace_required(
    employees,
    '''      <Modal open={!!payFor} title="دفع الراتب" onClose={() => { setPayFor(null); setError(null); }}>''',
    '''      <Modal open={!!printAfterPayment} title="تم تسجيل دفعة الراتب" onClose={() => setPrintAfterPayment(null)}>
        {justPaidItem && justPaidPayment ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-success/5 p-4 text-sm">
              <p className="font-bold text-success">تم حفظ الدفعة والسند بنجاح.</p>
              <p className="mt-2"><b>الشهر:</b> {numericMonthPeriodLabel(justPaidItem.period)}</p>
              <p><b>قيمة هذه الدفعة:</b> {money(justPaidPayment.amount, cur)}</p>
              <p><b>المتبقي بعدها:</b> {money(justPaidPayment.remaining_after_snapshot ?? payrollRemaining(currentDb, justPaidItem.id), cur)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => printPayrollPaymentReceipt(currentDb, justPaidItem, justPaidPayment)}>🖨️ طباعة السند الآن</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPaymentHistoryFor(justPaidItem);
                  setPrintAfterPayment(null);
                }}
              >
                🧾 عرض كل السندات
              </Button>
            </div>
          </div>
        ) : <Empty text="تم تسجيل الدفعة، لكن تعذر تحميل السند فوراً. افتح كل السندات لإعادة طباعته." />}
      </Modal>

      <Modal open={!!payFor} title="دفع الراتب" onClose={() => { setPayFor(null); setError(null); }}>''',
    "immediate print modal",
)
write(employees_path, employees)

print("Applied payroll numeric-month and receipt-print UX hotfix.")

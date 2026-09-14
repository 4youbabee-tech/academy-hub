import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

const formatPath = "src/lib/format.ts";
let format = read(formatPath);
format = replaceRequired(
  format,
  `/** Calendar month on this device (YYYY-MM). */\nexport function localMonthKey(value: string | Date = new Date()): string {\n  return localDateKey(value).slice(0, 7);\n}\n`,
  `/** Calendar month on this device (YYYY-MM). */\nexport function localMonthKey(value: string | Date = new Date()): string {\n  return localDateKey(value).slice(0, 7);\n}\n\n/** Displays a stored YYYY-MM accounting period using numeric month/year only. */\nexport function numericMonthPeriodLabel(period: string | null | undefined): string {\n  if (!period) return "—";\n  const match = /^(\\d{4})-(0[1-9]|1[0-2])$/.exec(period);\n  if (!match) return period;\n  return \\`${Number(match[2])} / ${match[1]}\\`;\n}\n`,
  "numeric month period formatter",
);
write(formatPath, format);

const payrollPrintPath = "src/lib/payroll-print.ts";
let payrollPrint = read(payrollPrintPath);
payrollPrint = replaceRequired(
  payrollPrint,
  `import { dateStr, money } from "./format";`,
  `import { dateStr, money, numericMonthPeriodLabel } from "./format";`,
  "payroll print format import",
);
payrollPrint = replaceRequired(
  payrollPrint,
  `<div class="row"><span>شهر الراتب</span><b>\${escapeHtml(item.period)}</b></div>`,
  `<div class="row"><span>شهر الراتب</span><b>\${escapeHtml(numericMonthPeriodLabel(item.period))}</b></div>`,
  "payroll receipt numeric month",
);
write(payrollPrintPath, payrollPrint);

const employeesPath = "src/routes/employees.tsx";
let employees = read(employeesPath);
employees = replaceRequired(
  employees,
  `import { dateStr, fromMinor, localMonthKey, money, toMinor, today } from "@/lib/format";`,
  `import { dateStr, fromMinor, localMonthKey, money, numericMonthPeriodLabel, toMinor, today } from "@/lib/format";`,
  "employees format import",
);
employees = replaceRequired(
  employees,
  `function monthNow() {\n  return localMonthKey();\n}\n`,
  `function monthNow() {\n  return localMonthKey();\n}\n\nconst MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);\nconst CURRENT_YEAR = new Date().getFullYear();\nconst YEAR_OPTIONS = Array.from({ length: 21 }, (_, index) => CURRENT_YEAR - 10 + index);\n\nfunction periodMonth(period: string): number {\n  return Number(period.slice(5, 7)) || 1;\n}\n\nfunction periodYear(period: string): number {\n  return Number(period.slice(0, 4)) || CURRENT_YEAR;\n}\n\nfunction withPeriodMonth(period: string, month: number): string {\n  return \\`${periodYear(period)}-${String(month).padStart(2, "0")}\\`;\n}\n\nfunction withPeriodYear(period: string, year: number): string {\n  return \\`${year}-${String(periodMonth(period)).padStart(2, "0")}\\`;\n}\n`,
  "numeric payroll period helpers",
);
employees = replaceRequired(
  employees,
  `  const [payAmount, setPayAmount] = useState("");\n  const [paymentHistoryFor, setPaymentHistoryFor] = useState<PayrollItem | null>(null);\n`,
  `  const [payAmount, setPayAmount] = useState("");\n  const [paymentHistoryFor, setPaymentHistoryFor] = useState<PayrollItem | null>(null);\n  const [printAfterPayment, setPrintAfterPayment] = useState<{ itemId: string; paymentId: string } | null>(null);\n`,
  "post payment print state",
);
employees = replaceRequired(
  employees,
  `      const paidItem = payFor;\n      recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");\n      setPayFor(null);\n      setPaymentHistoryFor(paidItem);\n      setPayAmount("");\n      setError(null);`,
  `      const paidItem = payFor;\n      const paymentId = recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");\n      setPayFor(null);\n      setPrintAfterPayment({ itemId: paidItem.id, paymentId });\n      setPayAmount("");\n      setError(null);`,
  "open print confirmation after payroll payment",
);
employees = replaceRequired(
  employees,
  `    const monthLabel = item.period || "—";`,
  `    const monthLabel = numericMonthPeriodLabel(item.period);`,
  "full salary receipt numeric month",
);
employees = replaceRequired(
  employees,
  `      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_1fr_200px_auto] lg:items-end">\n        <Field label="الشهر"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>\n        <Field label="بحث"><Input value={payrollQ} onChange={(e) => setPayrollQ(e.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>`,
  `      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[120px_120px_1fr_200px_auto] lg:items-end">\n        <Field label="الشهر">\n          <Select value={String(periodMonth(period))} onChange={(e) => setPeriod(withPeriodMonth(period, Number(e.target.value)))}>\n            {MONTH_OPTIONS.map((month) => <option key={month} value={month}>{month}</option>)}\n          </Select>\n        </Field>\n        <Field label="السنة">\n          <Select value={String(periodYear(period))} onChange={(e) => setPeriod(withPeriodYear(period, Number(e.target.value)))}>\n            {!YEAR_OPTIONS.includes(periodYear(period)) ? <option value={periodYear(period)}>{periodYear(period)}</option> : null}\n            {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}\n          </Select>\n        </Field>\n        <Field label="بحث"><Input value={payrollQ} onChange={(e) => setPayrollQ(e.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>`,
  "numeric payroll month and year controls",
);
employees = replaceRequired(
  employees,
  `                  <Button variant="ghost" onClick={() => { setPaymentHistoryFor(i); setError(null); }}>الدفعات</Button>`,
  `                  {(() => {\n                    const latestPayment = currentDb.payroll_payments\n                      .filter((payment) => payment.payroll_item_id === i.id && !payment.is_void)\n                      .slice()\n                      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at))[0];\n                    return latestPayment ? (\n                      <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, i, latestPayment)}>\n                        🖨️ آخر سند\n                      </Button>\n                    ) : null;\n                  })()}\n                  <Button variant="ghost" onClick={() => { setPaymentHistoryFor(i); setError(null); }}>🧾 كل السندات</Button>`,
  "visible latest receipt print action",
);
employees = replaceRequired(
  employees,
  `<b>{currentDb.employees.find((item) => item.id === paymentHistoryFor.employee_id)?.full_name ?? "—"}</b> — {paymentHistoryFor.period}`,
  `<b>{currentDb.employees.find((item) => item.id === paymentHistoryFor.employee_id)?.full_name ?? "—"}</b> — {numericMonthPeriodLabel(paymentHistoryFor.period)}`,
  "history modal numeric period",
);
employees = replaceRequired(
  employees,
  `{currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).length ? (\n              <Table head={["التاريخ", "المبلغ", "ملاحظة", "الحالة", ""]}>\n                {currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((payment) => (\n                  <tr key={payment.id} className={payment.is_void ? "opacity-60" : ""}>\n                    <Td>{dateStr(payment.paid_at)}</Td><Td className="tabular-nums">{money(payment.amount, cur)}</Td><Td>{payment.note || "—"}</Td>\n                    <Td>{payment.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>\n                    <Td><div className="flex flex-wrap gap-1">{!payment.is_void ? <Button variant="ghost" onClick={() => printPayrollPaymentReceipt(currentDb, paymentHistoryFor, payment)}>🖨️ طباعة</Button> : null}{!payment.is_void && canVoidPayroll ? <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button> : null}</div></Td>\n                  </tr>\n                ))}\n              </Table>\n            ) : <Empty text="لا توجد دفعات راتب مسجلة بعد." />}`,
  `{currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).length ? (\n              <div className="space-y-2">\n                {currentDb.payroll_payments\n                  .filter((item) => item.payroll_item_id === paymentHistoryFor.id)\n                  .slice()\n                  .sort((a, b) => b.paid_at.localeCompare(a.paid_at))\n                  .map((payment) => (\n                    <div key={payment.id} className={\\`rounded-xl border p-3 ${payment.is_void ? "opacity-60" : "bg-card"}\\`}>\n                      <div className="flex flex-wrap items-start justify-between gap-3">\n                        <div className="space-y-1 text-sm">\n                          <p><b>التاريخ:</b> {dateStr(payment.paid_at)}</p>\n                          <p><b>المبلغ:</b> <span className="tabular-nums">{money(payment.amount, cur)}</span></p>\n                          <p><b>الملاحظة:</b> {payment.note || "—"}</p>\n                          <p>{payment.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</p>\n                        </div>\n                        <div className="flex flex-wrap gap-2">\n                          {!payment.is_void ? (\n                            <Button variant="secondary" onClick={() => printPayrollPaymentReceipt(currentDb, paymentHistoryFor, payment)}>\n                              🖨️ طباعة السند\n                            </Button>\n                          ) : null}\n                          {!payment.is_void && canVoidPayroll ? (\n                            <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button>\n                          ) : null}\n                        </div>\n                      </div>\n                    </div>\n                  ))}\n                }\n              </div>\n            ) : <Empty text="لا توجد دفعات راتب مسجلة بعد." />}`,
  "mobile friendly payroll receipt history",
);
employees = replaceRequired(
  employees,
  `<p><b>الشهر:</b> {payFor.period}</p>`,
  `<p><b>الشهر:</b> {numericMonthPeriodLabel(payFor.period)}</p>`,
  "payment modal numeric period",
);
employees = replaceRequired(
  employees,
  `  const totalPaidToEmployees = paidNet + advancesThisPeriod;\n\n  return (`,
  `  const totalPaidToEmployees = paidNet + advancesThisPeriod;\n  const justPaidItem = printAfterPayment\n    ? currentDb.payroll_items.find((item) => item.id === printAfterPayment.itemId)\n    : undefined;\n  const justPaidPayment = printAfterPayment\n    ? currentDb.payroll_payments.find((payment) => payment.id === printAfterPayment.paymentId && !payment.is_void)\n    : undefined;\n\n  return (`,
  "post payment receipt lookup",
);
employees = replaceRequired(
  employees,
  `      <Modal open={!!payFor} title="دفع الراتب" onClose={() => { setPayFor(null); setError(null); }}>`,
  `      <Modal open={!!printAfterPayment} title="تم تسجيل دفعة الراتب" onClose={() => setPrintAfterPayment(null)}>\n        {justPaidItem && justPaidPayment ? (\n          <div className="space-y-4">\n            <div className="rounded-xl border bg-success/5 p-4 text-sm">\n              <p className="font-bold text-success">تم حفظ الدفعة والسند بنجاح.</p>\n              <p className="mt-2"><b>الشهر:</b> {numericMonthPeriodLabel(justPaidItem.period)}</p>\n              <p><b>قيمة هذه الدفعة:</b> {money(justPaidPayment.amount, cur)}</p>\n              <p><b>المتبقي بعدها:</b> {money(justPaidPayment.remaining_after_snapshot ?? payrollRemaining(currentDb, justPaidItem.id), cur)}</p>\n            </div>\n            <div className="grid gap-2 sm:grid-cols-2">\n              <Button onClick={() => printPayrollPaymentReceipt(currentDb, justPaidItem, justPaidPayment)}>🖨️ طباعة السند الآن</Button>\n              <Button\n                variant="secondary"\n                onClick={() => {\n                  setPaymentHistoryFor(justPaidItem);\n                  setPrintAfterPayment(null);\n                }}\n              >\n                🧾 عرض كل السندات\n              </Button>\n            </div>\n          </div>\n        ) : <Empty text="تم تسجيل الدفعة، لكن تعذر تحميل السند فوراً. افتح كل السندات لإعادة طباعته." />}\n      </Modal>\n\n      <Modal open={!!payFor} title="دفع الراتب" onClose={() => { setPayFor(null); setError(null); }}>`,
  "immediate print modal",
);
write(employeesPath, employees);

console.log("Applied payroll numeric-month and receipt-print UX hotfix.");

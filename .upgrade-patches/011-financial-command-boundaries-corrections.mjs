import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
}
function replaceOnce(source, from, to, label) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing expected block: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

edit('src/lib/db.ts', (source) => {
  source = source.replace(
    'throw new Error("السجلات المالية لا تُعدّل أو تُحذف مباشرة. استخدم العملية المالية المخصصة مع سجل التدقيق.");',
    'throw new Error("السجلات المالية لا تُنشأ أو تُعدّل أو تُحذف مباشرة. استخدم العملية المالية المخصصة مع سجل التدقيق.");',
  );
  source = replaceOnce(source,
    '): ID {\n  const record = { ...baseFields(), ...data } as DB[K][number];',
    '): ID {\n  assertGenericFinancialMutationAllowed(key);\n  const record = { ...baseFields(), ...data } as DB[K][number];',
    'generic insert financial guard');
  return source;
});

edit('src/lib/finance.ts', (source) => {
  source = source.replace('  if (amount === 0) return false;\n\n  db.installments.push({', '  db.installments.push({');
  source = source.replace('    status: "due",\n    kind: "monthly",', '    status: amount === 0 ? "paid" : "due",\n    kind: "monthly",');
  const marker = 'export function voidExpense(expenseId: ID, actor: Actor, reason: string): void {';
  const commands = `export function recordExpense(\n  args: { category: string; amount: number; date: string; note?: string },\n  actor: Actor,\n): ID {\n  const category = args.category.trim();\n  if (!category) throw new Error("بند المصروف إلزامي");\n  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("مبلغ المصروف غير صالح");\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(args.date)) throw new Error("تاريخ المصروف غير صالح");\n  let created: ID = "";\n  transact((db) => {\n    const expense = {\n      ...baseFields(), category, amount: args.amount, date: args.date, note: args.note?.trim() ?? "",\n      user_id: actor.id, is_void: false,\n    };\n    db.expenses.push(expense);\n    created = expense.id;\n    audit(db, actor, "expenses", expense.id, "create", \`مصروف \${category} بقيمة \${args.amount / 100}\`);\n  });\n  return created;\n}\n\nexport function recordIncome(\n  args: { source: string; amount: number; date: string; note?: string },\n  actor: Actor,\n): ID {\n  const source = args.source.trim();\n  if (!source) throw new Error("مصدر المدخول إلزامي");\n  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("مبلغ المدخول غير صالح");\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(args.date)) throw new Error("تاريخ المدخول غير صالح");\n  let created: ID = "";\n  transact((db) => {\n    const income = {\n      ...baseFields(), source, amount: args.amount, date: args.date, note: args.note?.trim() ?? "",\n      user_id: actor.id, is_void: false,\n    };\n    db.incomes.push(income);\n    created = income.id;\n    audit(db, actor, "incomes", income.id, "create", \`مدخول \${source} بقيمة \${args.amount / 100}\`);\n  });\n  return created;\n}\n\n`;
  return replaceOnce(source, marker, commands + marker, 'expense and income commands');
});

edit('src/routes/expenses.tsx', (source) => {
  source = source.replace('import { insert } from "@/lib/db";\n', '');
  source = source.replace('import { profitAndLoss, voidExpense, voidIncome } from "@/lib/finance";', 'import { profitAndLoss, recordExpense, recordIncome, voidExpense, voidIncome } from "@/lib/finance";');
  const oldSave = `    if (tab === "expense") {\n      insert(\n        "expenses",\n        { category: form.category.trim(), amount, date: form.date, note: form.note, user_id: actor.id, is_void: false },\n        actor,\n        \`مصروف \${form.category}\`,\n      );\n    } else {\n      insert(\n        "incomes",\n        { source: form.category.trim(), amount, date: form.date, note: form.note, user_id: actor.id, is_void: false },\n        actor,\n        \`مدخول \${form.category}\`,\n      );\n    }\n\n    setOpen(false);\n    setError(null);`;
  const newSave = `    try {\n      if (tab === "expense") {\n        recordExpense({ category: form.category, amount, date: form.date, note: form.note }, actor);\n      } else {\n        recordIncome({ source: form.category, amount, date: form.date, note: form.note }, actor);\n      }\n      setOpen(false);\n      setError(null);\n    } catch (caught) {\n      setError((caught as Error).message);\n    }`;
  return replaceOnce(source, oldSave, newSave, 'specialized expense/income creation');
});

edit('src/routes/students.$id.tsx', (source) => {
  source = source.replace('import { createFileRoute, Link } from "@tanstack/react-router";', 'import { createFileRoute, Link } from "@tanstack/react-router";\nimport { useState } from "react";');
  source = source.replace('import { Badge, Button, Empty, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";', 'import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Stat, Table, Td } from "@/components/ui-kit";');
  source = source.replace('import { invoiceFinancials, studentBalance, studentMonthlyLedger } from "@/lib/finance";', 'import { invoiceFinancials, studentBalance, studentMonthlyLedger, voidInstallment } from "@/lib/finance";');
  source = replaceOnce(source,
    '  const { db, allowed } = useApp();\n',
    '  const { db, actor, allowed } = useApp();\n  const [voidMonthlyId, setVoidMonthlyId] = useState<string | null>(null);\n  const [voidReason, setVoidReason] = useState("");\n  const [voidError, setVoidError] = useState<string | null>(null);\n',
    'student void state');
  source = replaceOnce(source,
    '  const canViewFinance = allowed("finance.view");\n',
    '  const canViewFinance = allowed("finance.view");\n  const canVoidFinance = allowed("finance.void");\n',
    'student void permission');
  source = replaceOnce(source,
    '  function courseAndClassForInvoice(invoiceId: string): string {',
    `  function confirmVoidMonthly() {\n    if (!voidMonthlyId) return;\n    try {\n      voidInstallment(voidMonthlyId, voidReason, actor);\n      setVoidMonthlyId(null);\n      setVoidReason("");\n      setVoidError(null);\n    } catch (error) {\n      setVoidError((error as Error).message);\n    }\n  }\n\n  function courseAndClassForInvoice(invoiceId: string): string {`,
    'student void handler');
  source = source.replace('<Table head={["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة"]}>', '<Table head={["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة", ""]}>');
  source = replaceOnce(source,
    '                <Td>\n                  {row.status === "paid" ? <Badge tone="success">مدفوع</Badge> : row.status === "partial" ? <Badge tone="warning">جزئي</Badge> : <Badge tone="danger">غير مدفوع</Badge>}\n                </Td>\n              </tr>',
    `                <Td>\n                  {row.status === "paid" ? <Badge tone="success">مدفوع</Badge> : row.status === "partial" ? <Badge tone="warning">جزئي</Badge> : <Badge tone="danger">غير مدفوع</Badge>}\n                </Td>\n                <Td>\n                  {canVoidFinance && row.paid === 0 && row.due > 0 ? (\n                    <Button variant="ghost" onClick={() => { setVoidMonthlyId(row.installment_id); setVoidReason(""); setVoidError(null); }}>إلغاء الاستحقاق</Button>\n                  ) : null}\n                </Td>\n              </tr>`,
    'student monthly void action');
  const endMarker = '      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">كشف الحساب المالي</h2> : null}\n';
  const modal = `      <Modal open={!!voidMonthlyId} title="إلغاء استحقاق شهري" onClose={() => setVoidMonthlyId(null)}>\n        <div className="space-y-3">\n          <p className="rounded-lg bg-muted p-3 text-sm">سيبقى الاستحقاق محفوظاً بحالة ملغاة في السجل ولن يدخل في رصيد الطالب. إذا كان عليه أي قبض، سيمنع النظام الإلغاء.</p>\n          <Field label="سبب الإلغاء"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>\n          {voidError ? <p className="text-sm font-semibold text-destructive">{voidError}</p> : null}\n          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setVoidMonthlyId(null)}>تراجع</Button><Button variant="danger" onClick={confirmVoidMonthly}>تأكيد الإلغاء</Button></div>\n        </div>\n      </Modal>\n\n`;
  return replaceOnce(source, endMarker, modal + endMarker, 'student monthly void modal');
});

edit('src/routes/employees.tsx', (source) => {
  source = source.replace('import { generatePayroll as createPayroll, payrollPaid, payrollRemaining, recordAdvance, recordPayrollPayment } from "@/lib/payroll";', 'import { generatePayroll as createPayroll, payrollPaid, payrollRemaining, recordAdvance, recordPayrollPayment, voidPayrollPayment } from "@/lib/payroll";');
  source = replaceOnce(source,
    '  const [payAmount, setPayAmount] = useState("");\n',
    '  const [payAmount, setPayAmount] = useState("");\n  const [paymentHistoryFor, setPaymentHistoryFor] = useState<PayrollItem | null>(null);\n  const [voidPayrollPaymentId, setVoidPayrollPaymentId] = useState<string | null>(null);\n  const [voidPayrollReason, setVoidPayrollReason] = useState("");\n',
    'payroll correction state');
  source = replaceOnce(source,
    '  const canEdit = allowed("payroll.create");\n',
    '  const canEdit = allowed("payroll.create");\n  const canVoidPayroll = allowed("payroll.void");\n',
    'payroll void permission');
  source = replaceOnce(source,
    '  function printSalaryReceipt(item: PayrollItem) {',
    `  function confirmVoidPayrollPayment() {\n    if (!voidPayrollPaymentId) return;\n    try {\n      voidPayrollPayment(voidPayrollPaymentId, voidPayrollReason, actor);\n      setVoidPayrollPaymentId(null);\n      setVoidPayrollReason("");\n      setError(null);\n    } catch (caught) {\n      setError((caught as Error).message);\n    }\n  }\n\n  function printSalaryReceipt(item: PayrollItem) {`,
    'payroll void handler');
  source = replaceOnce(source,
    '                  {i.status === "paid" ? (\n                    <Button variant="ghost" onClick={() => printSalaryReceipt(i)}>\n                      🖨️ طباعة سند\n                    </Button>\n                  ) : null}',
    `                  <Button variant="ghost" onClick={() => { setPaymentHistoryFor(i); setError(null); }}>الدفعات</Button>\n                  {i.status === "paid" ? (\n                    <Button variant="ghost" onClick={() => printSalaryReceipt(i)}>\n                      🖨️ طباعة سند\n                    </Button>\n                  ) : null}`,
    'payroll payments button');
  const finalModalMarker = '      <Modal open={!!payFor} title="دفع الراتب"';
  const paymentModals = `      <Modal open={!!paymentHistoryFor} title="دفعات الراتب" onClose={() => { setPaymentHistoryFor(null); setError(null); }} wide>\n        {paymentHistoryFor ? (\n          <div className="space-y-3">\n            <div className="rounded-lg bg-muted p-3 text-sm">\n              <b>{currentDb.employees.find((item) => item.id === paymentHistoryFor.employee_id)?.full_name ?? "—"}</b> — {paymentHistoryFor.period}\n            </div>\n            {currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).length ? (\n              <Table head={["التاريخ", "المبلغ", "ملاحظة", "الحالة", ""]}>\n                {currentDb.payroll_payments.filter((item) => item.payroll_item_id === paymentHistoryFor.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((payment) => (\n                  <tr key={payment.id} className={payment.is_void ? "opacity-60" : ""}>\n                    <Td>{dateStr(payment.paid_at)}</Td><Td className="tabular-nums">{money(payment.amount, cur)}</Td><Td>{payment.note || "—"}</Td>\n                    <Td>{payment.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>\n                    <Td>{!payment.is_void && canVoidPayroll ? <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button> : null}</Td>\n                  </tr>\n                ))}\n              </Table>\n            ) : <Empty text="لا توجد دفعات راتب مسجلة بعد." />}\n            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}\n          </div>\n        ) : null}\n      </Modal>\n\n      <Modal open={!!voidPayrollPaymentId} title="إلغاء دفعة راتب" onClose={() => setVoidPayrollPaymentId(null)}>\n        <div className="space-y-3">\n          <p className="rounded-lg bg-muted p-3 text-sm">الإلغاء لا يحذف الدفعة؛ تبقى محفوظة بالسجل ويُعاد احتساب الرصيد تلقائياً.</p>\n          <Field label="سبب الإلغاء"><Input value={voidPayrollReason} onChange={(e) => setVoidPayrollReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>\n          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}\n          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setVoidPayrollPaymentId(null)}>تراجع</Button><Button variant="danger" onClick={confirmVoidPayrollPayment}>تأكيد الإلغاء</Button></div>\n        </div>\n      </Modal>\n\n`;
  return replaceOnce(source, finalModalMarker, paymentModals + finalModalMarker, 'payroll correction modals');
});

edit('tests/domain-harness.ts', (source) => {
  source = source.replace('  profitAndLoss,\n  recordPayment,', '  profitAndLoss,\n  recordExpense,\n  recordIncome,\n  recordPayment,');
  const oldExpenseInsert = `const expenseId = insert("expenses", {\n  category: "كهرباء", amount: 5_000, date: "2026-08-10", note: "اختبار", user_id: ownerActor.id, is_void: false,\n}, ownerActor, "مصروف");`;
  const newExpenseInsert = `assert.throws(() => insert("expenses", {\n  category: "ممنوع", amount: 100, date: "2026-08-10", note: "", user_id: ownerActor.id, is_void: false,\n}, ownerActor, "إنشاء مباشر"), /لا تُنشأ أو تُعدّل أو تُحذف مباشرة/);\nconst expenseId = recordExpense({ category: "كهرباء", amount: 5_000, date: "2026-08-10", note: "اختبار" }, ownerActor);`;
  source = replaceOnce(source, oldExpenseInsert, newExpenseInsert, 'domain expense command');
  const oldIncomeInsert = `const incomeId = insert("incomes", {\n  source: "دخل تجريبي", amount: 7_000, date: "2026-08-10", note: "اختبار", user_id: ownerActor.id, is_void: false,\n}, ownerActor, "مدخول");`;
  const newIncomeInsert = `const incomeId = recordIncome({ source: "دخل تجريبي", amount: 7_000, date: "2026-08-10", note: "اختبار" }, ownerActor);`;
  return replaceOnce(source.replace(oldExpenseInsert, newExpenseInsert), oldIncomeInsert, newIncomeInsert, 'domain income command');
});

edit('tests/monthly-financial-harness.ts', (source) => {
  const marker = 'console.log("Academy Hub monthly billing + partial payroll scenarios: PASS");\n';
  const zeroTest = `const zeroDb = emptyDb();\nzeroDb.users.push({ ...baseFields(), id: actor.id, username: "owner-zero", full_name: actor.name, password_hash: "x", role: "owner", is_active: true });\nzeroDb.students.push({ ...baseFields(), id: "student-zero", code: "ST-Z", full_name: "طالب خصم كامل", birth_date: null, gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "", address: "", education_level: null, status: "active", archived_at: null, notes: "" });\nzeroDb.courses.push({ ...baseFields(), id: "course-zero", name: "عام مجاني", code: "ZERO", level: "", hours: 1, default_price: 10_000, active: true });\nzeroDb.classes.push({ ...baseFields(), id: "class-zero", name: "صف مجاني", course_id: "course-zero", teacher_id: null, term: "", capacity: 10, start_date: today(), end_date: today(), schedule: [], status: "running" });\nreplaceDb(zeroDb);\ncreateMonthlyEnrollmentWithInvoice({ student_id: "student-zero", class_id: "class-zero", monthly_price: 10_000, discount: 10_000, discount_title: "خصم كامل", start_period: currentPeriod }, actor);\nconst zeroCurrent = snapshot()!;\nassert.deepEqual(studentMonthlyLedger(zeroCurrent, "student-zero").map((row) => [row.period, row.amount, row.status]), [[currentPeriod, 0, "paid"]], "fully discounted student must still have a processed monthly row");\n\n`;
  return replaceOnce(source, marker, zeroTest + marker, 'zero monthly charge test');
});

console.log('Academy strict financial command boundaries + correction UIs transform complete');

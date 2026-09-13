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

edit('src/lib/finance.ts', (source) => {
  const oldExpense = `export function voidExpense(expenseId: ID, actor: Actor, reason = "إلغاء المصروف"): void {\n  transact((db) => {\n    const expense = db.expenses.find((item) => item.id === expenseId);\n    if (!expense) throw new Error("المصروف غير موجود");\n    if (expense.is_void) throw new Error("المصروف ملغى مسبقًا");\n    if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");\n    expense.is_void = true;\n    expense.updated_at = new Date().toISOString();\n    audit(db, actor, "expenses", expense.id, "void", \`${'${'}reason.trim()} — ${'${'}expense.category} بقيمة ${'${'}expense.amount / 100}\`);\n  });\n}`;
  const newExpense = `export function voidExpense(expenseId: ID, actor: Actor, reason: string): void {\n  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");\n  transact((db) => {\n    const expense = db.expenses.find((item) => item.id === expenseId);\n    if (!expense) throw new Error("المصروف غير موجود");\n    if (expense.is_void) throw new Error("المصروف ملغى مسبقًا");\n    expense.is_void = true;\n    expense.updated_at = new Date().toISOString();\n    audit(db, actor, "expenses", expense.id, "void", \`${'${'}reason.trim()} — ${'${'}expense.category} بقيمة ${'${'}expense.amount / 100}\`);\n  });\n}\n\nexport function voidIncome(incomeId: ID, actor: Actor, reason: string): void {\n  if (!reason.trim()) throw new Error("سبب الإلغاء إلزامي");\n  transact((db) => {\n    const income = db.incomes.find((item) => item.id === incomeId);\n    if (!income) throw new Error("المدخول غير موجود");\n    if (income.is_void) throw new Error("المدخول ملغى مسبقًا");\n    income.is_void = true;\n    income.updated_at = new Date().toISOString();\n    audit(db, actor, "incomes", income.id, "void", \`${'${'}reason.trim()} — ${'${'}income.source} بقيمة ${'${'}income.amount / 100}\`);\n  });\n}`;
  return replaceOnce(source, oldExpense, newExpense, 'financial void functions');
});

edit('src/routes/expenses.tsx', (source) => {
  source = source.replace('import { payrollItemCost, voidExpense } from "@/lib/finance";', 'import { profitAndLoss, voidExpense, voidIncome } from "@/lib/finance";');
  source = replaceOnce(source,
    '  const [voidExpenseId, setVoidExpenseId] = useState<string | null>(null);\n  const [q, setQ] = useState("");\n',
    '  const [voidExpenseId, setVoidExpenseId] = useState<string | null>(null);\n  const [voidIncomeId, setVoidIncomeId] = useState<string | null>(null);\n  const [voidReason, setVoidReason] = useState("");\n  const [q, setQ] = useState("");\n',
    'void states');
  source = source.replace('        .filter((income) => !income.is_void)\n        .filter((income)', '        .filter((income)');
  source = replaceOnce(source,
    '  const canEdit = allowed("expenses.create");\n  const cur = currentDb.settings.currency;\n  const expenseToVoid = voidExpenseId ? currentDb.expenses.find((e) => e.id === voidExpenseId) ?? null : null;\n',
    '  const canEdit = allowed("expenses.create");\n  const canVoid = allowed("expenses.void");\n  const cur = currentDb.settings.currency;\n  const expenseToVoid = voidExpenseId ? currentDb.expenses.find((e) => e.id === voidExpenseId) ?? null : null;\n  const incomeToVoid = voidIncomeId ? currentDb.incomes.find((e) => e.id === voidIncomeId) ?? null : null;\n',
    'void permissions');
  source = replaceOnce(source,
    '      voidExpense(expenseToVoid.id, actor);\n      setVoidExpenseId(null);\n',
    '      voidExpense(expenseToVoid.id, actor, voidReason);\n      setVoidExpenseId(null);\n      setVoidReason("");\n',
    'expense void reason');
  source = replaceOnce(source,
    '  const totalOperatingExpenses = currentDb.expenses.filter((e) => !e.is_void).reduce((s, e) => s + e.amount, 0);\n  const totalPaidPayroll = currentDb.payroll_items\n    .filter((p) => p.status === "paid")\n    .reduce((sum, item) => sum + payrollItemCost(item), 0);\n',
    `  function confirmVoidIncome() {\n    if (!incomeToVoid) return;\n    try {\n      voidIncome(incomeToVoid.id, actor, voidReason);\n      setVoidIncomeId(null);\n      setVoidReason("");\n      setError(null);\n    } catch (caught) {\n      setError((caught as Error).message);\n    }\n  }\n\n  const totalOperatingExpenses = currentDb.expenses.filter((e) => !e.is_void).reduce((s, e) => s + e.amount, 0);\n  const totalPaidPayroll = profitAndLoss(currentDb, "0001-01-01", "9999-12-31").payroll;\n`,
    'payroll cash total and income void');
  source = source.replace('                  {!e.is_void && canEdit ? (\n                    <Button variant="ghost" onClick={() => setVoidExpenseId(e.id)}>', '                  {!e.is_void && canVoid ? (\n                    <Button variant="ghost" onClick={() => { setVoidExpenseId(e.id); setVoidReason(""); }}>');
  source = source.replace('            المداخيل هنا للعرض. سندات قبض الطلاب تُدار من صفحة الإيصالات والفواتير، ولا يتم إلغاؤها من هذه الشاشة. المداخيل الملغاة لا تدخل في الإجمالي ولا تظهر ضمن قائمة المداخيل الفعلية.', '            هذه المداخيل مستقلة عن سندات قبض الطلاب. أي إلغاء يبقى محفوظاً في السجل ولا يدخل في الإجمالي المالي.');
  source = replaceOnce(source,
    '            <Table head={["المصدر", "المبلغ", "التاريخ", "ملاحظة"]}>\n              {incomePagination.rows.map((e) => (\n                <tr key={e.id}>\n                  <Td className="font-semibold">{e.source}</Td>\n                  <Td className="tabular-nums">{money(e.amount, cur)}</Td>\n                  <Td>{dateStr(e.date)}</Td>\n                  <Td>{e.note || "—"}</Td>\n                </tr>\n              ))}\n            </Table>',
    `            <Table head={["المصدر", "المبلغ", "التاريخ", "ملاحظة", "الحالة", ""]}>\n              {incomePagination.rows.map((e) => (\n                <tr key={e.id} className={e.is_void ? "opacity-60" : ""}>\n                  <Td className="font-semibold">{e.source}</Td>\n                  <Td className="tabular-nums">{money(e.amount, cur)}</Td>\n                  <Td>{dateStr(e.date)}</Td>\n                  <Td>{e.note || "—"}</Td>\n                  <Td>{e.is_void ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</Td>\n                  <Td>{!e.is_void && canVoid ? <Button variant="ghost" onClick={() => { setVoidIncomeId(e.id); setVoidReason(""); }}>إلغاء</Button> : null}</Td>\n                </tr>\n              ))}\n            </Table>`,
    'income void table');
  source = replaceOnce(source,
    '            <p className="text-xs text-muted-foreground">\n              سيبقى المصروف محفوظًا في السجل بحالة «ملغى»، لكنه لن يدخل في إجمالي المصاريف الفعلية.\n            </p>\n            {error ?',
    '            <p className="text-xs text-muted-foreground">\n              سيبقى المصروف محفوظًا في السجل بحالة «ملغى»، لكنه لن يدخل في إجمالي المصاريف الفعلية.\n            </p>\n            <Field label="سبب الإلغاء"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>\n            {error ?',
    'expense void reason field');
  const endMarker = '      </Modal>\n    </div>\n  );\n}';
  const incomeModal = `      </Modal>\n\n      <Modal open={!!incomeToVoid} title="تأكيد إلغاء المدخول" onClose={() => setVoidIncomeId(null)}>\n        {incomeToVoid ? (\n          <div className="space-y-4">\n            <div className="rounded-xl border bg-muted/20 p-4 text-sm">\n              <p className="font-bold">هل أنت متأكد من إلغاء هذا المدخول؟</p>\n              <p className="mt-2">المصدر: <b>{incomeToVoid.source}</b></p>\n              <p>المبلغ: <b>{money(incomeToVoid.amount, cur)}</b></p>\n            </div>\n            <Field label="سبب الإلغاء"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>\n            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}\n            <div className="flex justify-end gap-2">\n              <Button variant="secondary" onClick={() => setVoidIncomeId(null)}>تراجع</Button>\n              <Button variant="danger" onClick={confirmVoidIncome}>تأكيد الإلغاء</Button>\n            </div>\n          </div>\n        ) : null}\n      </Modal>\n    </div>\n  );\n}`;
  source = replaceOnce(source, endMarker, incomeModal, 'income void modal');
  return source;
});

edit('src/routes/courses.tsx', (source) => {
  source = source.replace('import { useState } from "react";', 'import { useMemo, useState } from "react";');
  source = replaceOnce(source,
    '  const [error, setError] = useState<string | null>(null);\n\n  if (!db) return null;',
    `  const [error, setError] = useState<string | null>(null);\n  const [q, setQ] = useState("");\n  const [status, setStatus] = useState("");\n  const rows = useMemo(() => {\n    if (!db) return [];\n    const term = q.trim().toLowerCase();\n    return db.courses.filter((course) => {\n      if (status === "active" && !course.active) return false;\n      if (status === "inactive" && course.active) return false;\n      return !term || course.name.toLowerCase().includes(term) || course.code.toLowerCase().includes(term);\n    });\n  }, [db, q, status]);\n\n  if (!db) return null;`,
    'course search state');
  source = source.replace('subtitle={`${db.courses.length} عام دراسي`}', 'subtitle={`${rows.length} من ${db.courses.length} عام دراسي`}');
  source = replaceOnce(source,
    '      />\n\n      {db.courses.length ? (',
    `      />\n\n      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">\n        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث باسم العام الدراسي أو الرمز" />\n        <Select value={status} onChange={(e) => setStatus(e.target.value)}>\n          <option value="">كل الحالات</option><option value="active">مفعّلة</option><option value="inactive">موقوفة</option>\n        </Select>\n      </div>\n\n      {rows.length ? (`,
    'course filters UI');
  source = source.replace('{db.courses.map((c) => (', '{rows.map((c) => (');
  source = source.replace('<Empty text="لم تُضف أعوام دراسية بعد." />', '<Empty text="لا توجد أعوام دراسية مطابقة." />');
  return source;
});

edit('src/routes/users.tsx', (source) => {
  source = replaceOnce(source,
    '  const [error, setError] = useState<string | null>(null);\n\n  const rows = useMemo(\n    () => (db ? db.users.slice().sort((a, b) => a.full_name.localeCompare(b.full_name, "ar")) : []),\n    [db],\n  );\n  const pagination = usePagination(rows, "users");',
    `  const [error, setError] = useState<string | null>(null);\n  const [q, setQ] = useState("");\n  const [role, setRole] = useState("");\n  const [status, setStatus] = useState("");\n\n  const rows = useMemo(() => {\n    if (!db) return [];\n    const term = q.trim().toLowerCase();\n    return db.users\n      .filter((user) => !role || user.role === role)\n      .filter((user) => status === "active" ? user.is_active : status === "inactive" ? !user.is_active : true)\n      .filter((user) => !term || user.username.toLowerCase().includes(term) || user.full_name.toLowerCase().includes(term))\n      .slice().sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));\n  }, [db, q, role, status]);\n  const pagination = usePagination(rows, \`${'${'}q}|${'${'}role}|${'${'}status}\`);`,
    'user filters state');
  source = source.replace('subtitle={`${currentDb.users.length} مستخدم`}', 'subtitle={`${rows.length} من ${currentDb.users.length} مستخدم`}');
  source = replaceOnce(source,
    '      />\n\n      {rows.length === 0 ? (',
    `      />\n\n      <div className="mb-4 grid gap-3 sm:grid-cols-3">\n        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو اسم المستخدم" />\n        <Select value={role} onChange={(e) => setRole(e.target.value)}>\n          <option value="">كل الأدوار</option>\n          {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}\n        </Select>\n        <Select value={status} onChange={(e) => setStatus(e.target.value)}>\n          <option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطّل</option>\n        </Select>\n      </div>\n\n      {rows.length === 0 ? (`,
    'user filters UI');
  return source;
});

edit('tests/domain-harness.ts', (source) => {
  source = source.replace('  voidExpense,\n  voidPayment,', '  voidExpense,\n  voidIncome,\n  voidPayment,');
  source = source.replace('voidExpense(expenseId, ownerActor);', 'assert.throws(() => voidExpense(expenseId, ownerActor, ""), /سبب الإلغاء إلزامي/);\nvoidExpense(expenseId, ownerActor, "تكرار إدخال");');
  const marker = 'assert.equal(profitAndLoss(current, "2026-08-01", "2026-08-31").expenses, 0);\n';
  const addition = `assert.equal(profitAndLoss(current, "2026-08-01", "2026-08-31").expenses, 0);\n\nconst incomeId = insert("incomes", {\n  source: "دخل تجريبي", amount: 7_000, date: "2026-08-10", note: "اختبار", user_id: ownerActor.id, is_void: false,\n}, ownerActor, "مدخول");\nassert.throws(() => voidIncome(incomeId, ownerActor, ""), /سبب الإلغاء إلزامي/);\nvoidIncome(incomeId, ownerActor, "قيد خاطئ");\ncurrent = snapshot()!;\nassert.equal(profitAndLoss(current, "2026-08-01", "2026-08-31").otherIncome, 0);\n`;
  return replaceOnce(source, marker, addition, 'income void test');
});

console.log('Academy financial polish + search transform complete');

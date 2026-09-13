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

edit('src/routes/students.$id.tsx', (source) => {
  source = source.replace('import { invoiceFinancials, studentBalance } from "@/lib/finance";', 'import { invoiceFinancials, studentBalance, studentMonthlyLedger } from "@/lib/finance";');
  source = replaceOnce(source,
    '  const payments = currentDb.payments\n    .filter((p) => p.student_id === student.id)\n    .sort((a, b) => b.paid_at.localeCompare(a.paid_at));\n',
    '  const payments = currentDb.payments\n    .filter((p) => p.student_id === student.id)\n    .sort((a, b) => b.paid_at.localeCompare(a.paid_at));\n  const monthlyLedger = studentMonthlyLedger(currentDb, student.id);\n',
    'student monthly ledger');
  source = replaceOnce(source,
    '          <p>الهاتف: {student.phone || "—"}</p>\n          <p>العنوان: {student.address || "—"}</p>',
    '          <p>الهاتف: {student.phone || "—"}</p>\n          <p>اسم الأم: {student.mother_name || "—"}</p>\n          <p>المدرسة: {student.school_name || "—"}</p>\n          <p>العنوان: {student.address || "—"}</p>',
    'student extra profile fields');
  const financeHeading = '      {canViewFinance ? <h2 className="mb-2 mt-6 text-sm font-bold">كشف الحساب المالي</h2> : null}\n';
  const monthlyBlock = `      {canViewFinance && monthlyLedger.length ? (\n        <>\n          <h2 className="mb-2 mt-6 text-sm font-bold">تفصيل الاستحقاقات الشهرية</h2>\n          <Table head={["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة"]}>\n            {monthlyLedger.map((row) => (\n              <tr key={row.installment_id}>\n                <Td className="font-semibold">{row.period}</Td>\n                <Td className="tabular-nums">{money(row.amount, cur)}</Td>\n                <Td className="tabular-nums text-emerald-700">{money(row.paid, cur)}</Td>\n                <Td className={row.due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(row.due, cur)}</Td>\n                <Td>\n                  {row.status === "paid" ? <Badge tone="success">مدفوع</Badge> : row.status === "partial" ? <Badge tone="warning">جزئي</Badge> : <Badge tone="danger">غير مدفوع</Badge>}\n                </Td>\n              </tr>\n            ))}\n          </Table>\n        </>\n      ) : null}\n\n`;
  source = replaceOnce(source, financeHeading, monthlyBlock + financeHeading, 'student monthly table');
  source = source.replace('["الصف", "الدورة", "تاريخ التسجيل", "قيمة التسجيل", "الحالة"]', '["الصف", "العام الدراسي", "تاريخ التسجيل", "قيمة التسجيل", "الحالة"]');
  source = source.replace('["الصف", "الدورة", "تاريخ التسجيل", "الحالة"]', '["الصف", "العام الدراسي", "تاريخ التسجيل", "الحالة"]');
  source = source.replace('["الفاتورة", "الدورة / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", "التاريخ"]', '["الفاتورة", "العام الدراسي / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", "التاريخ"]');
  source = source.replace('["رقم السند", "البيان / الملاحظة", "الدورة / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]', '["رقم السند", "البيان / الملاحظة", "العام الدراسي / الصف", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]');
  return source;
});

edit('src/routes/reports.tsx', (source) => {
  source = source.replace('import { invoiceFinancials, profitAndLoss } from "@/lib/finance";', 'import { invoiceFinancials, profitAndLoss, studentMonthlyLedger } from "@/lib/finance";');
  source = source.replace('import { fromMinor, money, today } from "@/lib/format";', 'import { fromMinor, localMonthKey, money, today } from "@/lib/format";');
  source = source.replace('type ReportType = "profit" | "balances";', 'type ReportType = "profit" | "balances" | "monthly-status";');
  source = replaceOnce(source,
    '  const [to, setTo] = useState(today());\n',
    '  const [to, setTo] = useState(today());\n  const [reportMonth, setReportMonth] = useState(localMonthKey());\n  const [paymentStatus, setPaymentStatus] = useState("all");\n  const [studentQuery, setStudentQuery] = useState("");\n',
    'report monthly state');
  const beforePagination = '  const pagination = usePagination(balances, type);\n';
  const monthlyMemo = `  const monthlyStatusRows = useMemo(() => {\n    if (!db || type !== "monthly-status") return [];\n    const term = studentQuery.trim().toLowerCase();\n    return db.students.flatMap((student) => {\n      const ledger = studentMonthlyLedger(db, student.id);\n      const current = ledger.filter((row) => row.period === reportMonth);\n      if (!current.length) return [];\n      const amount = current.reduce((sum, row) => sum + row.amount, 0);\n      const paid = current.reduce((sum, row) => sum + row.paid, 0);\n      const due = current.reduce((sum, row) => sum + row.due, 0);\n      const priorDue = ledger.filter((row) => row.period < reportMonth).reduce((sum, row) => sum + row.due, 0);\n      const status = due <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";\n      if (paymentStatus !== "all" && status !== paymentStatus) return [];\n      if (term && !student.full_name.toLowerCase().includes(term) && !student.code.toLowerCase().includes(term)) return [];\n      return [{ student, amount, paid, due, priorDue, status }];\n    }).sort((a, b) => b.due - a.due || a.student.full_name.localeCompare(b.student.full_name, "ar"));\n  }, [db, type, reportMonth, paymentStatus, studentQuery]);\n  const pagination = usePagination(balances, type);\n  const monthlyPagination = usePagination(monthlyStatusRows, \`${'${'}reportMonth}|${'${'}paymentStatus}|${'${'}studentQuery}\`);\n`;
  source = replaceOnce(source, beforePagination, monthlyMemo, 'monthly report memo');
  source = replaceOnce(source,
    '              <option value="balances">أرصدة الطلاب</option>\n',
    '              <option value="balances">أرصدة الطلاب</option>\n              <option value="monthly-status">مدفوع / غير مدفوع شهرياً</option>\n',
    'report type option');
  source = replaceOnce(source,
    '          {type === "profit" ? (\n            <>',
    '          {type === "monthly-status" ? (\n            <>\n              <Field label="الشهر"><Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></Field>\n              <Field label="الحالة">\n                <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>\n                  <option value="all">الكل</option><option value="paid">مدفوع</option><option value="partial">مدفوع جزئياً</option><option value="unpaid">غير مدفوع</option>\n                </Select>\n              </Field>\n              <Field label="بحث بالطالب"><Input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="الاسم أو الرمز" /></Field>\n            </>\n          ) : null}\n          {type === "profit" ? (\n            <>',
    'monthly report filters');
  const beforeEnd = '      {type === "balances" ? (\n';
  const monthlyUi = `      {type === "monthly-status" ? (\n        <div>\n          <div className="mb-4 grid gap-3 sm:grid-cols-4">\n            <Stat label="عدد الطلاب" value={String(monthlyStatusRows.length)} />\n            <Stat label="مدفوع بالكامل" value={String(monthlyStatusRows.filter((row) => row.status === "paid").length)} tone="success" />\n            <Stat label="مدفوع جزئياً" value={String(monthlyStatusRows.filter((row) => row.status === "partial").length)} />\n            <Stat label="غير مدفوع" value={String(monthlyStatusRows.filter((row) => row.status === "unpaid").length)} tone="danger" />\n          </div>\n          {monthlyStatusRows.length ? (\n            <>\n              <Table head={["الطالب", "الشهر", "المستحق", "المدفوع", "المتبقي", "متأخرات أقدم", "الحالة", ""]}>\n                {monthlyPagination.rows.map((row) => (\n                  <tr key={row.student.id}>\n                    <Td className="font-semibold">{row.student.full_name}</Td><Td>{reportMonth}</Td>\n                    <Td className="tabular-nums">{money(row.amount, cur)}</Td><Td className="tabular-nums text-emerald-700">{money(row.paid, cur)}</Td>\n                    <Td className={row.due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(row.due, cur)}</Td>\n                    <Td className={row.priorDue > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(row.priorDue, cur)}</Td>\n                    <Td>{row.status === "paid" ? "مدفوع" : row.status === "partial" ? "جزئي" : "غير مدفوع"}</Td>\n                    <Td><Link to="/students/$id" params={{ id: row.student.id }} className="text-primary hover:underline">فتح البطاقة</Link></Td>\n                  </tr>\n                ))}\n              </Table>\n              <PaginationControls page={monthlyPagination.page} pageCount={monthlyPagination.pageCount} pageSize={monthlyPagination.pageSize} total={monthlyPagination.total} from={monthlyPagination.from} to={monthlyPagination.to} onPrevious={monthlyPagination.previous} onNext={monthlyPagination.next} onPageSizeChange={monthlyPagination.setPageSize} />\n            </>\n          ) : <Empty text="لا يوجد طلاب مطابقون لهذا الشهر والحالة." />}\n        </div>\n      ) : null}\n\n`;
  source = replaceOnce(source, beforeEnd, monthlyUi + beforeEnd, 'monthly report UI');
  source = source.replace('headers = ["الطالب", "الدورة / الصف",', 'headers = ["الطالب", "العام الدراسي / الصف",');
  return source;
});

edit('src/routes/employees.tsx', (source) => {
  source = source.replace('import { generatePayroll as createPayroll, payPayrollItem, recordAdvance } from "@/lib/payroll";', 'import { generatePayroll as createPayroll, payrollPaid, payrollRemaining, recordAdvance, recordPayrollPayment } from "@/lib/payroll";');
  source = replaceOnce(source,
    '  const [payFor, setPayFor] = useState<PayrollItem | null>(null);\n',
    '  const [payFor, setPayFor] = useState<PayrollItem | null>(null);\n  const [payAmount, setPayAmount] = useState("");\n',
    'payroll partial state');
  source = replaceOnce(source,
    '  function confirmPay() {\n    if (!payFor) return;\n    try {\n      payPayrollItem(payFor.id, actor);\n      setPayFor(null);\n      setError(null);\n    } catch (caught) {\n      setError((caught as Error).message);\n    }\n  }',
    '  function confirmPay() {\n    if (!payFor) return;\n    const amount = toMinor(payAmount);\n    if (amount <= 0) return setError("مبلغ الدفعة غير صالح");\n    try {\n      recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");\n      setPayFor(null);\n      setPayAmount("");\n      setError(null);\n    } catch (caught) {\n      setError((caught as Error).message);\n    }\n  }',
    'partial pay confirm');
  source = replaceOnce(source,
    '  const paidNet = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.net, 0);',
    '  const paidNet = items.reduce((sum, item) => sum + payrollPaid(currentDb, item.id), 0);',
    'payroll actual paid stat');
  source = source.replace('        <Table head={["الموظف", "الأساسي", "خصم السلف", "الصافي", "الحالة", "تاريخ الدفع", ""]}>', '        <Table head={["الموظف", "الأساسي", "خصم السلف", "الصافي", "المدفوع", "المتبقي", "الحالة", "تاريخ الإكمال", ""]}>');
  source = replaceOnce(source,
    '              <Td className="tabular-nums font-semibold">{money(i.net, cur)}</Td>\n              <Td>{i.status === "paid" ? <Badge tone="success">مدفوع</Badge> : <Badge tone="warning">مسودة</Badge>}</Td>',
    '              <Td className="tabular-nums font-semibold">{money(i.net, cur)}</Td>\n              <Td className="tabular-nums text-emerald-700">{money(payrollPaid(currentDb, i.id), cur)}</Td>\n              <Td className={payrollRemaining(currentDb, i.id) > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(payrollRemaining(currentDb, i.id), cur)}</Td>\n              <Td>{i.status === "paid" ? <Badge tone="success">مدفوع</Badge> : i.status === "partial" ? <Badge tone="warning">جزئي</Badge> : <Badge tone="muted">غير مدفوع</Badge>}</Td>',
    'payroll table amounts');
  source = replaceOnce(source,
    '<Button variant="secondary" onClick={() => { setPayFor(i); setError(null); }}>\n                      دفع\n                    </Button>',
    '<Button variant="secondary" onClick={() => { setPayFor(i); setPayAmount(fromMinor(payrollRemaining(currentDb, i.id))); setError(null); }}>\n                      دفع\n                    </Button>',
    'open partial pay');
  source = source.replace('title="تأكيد دفع الراتب"', 'title="دفع الراتب"');
  source = replaceOnce(source,
    '              <p className="mt-2 text-base"><b>الصافي المدفوع:</b> {money(payFor.net, cur)}</p>\n            </div>\n            {error ?',
    '              <p className="mt-2"><b>المدفوع سابقاً:</b> {money(payrollPaid(currentDb, payFor.id), cur)}</p>\n              <p><b>المتبقي:</b> {money(payrollRemaining(currentDb, payFor.id), cur)}</p>\n            </div>\n            <Field label={`مبلغ الدفعة (${cur})`}>\n              <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />\n            </Field>\n            <p className="text-xs text-muted-foreground">يمكن دفع كامل المتبقي أو أي جزء منه. سيبقى الرصيد ظاهراً إلى أن يكتمل الراتب.</p>\n            {error ?',
    'partial payroll modal');
  source = source.replace('<Button onClick={confirmPay}>تأكيد الدفع</Button>', '<Button onClick={confirmPay}>تسجيل الدفعة</Button>');
  return source;
});

console.log('Academy financial UI transform complete');

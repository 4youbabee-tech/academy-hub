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

edit('src/lib/types.ts', (source) => replaceOnce(
  source,
  '  discount_presets: DiscountPreset[];\n}',
  '  discount_presets: DiscountPreset[];\n  /** Last period processed by the automatic monthly engine. Null means activate from the current month only. */\n  monthly_generation_last_period: string | null;\n}',
  'settings monthly generation marker',
));

edit('src/lib/db.ts', (source) => replaceOnce(
  source,
  '      discount_presets: [],\n    },',
  '      discount_presets: [],\n      monthly_generation_last_period: null,\n    },',
  'default monthly generation marker',
));

edit('src/lib/monthly.ts', (source) => {
  source = source.replace('import { audit, transact, type Actor } from "./db";', 'import { audit, snapshot, transact, type Actor } from "./db";');
  const oldBody = `/**\n * Single-transaction monthly cycle. Safe to call on every app startup: generators are idempotent\n * and only create missing student charges and payroll rows for the requested period.\n */\nexport function runMonthlyGeneration(period = currentPeriod(), actor: Actor): MonthlyGenerationSummary {\n  assertPeriod(period);\n  const summary: MonthlyGenerationSummary = {\n    period,\n    student_charges_created: 0,\n    payroll_items_created: 0,\n  };\n\n  transact((db) => {\n    summary.student_charges_created = generateMonthlyStudentChargesInDb(db, period);\n    summary.payroll_items_created = generatePayrollInDb(db, period);\n    if (summary.student_charges_created > 0 || summary.payroll_items_created > 0) {\n      audit(\n        db,\n        actor,\n        "monthly_cycle",\n        null,\n        "generate",\n        \`الدورة الشهرية \${period}: \${summary.student_charges_created} استحقاق طلاب، \${summary.payroll_items_created} كشف رواتب\`,\n      );\n    }\n  });\n  return summary;\n}`;
  const newBody = `function nextPeriod(period: string): string {\n  assertPeriod(period);\n  const [yearText, monthText] = period.split("-");\n  const year = Number(yearText);\n  const month = Number(monthText);\n  return month === 12 ? \`${'${'}year + 1}-01\` : \`${'${'}year}-\${String(month + 1).padStart(2, "0")}\`;\n}\n\nfunction periodsSince(lastPeriod: string | null, targetPeriod: string): string[] {\n  assertPeriod(targetPeriod);\n  if (!lastPeriod || lastPeriod >= targetPeriod) return [targetPeriod];\n  assertPeriod(lastPeriod);\n  const periods: string[] = [];\n  let cursor = nextPeriod(lastPeriod);\n  while (cursor <= targetPeriod) {\n    periods.push(cursor);\n    cursor = nextPeriod(cursor);\n  }\n  return periods;\n}\n\n/**\n * Single-transaction monthly cycle. On first activation it only processes the current month, so legacy\n * history is never manufactured. Later startups catch up every missed period. Each underlying generator\n * is idempotent, so it is also safe to run again in the same month for newly added students/employees.\n */\nexport function runMonthlyGeneration(period = currentPeriod(), actor: Actor): MonthlyGenerationSummary {\n  assertPeriod(period);\n  const summary: MonthlyGenerationSummary = { period, student_charges_created: 0, payroll_items_created: 0 };\n  const lastPeriod = snapshot()?.settings.monthly_generation_last_period ?? null;\n  const periods = periodsSince(lastPeriod, period);\n\n  transact((db) => {\n    for (const target of periods) {\n      summary.student_charges_created += generateMonthlyStudentChargesInDb(db, target);\n      summary.payroll_items_created += generatePayrollInDb(db, target);\n    }\n    if (!db.settings.monthly_generation_last_period || db.settings.monthly_generation_last_period < period) {\n      db.settings.monthly_generation_last_period = period;\n    }\n    if (summary.student_charges_created > 0 || summary.payroll_items_created > 0) {\n      audit(db, actor, "monthly_cycle", null, "generate", \`الدورة الشهرية حتى \${period}: \${summary.student_charges_created} استحقاق طلاب، \${summary.payroll_items_created} كشف رواتب\`);\n    }\n  });\n  return summary;\n}`;
  return replaceOnce(source, oldBody, newBody, 'monthly generation implementation');
});

edit('src/lib/session.tsx', (source) => {
  source = source.replace('import { can } from "./permissions";', 'import { can } from "./permissions";\nimport { runMonthlyGeneration } from "./monthly";');
  source = replaceOnce(source,
    '  const user = useMemo(\n    () => db?.users.find((u) => u.id === userId && u.is_active) ?? null,\n    [db, userId],\n  );\n',
    `  const user = useMemo(\n    () => db?.users.find((u) => u.id === userId && u.is_active) ?? null,\n    [db, userId],\n  );\n\n  useEffect(() => {\n    if (!userId) return;\n    const current = snapshot();\n    const activeUser = current?.users.find((item) => item.id === userId && item.is_active);\n    if (!activeUser) return;\n    try {\n      runMonthlyGeneration(undefined, { id: activeUser.id, name: activeUser.full_name });\n    } catch (error) {\n      console.error("تعذر تشغيل الدورة الشهرية التلقائية", error);\n    }\n  }, [userId]);\n`,
    'automatic monthly generation effect');
  return source;
});

edit('src/routes/receipts.tsx', (source) => {
  source = source.replace('  const canVoid = allowed("finance.void") || canPay;', '  const canVoid = allowed("finance.void");');
  source = source.replaceAll('الدورة / الصف', 'العام الدراسي / الصف');
  source = source.replace('بحث بالطالب أو رقم الفاتورة أو الدورة...', 'بحث بالطالب أو رقم الفاتورة أو العام الدراسي...');
  return source;
});

edit('src/components/AppShell.tsx', (source) => {
  source = source.replace('import { useState, type ReactNode } from "react";', 'import { useMemo, useState, type ReactNode } from "react";');
  source = source.replace('import { Button, Input, Modal, Panel } from "@/components/ui-kit";', 'import { Badge, Button, Input, Modal, Panel, Table, Td } from "@/components/ui-kit";');
  source = source.replace('import { ROLE_LABELS } from "@/lib/permissions";', 'import { ROLE_LABELS, can } from "@/lib/permissions";\nimport { studentMonthlyLedger } from "@/lib/finance";\nimport { localMonthKey, money } from "@/lib/format";');
  source = replaceOnce(source,
    '  const [helpOpen, setHelpOpen] = useState(false);\n',
    `  const [helpOpen, setHelpOpen] = useState(false);\n  const [notificationsOpen, setNotificationsOpen] = useState(false);\n  const arrears = useMemo(() => {\n    if (!db || !can(user?.role, "finance.view")) return [];\n    const currentMonth = localMonthKey();\n    return db.students.flatMap((student) => {\n      const overdue = studentMonthlyLedger(db, student.id).filter((row) => row.period < currentMonth && row.due > 0);\n      if (!overdue.length) return [];\n      const total = overdue.reduce((sum, row) => sum + row.due, 0);\n      return [{ student, total, overdue }];\n    }).sort((a, b) => b.total - a.total || a.student.full_name.localeCompare(b.student.full_name, "ar"));\n  }, [db, user?.role]);\n`,
    'notification state and arrears');
  source = replaceOnce(source,
    '          <div className="flex-1" />\n          <div className="text-left">',
    `          <div className="flex-1" />\n          {can(user.role, "finance.view") ? (\n            <Button variant="ghost" onClick={() => setNotificationsOpen(true)} className="relative">\n              🔔\n              {arrears.length ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{arrears.length}</span> : null}\n            </Button>\n          ) : null}\n          <div className="text-left">`,
    'notification bell');
  source = replaceOnce(source,
    '      <Modal open={helpOpen} title="كيفية العمل على البرنامج" onClose={() => setHelpOpen(false)} extraWide>\\n        <HelpGuide />\\n      </Modal>\n',
    `      <Modal open={notificationsOpen} title="تنبيهات المتأخرات" onClose={() => setNotificationsOpen(false)} extraWide>\n        {arrears.length ? (\n          <Table head={["الطالب", "إجمالي المتأخر", "التفصيل", ""]}>\n            {arrears.map(({ student, total, overdue }) => (\n              <tr key={student.id}>\n                <Td className="font-semibold">{student.full_name}</Td>\n                <Td className="tabular-nums text-destructive">{money(total, db.settings.currency)}</Td>\n                <Td className="text-xs">{overdue.map((row) => \`${'${'}row.period}: ${'${'}money(row.due, db.settings.currency)}\`).join("، ")}</Td>\n                <Td><Link to="/students/$id" params={{ id: student.id }} onClick={() => setNotificationsOpen(false)} className="font-semibold text-primary hover:underline">فتح البطاقة</Link></Td>\n              </tr>\n            ))}\n          </Table>\n        ) : (\n          <div className="rounded-xl border bg-muted/20 p-5 text-sm text-muted-foreground">لا توجد متأخرات من أشهر سابقة.</div>\n        )}\n      </Modal>\n\n      <Modal open={helpOpen} title="كيفية العمل على البرنامج" onClose={() => setHelpOpen(false)} extraWide>\\n        <HelpGuide />\\n      </Modal>\n`,
    'notification modal');
  return source;
});

edit('tests/monthly-financial-harness.ts', (source) => {
  source = source.replace('import { today } from "../src/lib/format";', 'import { today } from "../src/lib/format";\nimport { runMonthlyGeneration } from "../src/lib/monthly";');
  source = replaceOnce(source,
    'const next = nextPeriod(currentPeriod);\n',
    'const next = nextPeriod(currentPeriod);\nconst next2 = nextPeriod(next);\n',
    'second future period');
  source = replaceOnce(source,
    'assert.equal(current.payroll_payments.find((item) => item.id === salaryPart1)!.is_void, false);\n\nconsole.log',
    `assert.equal(current.payroll_payments.find((item) => item.id === salaryPart1)!.is_void, false);\n\ncurrent.settings.monthly_generation_last_period = currentPeriod;\nrunMonthlyGeneration(next2, actor);\ncurrent = snapshot()!;\nassert.equal(current.settings.monthly_generation_last_period, next2);\nassert.equal(current.installments.filter((item) => item.kind === "monthly" && item.period === next).length, 1, "catch-up must not duplicate an existing month");\nassert.equal(current.installments.filter((item) => item.kind === "monthly" && item.period === next2).length, 1, "catch-up must create the missing later month");\nassert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next).length, 1);\nassert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next2).length, 1, "payroll catch-up must create missing month once");\n\nconsole.log`,
    'monthly catch-up test');
  return source;
});

console.log('Academy automatic monthly cycle + notifications transform complete');

import { readFile, writeFile } from "node:fs/promises";

async function replace(path, before, after) {
  const current = await readFile(path, "utf8");
  if (!current.includes(before)) throw new Error(`Expected source block not found in ${path}`);
  await writeFile(path, current.replace(before, after));
}

await replace(
  "src/lib/monthly.ts",
  `function periodsSince(lastPeriod: string | null, targetPeriod: string): string[] {\n  assertPeriod(targetPeriod);\n  if (!lastPeriod || lastPeriod >= targetPeriod) return [targetPeriod];\n  assertPeriod(lastPeriod);\n  const periods: string[] = [];`,
  `function periodsSince(lastPeriod: string | null, targetPeriod: string): string[] {\n  assertPeriod(targetPeriod);\n  if (!lastPeriod) return [targetPeriod];\n  assertPeriod(lastPeriod);\n  if (lastPeriod > targetPeriod) return [];\n  if (lastPeriod === targetPeriod) return [targetPeriod];\n  const periods: string[] = [];`,
);

await replace(
  "desktop/database.mjs",
  `      const invoices = idSet("invoices");\n      const employees = idSet("employees");\n      const payrollItems = idSet("payroll_items");`,
  `      const invoices = idSet("invoices");\n      const installments = idSet("installments");\n      const employees = idSet("employees");\n      const payrollItems = idSet("payroll_items");`,
);

await replace(
  "desktop/database.mjs",
  `      const invoiceById = new Map(snapshot.invoices.map((item) => [item.id, item]));\n      for (const item of snapshot.invoices) {`,
  `      const invoiceById = new Map(snapshot.invoices.map((item) => [item.id, item]));\n      const payrollItemById = new Map(snapshot.payroll_items.map((item) => [item.id, item]));\n      for (const item of snapshot.invoices) {`,
);

await replace(
  "desktop/database.mjs",
  `      for (const item of snapshot.payments) {\n        const invoice = invoiceById.get(item.invoice_id);\n        if (!invoice || !students.has(item.student_id) || invoice.student_id !== item.student_id) throw new Error("سند قبض بعلاقة غير صالحة.");\n        money(item.amount, "سند القبض", false);\n      }\n      for (const item of snapshot.payroll_items) {`,
  `      const paidByInvoice = new Map();\n      for (const item of snapshot.payments) {\n        const invoice = invoiceById.get(item.invoice_id);\n        if (!invoice || !students.has(item.student_id) || invoice.student_id !== item.student_id) throw new Error("سند قبض بعلاقة غير صالحة.");\n        if (item.installment_id && !installments.has(item.installment_id)) throw new Error("سند قبض مرتبط باستحقاق غير موجود.");\n        if (item.installment_id) {\n          const installment = snapshot.installments.find((row) => row.id === item.installment_id);\n          if (!installment || installment.invoice_id !== item.invoice_id) throw new Error("سند قبض مرتبط باستحقاق من فاتورة مختلفة.");\n        }\n        money(item.amount, "سند القبض", false);\n        if (!item.is_void) paidByInvoice.set(item.invoice_id, (paidByInvoice.get(item.invoice_id) ?? 0) + item.amount);\n      }\n      for (const [invoiceId, paid] of paidByInvoice) {\n        const invoice = invoiceById.get(invoiceId);\n        if (!invoice || paid > invoice.total) throw new Error("إجمالي سندات القبض يتجاوز قيمة الفاتورة في النسخة الاحتياطية.");\n      }\n      for (const item of snapshot.payroll_items) {`,
);

await replace(
  "desktop/database.mjs",
  `      for (const item of snapshot.payroll_payments) {\n        if (!payrollItems.has(item.payroll_item_id)) throw new Error("دفعة راتب مرتبطة بكشف غير موجود.");\n        money(item.amount, "دفعة الراتب", false);\n      }\n      for (const item of snapshot.advances) {`,
  `      const paidByPayroll = new Map();\n      for (const item of snapshot.payroll_payments) {\n        const payrollItem = payrollItemById.get(item.payroll_item_id);\n        if (!payrollItem) throw new Error("دفعة راتب مرتبطة بكشف غير موجود.");\n        if (item.employee_id !== payrollItem.employee_id) throw new Error("دفعة راتب مرتبطة بموظف مختلف عن كشف الراتب.");\n        money(item.amount, "دفعة الراتب", false);\n        if (!item.is_void) paidByPayroll.set(item.payroll_item_id, (paidByPayroll.get(item.payroll_item_id) ?? 0) + item.amount);\n      }\n      for (const [payrollId, paid] of paidByPayroll) {\n        const payrollItem = payrollItemById.get(payrollId);\n        if (!payrollItem || paid > payrollItem.net) throw new Error("إجمالي دفعات الراتب يتجاوز صافي الراتب في النسخة الاحتياطية.");\n      }\n      for (const item of snapshot.advances) {`,
);

await replace(
  "desktop/database.mjs",
  `      if (users.size !== snapshot.users.length || enrollments.size !== snapshot.enrollments.length || invoices.size !== snapshot.invoices.length) {\n        throw new Error("يوجد معرّف مكرر في النسخة الاحتياطية.");\n      }`,
  `      for (const collection of COLLECTIONS) {\n        if (idSet(collection).size !== snapshot[collection].length) throw new Error(\`يوجد معرّف مكرر ضمن ${collection} في النسخة الاحتياطية.\`);\n      }`,
);

await replace(
  "tests/monthly-financial-harness.ts",
  `assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next3).length, 0, "ended employee must not receive future payroll");\n\nconst transitionDb = emptyDb();`,
  `assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next3).length, 0, "ended employee must not receive future payroll");\n\ncurrent.students.push({\n  ...baseFields(), id: "student-clock", code: "ST-CLOCK", full_name: "طالب اختبار الساعة", birth_date: null,\n  gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "",\n  address: "", education_level: null, status: "active", archived_at: null, notes: "",\n});\nreplaceDb(current);\ncreateMonthlyEnrollmentWithInvoice({ student_id: "student-clock", class_id: "class-monthly", monthly_price: 9_000, discount: 0, start_period: next2 }, actor);\nlet rollbackCurrent = snapshot()!;\nassert.equal(studentMonthlyLedger(rollbackCurrent, "student-clock").length, 0, "future-start enrollment must not be billed immediately");\nrunMonthlyGeneration(next2, actor);\nrollbackCurrent = snapshot()!;\nassert.equal(rollbackCurrent.settings.monthly_generation_last_period, next3, "clock rollback must never move the generation marker backwards");\nassert.equal(studentMonthlyLedger(rollbackCurrent, "student-clock").length, 0, "clock rollback must not generate an older period after a newer month was already processed");\n\nconst transitionDb = emptyDb();`,
);

await replace(
  "tests/desktop-harness.mjs",
  `  await assert.rejects(() => database.restoreFrom(invalidBackupPath), /علاقة فاتورة|علاقة تسجيل|مالكاً نشطاً/);\n  assert.equal(database.loadSnapshot().students.length, 1, "failed restore must preserve current database");\n\n  const largeStudentSet = Array.from({ length: 2_500 }, (_, index) => ({`,
  `  await assert.rejects(() => database.restoreFrom(invalidBackupPath), /علاقة فاتورة|علاقة تسجيل|مالكاً نشطاً/);\n  assert.equal(database.loadSnapshot().students.length, 1, "failed restore must preserve current database");\n\n  const overpaidBackupPath = path.join(temp, "invalid-overpayment.sqlite");\n  await copyFile(backupPath, overpaidBackupPath);\n  const overpaidDb = new DatabaseSync(overpaidBackupPath);\n  try {\n    const put = overpaidDb.prepare("INSERT INTO entities(collection, id, position, data_json) VALUES (?, ?, ?, ?)");\n    put.run("classes", "class-overpay", 0, JSON.stringify({ id: "class-overpay", course_id: "course-x", name: "صف", capacity: 10 }));\n    put.run("enrollments", "enroll-overpay", 0, JSON.stringify({ id: "enroll-overpay", student_id: "student-1", class_id: "class-overpay", price_snapshot: 1000, discount_snapshot: 0 }));\n    put.run("invoices", "invoice-overpay", 0, JSON.stringify({ id: "invoice-overpay", enrollment_id: "enroll-overpay", student_id: "student-1", total: 1000, status: "open", issued_at: now }));\n    put.run("payments", "payment-overpay", 0, JSON.stringify({ id: "payment-overpay", invoice_id: "invoice-overpay", installment_id: null, student_id: "student-1", receipt_no: "R-OVER", amount: 1001, paid_at: now, is_void: false }));\n  } finally {\n    overpaidDb.close();\n  }\n  await assert.rejects(() => database.restoreFrom(overpaidBackupPath), /يتجاوز قيمة الفاتورة/);\n  assert.equal(database.loadSnapshot().students.length, 1, "overpaid restore rejection must preserve current database");\n\n  const payrollOverpaidBackupPath = path.join(temp, "invalid-payroll-overpayment.sqlite");\n  await copyFile(backupPath, payrollOverpaidBackupPath);\n  const payrollOverpaidDb = new DatabaseSync(payrollOverpaidBackupPath);\n  try {\n    const put = payrollOverpaidDb.prepare("INSERT INTO entities(collection, id, position, data_json) VALUES (?, ?, ?, ?)");\n    put.run("employees", "employee-overpay", 0, JSON.stringify({ id: "employee-overpay", full_name: "موظف", base_salary: 1000 }));\n    put.run("payroll_items", "payroll-overpay", 0, JSON.stringify({ id: "payroll-overpay", employee_id: "employee-overpay", period: "2026-09", base_snapshot: 1000, bonus: 0, deduction: 0, advance_deducted: 0, net: 1000, status: "partial", paid_at: null }));\n    put.run("payroll_payments", "payroll-payment-overpay", 0, JSON.stringify({ id: "payroll-payment-overpay", payroll_item_id: "payroll-overpay", employee_id: "employee-overpay", amount: 1001, paid_at: now, is_void: false }));\n  } finally {\n    payrollOverpaidDb.close();\n  }\n  await assert.rejects(() => database.restoreFrom(payrollOverpaidBackupPath), /يتجاوز صافي الراتب/);\n  assert.equal(database.loadSnapshot().students.length, 1, "payroll overpayment restore rejection must preserve current database");\n\n  const largeStudentSet = Array.from({ length: 2_500 }, (_, index) => ({`,
);

console.log("Final restore + month rollback hardening transform complete");

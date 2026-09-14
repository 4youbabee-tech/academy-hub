import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const dbPath = "src/lib/db.ts";
let db = read(dbPath);
db = db.replace('institute_name: "معهد النور"', 'institute_name: "المركز التعليمي"');
write(dbPath, db);

const expensesPath = "src/routes/expenses.tsx";
let expenses = read(expensesPath);
expenses = expenses.replaceAll("إجمالي مصروفات الشركة", "إجمالي مصروفات المركز");
expenses = expenses.replaceAll("ضمن إجمالي مصروفات الشركة", "ضمن إجمالي مصروفات المركز");
write(expensesPath, expenses);

const backupPath = "src/routes/backup.tsx";
let backup = read(backupPath);
backup = backup.replaceAll("الطلاب والدورات والتسجيلات", "الطلاب والأعوام الدراسية والتسجيلات");
write(backupPath, backup);

const guidePath = "src/components/HelpGuide.tsx";
let guide = read(guidePath);
guide = guide.replaceAll("تدفق الدورة والصف والطالب والتسجيل والفاتورة", "تدفق العام الدراسي والصف والطالب والتسجيل والفاتورة");
guide = guide.replaceAll("الصفوف والجداول ← صف جديد", "الصفوف ← صف جديد");
guide = guide.replaceAll('action: "الطلاب ← طالب جديد"', 'action: "الطلاب والتسجيل ← طالب جديد"');
guide = guide.replaceAll('action: "الطلاب ← اسم الطالب"', 'action: "الطلاب والتسجيل ← بطاقة الطالب"');
guide = guide.replaceAll('action: "سند قبض جديد"', 'action: "الفاتورة ← قبض"');
guide = guide.replaceAll('action: "حفظ السند"', 'action: "تسجيل القبض وطباعة السند"');
write(guidePath, guide);

const employeesPath = "src/routes/employees.tsx";
let employees = read(employeesPath);
employees = replaceRequired(
  employees,
  '  const [employeeQ, setEmployeeQ] = useState("");\n  const debouncedEmployeeQ = useDebouncedValue(employeeQ);\n',
  '  const [employeeQ, setEmployeeQ] = useState("");\n  const [payrollQ, setPayrollQ] = useState("");\n  const [payrollStatus, setPayrollStatus] = useState<"" | "paid" | "partial" | "unpaid">("");\n  const debouncedEmployeeQ = useDebouncedValue(employeeQ);\n  const debouncedPayrollQ = useDebouncedValue(payrollQ);\n',
  "payroll filter state",
);
employees = replaceRequired(
  employees,
  '  const items = useMemo(() => (db ? db.payroll_items.filter((p) => p.period === period) : []), [db, period]);\n  const employeePagination = usePagination(employees, debouncedEmployeeQ);\n  const payrollPagination = usePagination(items, period);\n',
  `  const items = useMemo(() => {\n    if (!db) return [];\n    const term = debouncedPayrollQ.trim().toLowerCase();\n    return db.payroll_items\n      .filter((item) => item.period === period)\n      .filter((item) => {\n        const paid = payrollPaid(db, item.id);\n        const remaining = payrollRemaining(db, item.id);\n        const status = remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid";\n        return !payrollStatus || status === payrollStatus;\n      })\n      .filter((item) => {\n        if (!term) return true;\n        const employee = db.employees.find((row) => row.id === item.employee_id);\n        return Boolean(employee && (employee.full_name.toLowerCase().includes(term) || employee.job_title.toLowerCase().includes(term)));\n      });\n  }, [db, period, debouncedPayrollQ, payrollStatus]);\n  const employeePagination = usePagination(employees, debouncedEmployeeQ);\n  const payrollPagination = usePagination(items, \\`${period}|${debouncedPayrollQ}|${payrollStatus}\\`);\n`,
  "payroll filtered rows",
);
employees = replaceRequired(
  employees,
  `      <div className="mb-4 flex flex-wrap items-end gap-2">\n        <Input className="max-w-40" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />\n        {canEdit ? <Button onClick={generatePayroll}>توليد الكشف</Button> : null}\n      </div>`,
  `      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_1fr_200px_auto] lg:items-end">\n        <Field label="الشهر"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>\n        <Field label="بحث"><Input value={payrollQ} onChange={(e) => setPayrollQ(e.target.value)} placeholder="اسم الموظف أو الوظيفة" /></Field>\n        <Field label="حالة الدفع">\n          <Select value={payrollStatus} onChange={(e) => setPayrollStatus(e.target.value as "" | "paid" | "partial" | "unpaid")}>\n            <option value="">الكل</option>\n            <option value="paid">مدفوع بالكامل</option>\n            <option value="partial">مدفوع جزئيًا</option>\n            <option value="unpaid">غير مدفوع</option>\n          </Select>\n        </Field>\n        {canEdit ? <Button onClick={generatePayroll}>توليد الكشف</Button> : null}\n      </div>`,
  "payroll filter controls",
);
write(employeesPath, employees);

console.log("Applied final Academy Hub v1.1.1 terminology and payroll filtering polish.");

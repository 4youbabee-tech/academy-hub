import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function write(path, content) {
  fs.writeFileSync(path, content);
}
function replaceOnce(path, before, after, label) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing pattern (${label}) in ${path}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`No change (${label}) in ${path}`);
  write(path, next);
}
function replaceAll(path, before, after, label) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing pattern (${label}) in ${path}`);
  write(path, source.split(before).join(after));
}

// 1) Academic year: singular label, automatic current-year name, hide unused code.
{
  const path = "src/routes/courses.tsx";
  replaceOnce(path,
    'const EMPTY = { name: "", code: "", level: "", hours: "0", price: "0", active: true };',
    'const academicYearNow = () => { const year = new Date().getFullYear(); return `${year}-${year + 1}`; };\nconst EMPTY = { name: academicYearNow(), code: "", level: "", hours: "0", price: "0", active: true };',
    "automatic academic year");
  replaceAll(path, 'title="الأعوام الدراسية"', 'title="العام الدراسي"', "singular page title");
  replaceAll(path, 'placeholder="بحث باسم العام الدراسي أو الرمز"', 'placeholder="بحث باسم العام الدراسي"', "year search placeholder");
  replaceOnce(path,
    'return !term || course.name.toLowerCase().includes(term) || course.code.toLowerCase().includes(term);',
    'return !term || course.name.toLowerCase().includes(term);',
    "remove code from search");
  replaceOnce(path,
    '<Table head={["العام الدراسي", "الرمز", "القسط الشهري الافتراضي", "الحالة", ""]}>',
    '<Table head={["العام الدراسي", "القسط الشهري الافتراضي", "الحالة", ""]}>',
    "remove code table header");
  replaceOnce(path,
    '<Td>{c.code || "—"}</Td>\n              <Td className="tabular-nums">{money(c.default_price, cur)}</Td>',
    '<Td className="tabular-nums">{money(c.default_price, cur)}</Td>',
    "remove code table cell");
  replaceOnce(path,
    '          <Field label="الرمز">\n            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />\n          </Field>\n',
    '',
    "remove code field");
}

// 2) Navigation: singular academic-year label; audit visible to owner only.
{
  const path = "src/components/AppShell.tsx";
  replaceOnce(path,
    '{ to: "/courses", label: "الأعوام الدراسية", perm: "courses.view" },',
    '{ to: "/courses", label: "العام الدراسي", perm: "courses.view" },',
    "singular nav label");
  replaceOnce(path,
    'const items = group.items.filter((i) => allowed(i.perm));',
    'const items = group.items.filter((i) => allowed(i.perm) && (i.to !== "/audit" || user.role === "owner"));',
    "owner-only audit nav");
}

// 3) Audit route itself: defense in depth, owner only even if permission is misconfigured.
{
  const path = "src/routes/audit.tsx";
  replaceOnce(path,
    'const { db, allowed } = useApp();',
    'const { db, allowed, user } = useApp();',
    "audit user context");
  replaceOnce(path,
    'if (!allowed("audit.view")) return <Denied />;',
    'if (!allowed("audit.view") || user?.role !== "owner") return <Denied />;',
    "audit owner gate");
}

// 4) Classes: default to running; remove planned from normal UI; do not use same-day end by default.
{
  const path = "src/routes/classes.tsx";
  replaceOnce(path,
    'const EMPTY = {\n  name: "",\n  course_id: "",\n  teacher_id: "",\n  term: "",\n  capacity: "20",\n  start_date: today(),\n  end_date: today(),\n  status: "planned" as Klass["status"],\n};',
    'function defaultClassEndDate() {\n  const date = new Date();\n  date.setFullYear(date.getFullYear() + 1);\n  return date.toISOString().slice(0, 10);\n}\n\nconst EMPTY = {\n  name: "",\n  course_id: "",\n  teacher_id: "",\n  term: "",\n  capacity: "20",\n  start_date: today(),\n  end_date: defaultClassEndDate(),\n  status: "running" as Klass["status"],\n};',
    "running default class");
  replaceOnce(path,
    '<option value="">كل الحالات</option><option value="planned">مخطط</option><option value="running">جارٍ</option><option value="finished">منتهٍ</option>',
    '<option value="">كل الحالات</option><option value="running">جارٍ</option><option value="finished">منتهٍ</option>',
    "remove planned filter");
  replaceOnce(path,
    '{k.status === "running" ? "جارٍ" : k.status === "finished" ? "منتهٍ" : "مخطط"}',
    '{k.status === "finished" ? "منتهٍ" : "جارٍ"}',
    "planned legacy display as running");
  replaceOnce(path,
    '              <option value="planned">مخطط</option>\n              <option value="running">جارٍ</option>\n              <option value="finished">منتهٍ</option>',
    '              <option value="running">جارٍ</option>\n              <option value="finished">منتهٍ</option>',
    "remove planned form option");
}

// 5) Reports wording: separate payment statuses clearly and use numeric month label in table.
{
  const path = "src/routes/reports.tsx";
  replaceOnce(path,
    '<option value="monthly-status">مدفوع / غير مدفوع شهرياً</option>',
    '<option value="monthly-status">حالة الدفع الشهرية</option>',
    "monthly report title");
  replaceOnce(path,
    '<option value="all">الكل</option><option value="paid">مدفوع</option><option value="partial">مدفوع جزئياً</option><option value="unpaid">غير مدفوع</option>',
    '<option value="all">الكل</option><option value="paid">مدفوع بالكامل</option><option value="partial">مدفوع جزئياً</option><option value="unpaid">غير مدفوع</option>',
    "separate payment labels");
  replaceOnce(path,
    '<Td className="font-semibold">{row.student.full_name}</Td><Td>{reportMonth}</Td>',
    '<Td className="font-semibold">{row.student.full_name}</Td><Td>{Number(reportMonth.slice(5, 7))}</Td>',
    "numeric report month");
  replaceOnce(path,
    '{row.status === "paid" ? "مدفوع" : row.status === "partial" ? "جزئي" : "غير مدفوع"}',
    '{row.status === "paid" ? "مدفوع بالكامل" : row.status === "partial" ? "مدفوع جزئياً" : "غير مدفوع"}',
    "monthly row status labels");
}

// 6) Bump patch version for this usability/finance correction line.
{
  const path = "package.json";
  replaceOnce(path, '"version": "1.1.0"', '"version": "1.1.1"', "package version");
}

console.log("Academy Hub v1.1.1 phase 1 transformations applied.");

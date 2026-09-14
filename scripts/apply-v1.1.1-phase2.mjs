import fs from "node:fs";
import path from "node:path";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const appPath = "src/components/AppShell.tsx";
let app = read(appPath);

const navStart = app.indexOf("const NAV = [");
const navEndMarker = "] as const;";
const navEnd = app.indexOf(navEndMarker, navStart);
if (navStart < 0 || navEnd < 0) throw new Error("Could not locate NAV definition");

const nav = `const NAV = [
  {
    group: "الرئيسية",
    theme: {
      panel: "border-sky-400/20 bg-sky-500/5",
      title: "text-sky-200",
      hover: "hover:bg-sky-500/10",
      active: "bg-sky-500/20 text-white ring-1 ring-inset ring-sky-300/20",
    },
    items: [{ to: "/", label: "لوحة المعلومات", perm: "students.view" }],
  },
  {
    group: "الأكاديمي",
    theme: {
      panel: "border-cyan-400/20 bg-cyan-500/5",
      title: "text-cyan-200",
      hover: "hover:bg-cyan-500/10",
      active: "bg-cyan-500/20 text-white ring-1 ring-inset ring-cyan-300/20",
    },
    items: [
      { to: "/students", label: "الطلاب والتسجيل", perm: "students.view" },
      { to: "/courses", label: "العام الدراسي", perm: "courses.view" },
      { to: "/classes", label: "الصفوف", perm: "classes.view" },
    ],
  },
  {
    group: "المالية",
    theme: {
      panel: "border-emerald-400/20 bg-emerald-500/5",
      title: "text-emerald-200",
      hover: "hover:bg-emerald-500/10",
      active: "bg-emerald-500/20 text-white ring-1 ring-inset ring-emerald-300/20",
    },
    items: [
      { to: "/receipts", label: "الفواتير والتحصيل", perm: "finance.view" },
      { to: "/expenses", label: "المصاريف والمداخيل", perm: "expenses.view" },
      { to: "/employees", label: "الموظفون والرواتب", perm: "payroll.view" },
      { to: "/reports", label: "التقارير", perm: "reports.view" },
    ],
  },
  {
    group: "النظام",
    theme: {
      panel: "border-violet-400/20 bg-violet-500/5",
      title: "text-violet-200",
      hover: "hover:bg-violet-500/10",
      active: "bg-violet-500/20 text-white ring-1 ring-inset ring-violet-300/20",
    },
    items: [
      { to: "/settings", label: "الإعدادات", perm: "settings.view" },
      { to: "/users", label: "المستخدمون", perm: "users.view" },
      { to: "/audit", label: "سجل التدقيق", perm: "audit.view" },
      { to: "/backup", label: "النسخ الاحتياطي", perm: "backup.view" },
    ],
  },
] as const;`;
app = app.slice(0, navStart) + nav + app.slice(navEnd + navEndMarker.length);

app = replaceRequired(
  app,
  '<div key={group.group}>',
  '<div key={group.group} className={cn("rounded-xl border p-1.5", group.theme.panel)}>',
  "colored navigation group",
);
app = replaceRequired(
  app,
  '<p className="px-2 pb-1 text-[11px] font-bold uppercase opacity-55">{group.group}</p>',
  '<p className={cn("px-2 pb-1 pt-1 text-[11px] font-bold uppercase", group.theme.title)}>{group.group}</p>',
  "colored navigation heading",
);
app = replaceRequired(
  app,
  '"block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent",\n                        pathname === item.to && "bg-sidebar-accent font-bold",',
  '"block rounded-lg px-3 py-2 text-sm font-medium transition-colors",\n                        group.theme.hover,\n                        pathname === item.to && group.theme.active,\n                        pathname === item.to && "font-bold",',
  "colored navigation links",
);
write(appPath, app);

// Keep internal database field names stable; only user-facing Arabic terminology changes.
const genericCenterFiles = [
  "src/components/AppShell.tsx",
  "src/components/HelpGuide.tsx",
  "src/routes/settings.tsx",
];
for (const file of genericCenterFiles) {
  let content = read(file);
  content = content.replaceAll("المعهد", "المركز التعليمي");
  write(file, content);
}

// Update generic page titles/descriptions without touching the student's school field.
for (const file of fs.readdirSync("src/routes").filter((name) => name.endsWith(".tsx"))) {
  const full = path.join("src/routes", file);
  let content = read(full);
  content = content.replaceAll("نظام إدارة المعهد", "نظام إدارة المركز التعليمي");
  write(full, content);
}

// Bring the built-in guide in line with the recurring academic-year + student-first model.
const guidePath = "src/components/HelpGuide.tsx";
let guide = read(guidePath);
const guideReplacements = [
  ["أضف دورة وصفًا وطالبًا", "أضف عامًا دراسيًا وصفًا وطالبًا"],
  ["الدورات ← الصفوف ← الطلاب ← الإيصالات", "العام الدراسي ← الصفوف ← الطلاب والتسجيل ← الفواتير والتحصيل"],
  ["دورة، ثم صف، ثم طالب، ثم تسجيل.", "عام دراسي، ثم صف، ثم طالب، ثم تسجيل الطالب من بطاقته."],
  ["أضف الدورة وسعرها", "أضف العام الدراسي والقسط الشهري"],
  ["اكتب اسم الدورة والمستوى والسعر الافتراضي. يمكن استخدام السعر لاحقًا عند تسجيل الطالب.", "يُنشأ العام الدراسي حسب السنة الحالية، وحدد القسط الشهري الافتراضي الذي يُستخدم عند تسجيل الطالب."],
  ["الدورات ← دورة جديدة", "العام الدراسي ← عام جديد"],
  ["تصبح الدورة جاهزة لربطها بصف.", "يصبح العام الدراسي جاهزًا لربطه بالصفوف."],
  ["أنشئ صفًا مرتبطًا بالدورة", "أنشئ صفًا مرتبطًا بالعام الدراسي"],
  ["حدد الدورة، اسم الصف، المدرّس، الموعد وتاريخ البداية. بعد وجود تسجيلات لا تغيّر دورة الصف.", "حدد العام الدراسي، اسم الصف والمدرّس والموعد. بعد وجود تسجيلات لا تغيّر العام الدراسي المرتبط بالصف."],
  ["يظهر الصف ضمن الدورة ويمكن استقبال الطلاب.", "يظهر الصف ضمن العام الدراسي ويصبح متاحًا عند تسجيل الطالب."],
  ["افتح الصف ثم المسجلين، اختر الطالب وحدد السعر والخصم ورسوم التسجيل إن وجدت.", "افتح الطالب واضغط تسجيل، ثم اختر العام الدراسي والصف وحدد القسط والخصم ورسوم التسجيل إن وجدت."],
  ["الصف ← المسجلون ← تسجيل طالب", "الطلاب والتسجيل ← الطالب ← تسجيل"],
  ["السنة الدراسية", "العام الدراسي"],
  ["شاشة الإيصالات والفواتير", "شاشة الفواتير والتحصيل"],
  ["الإيصالات والفواتير", "الفواتير والتحصيل"],
];
for (const [from, to] of guideReplacements) guide = guide.replaceAll(from, to);
write(guidePath, guide);

console.log("Applied Academy Hub v1.1.1 phase 2 terminology and navigation styling.");

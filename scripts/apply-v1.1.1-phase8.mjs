import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const recordsPath = "src/lib/records.ts";
let records = read(recordsPath);
records = replaceRequired(
  records,
  '  status: Extract<Student["status"], "active" | "inactive" | "graduated">,\n  actor: Actor,\n): void {\n  transact((db) => {',
  '  status: Student["status"],\n  actor: Actor,\n): void {\n  if (status === "archived") throw new Error("استخدم أمر الأرشفة المخصص بدل تغيير الحالة مباشرة");\n  transact((db) => {',
  "student operational status typing",
);
write(recordsPath, records);

const auditPath = "src/routes/audit.tsx";
let audit = read(auditPath);
audit = replaceRequired(
  audit,
  '      restore: "success",\n      init: "muted",',
  '      restore: "success",\n      status: "primary",\n      "skip-month": "warning",\n      "restore-month": "success",\n      withdraw: "warning",\n      generate: "success",\n      "catch-up": "success",\n      init: "muted",',
  "audit action tones",
);
audit = replaceRequired(
  audit,
  '    restore: "استرجاع",\n    init: "تهيئة",',
  '    restore: "استرجاع",\n    status: "تغيير حالة",\n    "skip-month": "تخطي شهر",\n    "restore-month": "إعادة شهر",\n    withdraw: "إيقاف تسجيل",\n    generate: "توليد شهري",\n    "catch-up": "استكمال شهري",\n    init: "تهيئة",',
  "audit action labels",
);
write(auditPath, audit);

const appPath = "src/components/AppShell.tsx";
let app = read(appPath);
app = replaceRequired(
  app,
  '                <Td className="text-xs">{overdue.map((row) => `${row.period}: ${money(row.due, db.settings.currency)}`).join("، ")}</Td>',
  '                <Td className="text-xs">{overdue.map((row) => { const [year, month] = row.period.split("-"); return `${Number(month)} / ${year}: ${money(row.due, db.settings.currency)}`; }).join("، ")}</Td>',
  "numeric arrears notification months",
);
write(appPath, app);

console.log("Applied Academy Hub v1.1.1 phase 8 typing, audit and notification polish.");

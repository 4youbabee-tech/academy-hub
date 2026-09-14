import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const guardsPath = "src/lib/domain-guards.ts";
let guards = read(guardsPath);
guards = replaceRequired(
  guards,
  `export function assertStudentUpdate(db: DB, student: Student, patch: Partial<Student>): void {\n  if (student.status === "archived" || patch.status !== "archived") return;\n  const hasActiveEnrollment = db.enrollments.some(\n    (enrollment) => enrollment.student_id === student.id && enrollment.status === "active",\n  );\n  if (hasActiveEnrollment) {\n    throw new Error("لا يمكن أرشفة الطالب لأن لديه تسجيلًا نشطًا. أنهِ أو ألغِ التسجيل أولًا.");\n  }\n}`,
  `export function assertStudentUpdate(db: DB, student: Student, patch: Partial<Student>): void {\n  if (!patch.status || patch.status === student.status) return;\n  const hasActiveEnrollment = db.enrollments.some(\n    (enrollment) => enrollment.student_id === student.id && enrollment.status === "active",\n  );\n  if (!hasActiveEnrollment) return;\n  if (patch.status === "archived") {\n    throw new Error("لا يمكن أرشفة الطالب لأن لديه تسجيلًا نشطًا. أنهِ أو ألغِ التسجيل أولًا.");\n  }\n  if (patch.status === "inactive" || patch.status === "graduated") {\n    throw new Error("إيقاف أو تخريج طالب لديه تسجيل نشط يجب أن يتم من شاشة الطالب حتى تتوقف الاستحقاقات المستقبلية بأمان.");\n  }\n}`,
  "student status domain guard",
);
write(guardsPath, guards);

const recordsPath = "src/lib/records.ts";
let records = read(recordsPath);
records = replaceRequired(
  records,
  'import type { ID } from "./types";\n',
  'import type { ID, Student } from "./types";\nimport { localMonthKey } from "./format";\n',
  "records student status imports",
);
records += `\n\n/**\n * Changes the operational status of a student atomically.\n * Stopping/graduating a student stops every active enrollment at the current month,\n * preserving all historical invoices, receipts and already-generated debt.\n */\nexport function setStudentOperationalStatus(\n  studentId: ID,\n  status: Extract<Student["status"], "active" | "inactive" | "graduated">,\n  actor: Actor,\n): void {\n  transact((db) => {\n    const student = db.students.find((item) => item.id === studentId);\n    if (!student) throw new Error("الطالب غير موجود");\n    if (student.status === "archived") throw new Error("استرجع الطالب من الأرشيف أولًا");\n    if (student.status === status) return;\n\n    const now = new Date().toISOString();\n    if (status !== "active") {\n      const period = localMonthKey();\n      for (const enrollment of db.enrollments.filter(\n        (item) => item.student_id === student.id && item.status === "active",\n      )) {\n        if (enrollment.billing_mode === "monthly") enrollment.billing_end_period = period;\n        enrollment.status = "withdrawn";\n        enrollment.updated_at = now;\n        audit(\n          db,\n          actor,\n          "enrollments",\n          enrollment.id,\n          "withdraw",\n          enrollment.billing_mode === "monthly"\n            ? "إيقاف التسجيل الشهري مع نهاية " + period + " بسبب تغيير حالة الطالب"\n            : "إنهاء التسجيل بسبب تغيير حالة الطالب",\n        );\n      }\n    }\n\n    student.status = status;\n    student.archived_at = null;\n    student.updated_at = now;\n    const label = status === "active" ? "نشط" : status === "graduated" ? "متخرّج" : "غير نشط";\n    audit(db, actor, "students", student.id, "status", "تغيير حالة الطالب " + student.full_name + " إلى " + label);\n  });\n}\n`;
write(recordsPath, records);

const studentsPath = "src/routes/students.tsx";
let students = read(studentsPath);
students = replaceRequired(
  students,
  'import { archiveStudent, restoreStudent } from "@/lib/records";\n',
  'import { archiveStudent, restoreStudent, setStudentOperationalStatus } from "@/lib/records";\n',
  "students status action import",
);
students = replaceRequired(
  students,
  `      if (editing) {\n        update(\n          "students",\n          editing.id,\n          {\n            ...form,\n            birth_date: form.birth_date || null,\n            education_level: form.education_level || null,\n          },\n          actor,\n          \`تعديل الطالب \${form.full_name}\`,\n        );\n      } else {`,
  `      if (editing) {\n        const { status: nextStatus, ...profile } = form;\n        update(\n          "students",\n          editing.id,\n          {\n            ...profile,\n            birth_date: form.birth_date || null,\n            education_level: form.education_level || null,\n          },\n          actor,\n          \`تعديل بيانات الطالب \${form.full_name}\`,\n        );\n        if (nextStatus !== editing.status) setStudentOperationalStatus(editing.id, nextStatus, actor);\n      } else {`,
  "student save operational status",
);
write(studentsPath, students);

const monthlyTestPath = "tests/monthly-financial-harness.ts";
let monthlyTest = read(monthlyTestPath);
monthlyTest = replaceRequired(
  monthlyTest,
  'import { runMonthlyGeneration } from "../src/lib/monthly";\n',
  'import { runMonthlyGeneration } from "../src/lib/monthly";\nimport { setStudentOperationalStatus } from "../src/lib/records";\n',
  "monthly student status test import",
);
const statusTest = `\nconst statusDb = emptyDb();\nstatusDb.users.push({ ...baseFields(), id: actor.id, username: "owner-status", full_name: actor.name, password_hash: "x", role: "owner", is_active: true });\nstatusDb.students.push({ ...baseFields(), id: "student-status", code: "ST-STATUS", full_name: "طالب إيقاف", birth_date: null, gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "", address: "", education_level: null, status: "active", archived_at: null, notes: "" });\nstatusDb.courses.push({ ...baseFields(), id: "course-status", name: "2026-2027", code: "", level: "", hours: 0, default_price: 10_000, active: true });\nstatusDb.classes.push({ ...baseFields(), id: "class-status", name: "صف الإيقاف", course_id: "course-status", teacher_id: null, term: "", capacity: 20, start_date: today(), end_date: today(), schedule: [], status: "running" });\nreplaceDb(statusDb);\ncreateMonthlyEnrollmentWithInvoice({ student_id: "student-status", class_id: "class-status", monthly_price: 10_000, discount: 0, start_period: currentPeriod }, actor);\nsetStudentOperationalStatus("student-status", "inactive", actor);\nlet statusCurrent = snapshot()!;\nassert.equal(statusCurrent.students[0]!.status, "inactive");\nassert.equal(statusCurrent.enrollments[0]!.status, "withdrawn");\nassert.equal(statusCurrent.enrollments[0]!.billing_end_period, currentPeriod);\nassert.equal(generateMonthlyStudentCharges(next, actor).created, 0, "inactive student must not receive future monthly debt");\nsetStudentOperationalStatus("student-status", "active", actor);\nstatusCurrent = snapshot()!;\nassert.equal(statusCurrent.students[0]!.status, "active");\nassert.equal(statusCurrent.enrollments[0]!.status, "withdrawn", "reactivating student must not silently reactivate a stopped enrollment");\n\n`;
monthlyTest = replaceRequired(
  monthlyTest,
  'const zeroDb = emptyDb();\n',
  statusTest + 'const zeroDb = emptyDb();\n',
  "student deactivation billing invariant",
);
write(monthlyTestPath, monthlyTest);

const domainTestPath = "tests/domain-harness.ts";
let domainTest = read(domainTestPath);
domainTest = replaceRequired(
  domainTest,
  'import { localDateKey } from "../src/lib/format";\n',
  'import { localDateKey } from "../src/lib/format";\nimport { buildXlsx } from "../src/lib/xlsx";\n',
  "xlsx test import",
);
domainTest = replaceRequired(
  domainTest,
  'process.env.TZ = "Asia/Beirut";\n',
  'process.env.TZ = "Asia/Beirut";\nconst xlsxBytes = buildXlsx("اختبار", [["الاسم", "القيمة"], ["طالب", 12.5]]);\nassert.equal(xlsxBytes[0], 0x50);\nassert.equal(xlsxBytes[1], 0x4b);\nassert.equal(xlsxBytes[xlsxBytes.length - 22], 0x50);\nassert.equal(xlsxBytes[xlsxBytes.length - 21], 0x4b);\nassert.ok(xlsxBytes.length > 500, "xlsx export must produce a real ZIP/OpenXML workbook");\n',
  "xlsx archive regression assertion",
);
write(domainTestPath, domainTest);

console.log("Applied Academy Hub v1.1.1 phase 7 student lifecycle and xlsx regression safeguards.");

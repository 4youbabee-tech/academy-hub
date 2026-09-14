import fs from "node:fs";

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

// Persist skipped billing periods on the enrollment, not on invoices, so future generation remains idempotent.
const typesPath = "src/lib/types.ts";
let types = read(typesPath);
types = replaceRequired(
  types,
  '  discount_title_snapshot?: string;\n  status: "active" | "completed" | "withdrawn" | "cancelled";\n',
  '  discount_title_snapshot?: string;\n  /** Specific YYYY-MM periods intentionally excluded from billing (student did not attend). */\n  skipped_periods?: string[];\n  status: "active" | "completed" | "withdrawn" | "cancelled";\n',
  "enrollment skipped periods",
);
write(typesPath, types);

const financePath = "src/lib/finance.ts";
let finance = read(financePath);
finance = replaceRequired(
  finance,
  '  if (enrollment.status !== "active" && !enrollment.billing_end_period) return false;\n  const invoice = activeEnrollmentInvoice(db, enrollment.id);\n',
  '  if (enrollment.status !== "active" && !enrollment.billing_end_period) return false;\n  if (enrollment.skipped_periods?.includes(period)) return false;\n  const invoice = activeEnrollmentInvoice(db, enrollment.id);\n',
  "skip monthly generation guard",
);
finance = replaceRequired(
  finance,
  '      monthly_price_snapshot: monthlyNet, discount_preset_id: args.discount_preset_id ?? null,\n      discount_title_snapshot: args.discount_title?.trim() ?? "", status: "active",\n',
  '      monthly_price_snapshot: monthlyNet, discount_preset_id: args.discount_preset_id ?? null,\n      discount_title_snapshot: args.discount_title?.trim() ?? "", skipped_periods: [], status: "active",\n',
  "new monthly enrollment skipped periods",
);
finance = replaceRequired(
  finance,
  '      discount_title_snapshot: args.discount_title?.trim() ?? "",\n      status: "active",\n',
  '      discount_title_snapshot: args.discount_title?.trim() ?? "",\n      skipped_periods: [],\n      status: "active",\n',
  "transitioned monthly enrollment skipped periods",
);
finance = replaceRequired(
  finance,
  `export function studentMonthlyLedger(db: DB, studentId: ID): MonthlyLedgerRow[] {`,
  `/** Marks one month as intentionally not attended. It never deletes history. */\nexport function skipMonthlyEnrollmentPeriod(enrollmentId: ID, period: string, reason: string, actor: Actor): void {\n  assertPeriod(period);\n  if (!reason.trim()) throw new Error("سبب تخطي الشهر إلزامي");\n  transact((db) => {\n    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);\n    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");\n    if (enrollment.billing_start_period && period < enrollment.billing_start_period) {\n      throw new Error("لا يمكن تخطي شهر يسبق بداية التسجيل");\n    }\n    if (enrollment.billing_end_period && period > enrollment.billing_end_period) {\n      throw new Error("هذا الشهر خارج فترة التسجيل بعد الإيقاف");\n    }\n    if (enrollment.skipped_periods?.includes(period)) return;\n    const invoice = activeEnrollmentInvoice(db, enrollment.id);\n    if (!invoice) throw new Error("فاتورة التسجيل غير موجودة");\n    const installment = db.installments.find((item) =>\n      item.invoice_id === invoice.id && item.kind === "monthly" && item.period === period && !item.is_void,\n    );\n    if (installment) {\n      const allocated = installmentAllocationMap(db, invoice.id).get(installment.id) ?? 0;\n      if (allocated > 0) throw new Error("لا يمكن تخطي شهر عليه دفعة. ألغِ سند القبض المرتبط أولًا.");\n      installment.is_void = true;\n      installment.void_reason = \\`شهر متخطّى: \\${reason.trim()}\\`;\n      installment.voided_at = new Date().toISOString();\n      installment.updated_at = installment.voided_at;\n      recomputeInvoice(db, invoice.id);\n    }\n    enrollment.skipped_periods = [...new Set([...(enrollment.skipped_periods ?? []), period])].sort();\n    enrollment.updated_at = new Date().toISOString();\n    audit(db, actor, "enrollments", enrollment.id, "skip-month", \\`تخطي شهر \\${period} — \\${reason.trim()}\\`);\n  });\n}\n\n/** Restores a skipped month. If the period is already due, its charge is recreated immediately. */\nexport function restoreMonthlyEnrollmentPeriod(enrollmentId: ID, period: string, actor: Actor): void {\n  assertPeriod(period);\n  transact((db) => {\n    const enrollment = db.enrollments.find((item) => item.id === enrollmentId);\n    if (!enrollment || enrollment.billing_mode !== "monthly") throw new Error("التسجيل الشهري غير موجود");\n    if (!(enrollment.skipped_periods ?? []).includes(period)) throw new Error("هذا الشهر غير متخطّى");\n    enrollment.skipped_periods = (enrollment.skipped_periods ?? []).filter((item) => item !== period);\n    enrollment.updated_at = new Date().toISOString();\n    if (period <= today().slice(0, 7)) createMonthlyChargeInDb(db, enrollment, period);\n    audit(db, actor, "enrollments", enrollment.id, "restore-month", \\`إعادة شهر \\${period} إلى خطة التسجيل\\`);\n  });\n}\n\nexport function studentMonthlyLedger(db: DB, studentId: ID): MonthlyLedgerRow[] {`,
  "skipped month finance functions",
);
write(financePath, finance);

// Student profile becomes the single financial card entry point.
const profilePath = "src/routes/students.$id.tsx";
let profile = read(profilePath);
profile = replaceRequired(
  profile,
  'import { StudentEnrollmentModal } from "@/components/StudentEnrollmentModal";\n',
  'import { StudentEnrollmentModal } from "@/components/StudentEnrollmentModal";\nimport { StudentAnnualBillingCard } from "@/components/StudentAnnualBillingCard";\n',
  "annual billing card import",
);
profile = replaceRequired(
  profile,
  '      <h2 className="mb-2 mt-6 text-sm font-bold">التسجيلات</h2>\n',
  '      <StudentAnnualBillingCard studentId={student.id} />\n\n      <h2 className="mb-2 mt-6 text-sm font-bold">التسجيلات</h2>\n',
  "annual billing card render",
);
write(profilePath, profile);

// Financial invariants for skipped months: no debt, no duplicate generation, restorable history.
const testPath = "tests/monthly-financial-harness.ts";
let test = read(testPath);
test = replaceRequired(
  test,
  '  recordPayment,\n  studentMonthlyLedger,\n',
  '  recordPayment,\n  restoreMonthlyEnrollmentPeriod,\n  skipMonthlyEnrollmentPeriod,\n  studentMonthlyLedger,\n',
  "skip functions test imports",
);
const skipTest = `\nconst skipDb = emptyDb();\nskipDb.users.push({ ...baseFields(), id: actor.id, username: "owner-skip", full_name: actor.name, password_hash: "x", role: "owner", is_active: true });\nskipDb.students.push({ ...baseFields(), id: "student-skip", code: "ST-SKIP", full_name: "طالب تخطي شهر", birth_date: null, gender: "", phone: "", guardian_name: "", guardian_phone: "", mother_name: "", school_name: "", address: "", education_level: null, status: "active", archived_at: null, notes: "" });\nskipDb.courses.push({ ...baseFields(), id: "course-skip", name: "2026-2027", code: "", level: "", hours: 0, default_price: 10_000, active: true });\nskipDb.classes.push({ ...baseFields(), id: "class-skip", name: "صف التخطي", course_id: "course-skip", teacher_id: null, term: "", capacity: 20, start_date: today(), end_date: today(), schedule: [], status: "running" });\nreplaceDb(skipDb);\ncreateMonthlyEnrollmentWithInvoice({ student_id: "student-skip", class_id: "class-skip", monthly_price: 10_000, discount: 0, start_period: currentPeriod }, actor);\nlet skipCurrent = snapshot()!;\nconst skipEnrollmentId = skipCurrent.enrollments[0]!.id;\nskipMonthlyEnrollmentPeriod(skipEnrollmentId, next, "لم يدرس", actor);\nassert.equal(generateMonthlyStudentCharges(next, actor).created, 0, "skipped future month must never generate a charge");\nskipCurrent = snapshot()!;\nassert.equal(studentMonthlyLedger(skipCurrent, "student-skip").some((row) => row.period === next), false);\nassert.deepEqual(skipCurrent.enrollments[0]!.skipped_periods, [next]);\nrestoreMonthlyEnrollmentPeriod(skipEnrollmentId, next, actor);\nassert.equal(generateMonthlyStudentCharges(next, actor).created, 1, "restored future month must become billable again");\nskipCurrent = snapshot()!;\nassert.equal(studentMonthlyLedger(skipCurrent, "student-skip").filter((row) => row.period === next).length, 1);\nskipMonthlyEnrollmentPeriod(skipEnrollmentId, currentPeriod, "توقف مؤقت", actor);\nskipCurrent = snapshot()!;\nassert.equal(studentMonthlyLedger(skipCurrent, "student-skip").some((row) => row.period === currentPeriod), false, "unpaid generated month must be safely voided when skipped");\nrestoreMonthlyEnrollmentPeriod(skipEnrollmentId, currentPeriod, actor);\nskipCurrent = snapshot()!;\nassert.equal(studentMonthlyLedger(skipCurrent, "student-skip").filter((row) => row.period === currentPeriod).length, 1, "restoring a due month must recreate exactly one active charge");\n\n`;
test = replaceRequired(
  test,
  'const zeroDb = emptyDb();\n',
  skipTest + 'const zeroDb = emptyDb();\n',
  "skipped month test block",
);
write(testPath, test);

console.log("Applied Academy Hub v1.1.1 phase 4 skipped-month billing and annual card.");

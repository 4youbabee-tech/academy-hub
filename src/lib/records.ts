import { audit, transact, type Actor } from "./db";
import { assertStudentUpdate } from "./domain-guards";
import type { ID, Student } from "./types";
import { localMonthKey } from "./format";

export function archiveStudent(studentId: ID, actor: Actor): void {
  transact((db) => {
    const student = db.students.find((item) => item.id === studentId);
    if (!student) throw new Error("الطالب غير موجود");
    if (student.status === "archived") throw new Error("الطالب مؤرشف مسبقًا");
    assertStudentUpdate(db, student, { status: "archived" });
    student.status = "archived";
    student.archived_at = new Date().toISOString();
    student.updated_at = student.archived_at;
    audit(db, actor, "students", student.id, "archive", `أرشفة الطالب ${student.full_name}`);
  });
}

export function restoreStudent(studentId: ID, actor: Actor): void {
  transact((db) => {
    const student = db.students.find((item) => item.id === studentId);
    if (!student) throw new Error("الطالب غير موجود");
    if (student.status !== "archived") throw new Error("الطالب غير موجود في الأرشيف");
    student.status = "active";
    student.archived_at = null;
    student.updated_at = new Date().toISOString();
    audit(db, actor, "students", student.id, "restore", `استرجاع الطالب ${student.full_name} من الأرشيف`);
  });
}


/**
 * Changes the operational status of a student atomically.
 * Stopping/graduating a student stops every active enrollment at the current month,
 * preserving all historical invoices, receipts and already-generated debt.
 */
export function setStudentOperationalStatus(
  studentId: ID,
  status: Student["status"],
  actor: Actor,
): void {
  if (status === "archived") throw new Error("استخدم أمر الأرشفة المخصص بدل تغيير الحالة مباشرة");
  transact((db) => {
    const student = db.students.find((item) => item.id === studentId);
    if (!student) throw new Error("الطالب غير موجود");
    if (student.status === "archived") throw new Error("استرجع الطالب من الأرشيف أولًا");
    if (student.status === status) return;

    const now = new Date().toISOString();
    if (status !== "active") {
      const period = localMonthKey();
      for (const enrollment of db.enrollments.filter(
        (item) => item.student_id === student.id && item.status === "active",
      )) {
        if (enrollment.billing_mode === "monthly") enrollment.billing_end_period = period;
        enrollment.status = "withdrawn";
        enrollment.updated_at = now;
        audit(
          db,
          actor,
          "enrollments",
          enrollment.id,
          "withdraw",
          enrollment.billing_mode === "monthly"
            ? "إيقاف التسجيل الشهري مع نهاية " + period + " بسبب تغيير حالة الطالب"
            : "إنهاء التسجيل بسبب تغيير حالة الطالب",
        );
      }
    }

    student.status = status;
    student.archived_at = null;
    student.updated_at = now;
    const label = status === "active" ? "نشط" : status === "graduated" ? "متخرّج" : "غير نشط";
    audit(db, actor, "students", student.id, "status", "تغيير حالة الطالب " + student.full_name + " إلى " + label);
  });
}

import { audit, transact, type Actor } from "./db";
import { assertStudentUpdate } from "./domain-guards";
import type { ID } from "./types";

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

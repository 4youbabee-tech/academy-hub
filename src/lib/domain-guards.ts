import type { Actor } from "./db";
import type { DB, Klass, Student, User } from "./types";

function actorUser(db: DB, actor: Actor): User | undefined {
  return actor.id ? db.users.find((user) => user.id === actor.id && user.is_active) : undefined;
}

function requireOwner(db: DB, actor: Actor): void {
  if (actorUser(db, actor)?.role !== "owner") {
    throw new Error("إدارة حسابات المالك متاحة للمالك فقط");
  }
}

export function assertStudentUpdate(db: DB, student: Student, patch: Partial<Student>): void {
  if (student.status === "archived" || patch.status !== "archived") return;
  const hasActiveEnrollment = db.enrollments.some(
    (enrollment) => enrollment.student_id === student.id && enrollment.status === "active",
  );
  if (hasActiveEnrollment) {
    throw new Error("لا يمكن أرشفة الطالب لأن لديه تسجيلًا نشطًا. أنهِ أو ألغِ التسجيل أولًا.");
  }
}

export function assertClassUpdate(db: DB, klass: Klass, patch: Partial<Klass>): void {
  if (!patch.course_id || patch.course_id === klass.course_id) return;
  if (db.enrollments.some((enrollment) => enrollment.class_id === klass.id)) {
    throw new Error("لا يمكن تغيير دورة الصف بعد وجود تسجيلات عليه حفاظًا على السجلات التاريخية.");
  }
}

export function assertUserCreate(db: DB, data: Partial<User>, actor: Actor): void {
  const username = data.username?.trim().toLowerCase();
  if (!username) throw new Error("اسم المستخدم إلزامي");
  if (db.users.some((user) => user.username.trim().toLowerCase() === username)) {
    throw new Error("اسم المستخدم موجود مسبقًا");
  }
  if (data.role === "owner") requireOwner(db, actor);
}

export function assertUserUpdate(db: DB, target: User, patch: Partial<User>, actor: Actor): void {
  const username = patch.username?.trim().toLowerCase();
  if (username && db.users.some((user) => user.id !== target.id && user.username.trim().toLowerCase() === username)) {
    throw new Error("اسم المستخدم موجود مسبقًا");
  }
  const nextRole = patch.role ?? target.role;
  const nextActive = patch.is_active ?? target.is_active;
  const touchesOwner = target.role === "owner" || nextRole === "owner";
  if (touchesOwner) requireOwner(db, actor);

  const owners = db.users.filter((user) => user.role === "owner");
  const activeOwners = owners.filter((user) => user.is_active);

  if (target.role === "owner" && nextRole !== "owner" && owners.length <= 1) {
    throw new Error("لا يمكن تغيير دور آخر مالك في النظام");
  }
  if (target.role === "owner" && target.is_active && !nextActive && activeOwners.length <= 1) {
    throw new Error("لا يمكن تعطيل آخر مالك نشط في النظام");
  }
}

export function assertUserDelete(db: DB, target: User, actor: Actor): void {
  if (target.role !== "owner") return;
  requireOwner(db, actor);
  if (db.users.filter((user) => user.role === "owner").length <= 1) {
    throw new Error("لا يمكن حذف آخر مالك في النظام");
  }
}

export function assertActiveOwnerExists(db: DB): void {
  if (!db.users.some((user) => user.role === "owner" && user.is_active)) {
    throw new Error("النسخة الاحتياطية لا تحتوي على حساب مالك نشط");
  }
  const usernames = db.users.map((user) => user.username.trim().toLowerCase());
  if (new Set(usernames).size !== usernames.length) {
    throw new Error("النسخة الاحتياطية تحتوي على أسماء مستخدمين مكررة");
  }
}

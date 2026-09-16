import type { RoleKey, User } from "./types";

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "المدير الرئيسي",
  worker: "عامل",
  director: "المدير",
  accountant: "المحاسب",
  secretary: "السكرتير",
  teacher: "المدرّس",
};

export interface PermissionOption {
  key: string;
  label: string;
  group: string;
  dangerous?: boolean;
}

export const PERMISSION_OPTIONS: PermissionOption[] = [
  { key: "students.view", label: "مشاهدة الطلاب", group: "الطلاب" },
  { key: "students.create", label: "إضافة طالب", group: "الطلاب" },
  { key: "students.update", label: "تعديل الطلاب", group: "الطلاب" },
  { key: "students.delete", label: "حذف الطلاب", group: "الطلاب", dangerous: true },
  { key: "courses.view", label: "مشاهدة العام الدراسي", group: "الأكاديمي" },
  { key: "courses.create", label: "إضافة مواد/دورات", group: "الأكاديمي" },
  { key: "courses.update", label: "تعديل المواد/الدورات", group: "الأكاديمي" },
  { key: "classes.view", label: "مشاهدة الصفوف", group: "الأكاديمي" },
  { key: "classes.create", label: "إضافة صف", group: "الأكاديمي" },
  { key: "classes.update", label: "تعديل الصفوف", group: "الأكاديمي" },
  { key: "enrollments.view", label: "مشاهدة التسجيلات", group: "التسجيل" },
  { key: "enrollments.create", label: "تسجيل الطلاب", group: "التسجيل" },
  { key: "enrollments.update", label: "تعديل التسجيلات", group: "التسجيل" },
  { key: "finance.view", label: "مشاهدة الفواتير والتحصيل", group: "المالية" },
  { key: "finance.pay", label: "تسجيل قبض/دفعة", group: "المالية" },
  { key: "finance.update", label: "تعديل العمليات المالية المسموحة", group: "المالية" },
  { key: "payroll.view", label: "مشاهدة الموظفين والرواتب", group: "الموظفون والرواتب" },
  { key: "payroll.pay", label: "دفع الرواتب", group: "الموظفون والرواتب" },
  { key: "payroll.update", label: "تعديل بيانات الرواتب", group: "الموظفون والرواتب" },
  { key: "expenses.view", label: "مشاهدة المصاريف والمداخيل", group: "المصاريف" },
  { key: "expenses.create", label: "إضافة مصروف/دخل", group: "المصاريف" },
  { key: "expenses.update", label: "تعديل المصاريف والمداخيل", group: "المصاريف" },
  { key: "reports.view", label: "الاطلاع على التقارير", group: "التقارير" },
  { key: "settings.view", label: "مشاهدة الإعدادات", group: "النظام" },
  { key: "settings.update", label: "تعديل الإعدادات", group: "النظام" },
  { key: "backup.view", label: "مشاهدة النسخ الاحتياطية", group: "النظام" },
  { key: "backup.create", label: "إنشاء نسخة احتياطية", group: "النظام" },
  { key: "backup.restore", label: "استعادة نسخة احتياطية", group: "النظام", dangerous: true },
  { key: "audit.view", label: "مشاهدة سجل التدقيق", group: "النظام" },
  { key: "users.view", label: "مشاهدة المستخدمين", group: "المستخدمون" },
  { key: "users.create", label: "إضافة مستخدم", group: "المستخدمون" },
  { key: "users.update", label: "تعديل المستخدمين وصلاحياتهم", group: "المستخدمون", dangerous: true },
  { key: "users.delete", label: "حذف المستخدمين", group: "المستخدمون", dangerous: true },
  { key: "system.reset", label: "مسح بيانات التشغيل", group: "النظام", dangerous: true },
];

export const DEFAULT_WORKER_PERMISSIONS = [
  "students.view",
  "students.create",
  "students.update",
  "courses.view",
  "classes.view",
  "enrollments.view",
  "enrollments.create",
  "enrollments.update",
  "finance.view",
  "finance.pay",
] as const;

// Legacy role defaults are kept so existing installations continue to work.
const ALL = "*";
const MATRIX: Record<RoleKey, string[]> = {
  owner: [ALL],
  worker: [...DEFAULT_WORKER_PERMISSIONS],
  director: [
    "students.*",
    "courses.*",
    "classes.*",
    "enrollments.*",
    "finance.*",
    "payroll.*",
    "expenses.*",
    "reports.*",
    "settings.*",
    "users.view",
    "users.create",
    "users.update",
    "users.delete",
    "backup.*",
  ],
  accountant: [
    "students.view",
    "enrollments.view",
    "classes.view",
    "courses.view",
    "finance.*",
    "payroll.*",
    "expenses.*",
    "reports.*",
  ],
  secretary: [
    "students.*",
    "enrollments.*",
    "classes.view",
    "courses.view",
    "finance.view",
    "finance.pay",
    "reports.view",
  ],
  teacher: [
    "classes.view",
    "students.view",
  ],
};

function matches(list: readonly string[], perm: string): boolean {
  const [entity] = perm.split(".");
  return list.some((entry) => entry === ALL || entry === perm || entry === `${entity}.*`);
}

export function can(role: RoleKey | undefined, perm: string): boolean {
  if (!role) return false;
  return matches(MATRIX[role] ?? [], perm);
}

export function canUser(user: User | null | undefined, perm: string): boolean {
  if (!user || !user.is_active) return false;
  if (user.role === "owner") return true;
  if (Array.isArray(user.permissions)) return matches(user.permissions, perm);
  return can(user.role, perm);
}

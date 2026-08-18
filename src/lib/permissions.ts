import type { RoleKey } from "./types";

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "المالك",
  director: "المدير",
  accountant: "المحاسب",
  secretary: "السكرتير",
  teacher: "المدرّس",
};

// entity.action permissions
const ALL = "*";

const MATRIX: Record<RoleKey, string[]> = {
  owner: [ALL],
  director: [
    "students.*", "courses.*", "classes.*", "enrollments.*", "attendance.*",
    "exams.*", "grades.*", "finance.*", "payroll.*", "expenses.*",
    "certificates.*", "reports.*", "settings.*", "users.*", "audit.view", "backup.*",
  ],
  accountant: [
    "students.view", "enrollments.view", "classes.view", "courses.view",
    "finance.*", "payroll.*", "expenses.*", "reports.*", "audit.view",
  ],
  secretary: [
    "students.*", "enrollments.*", "classes.view", "courses.view",
    "attendance.*", "finance.view", "finance.pay", "certificates.view", "reports.view",
  ],
  teacher: [
    "classes.view", "students.view", "attendance.*", "exams.*", "grades.*",
  ],
};

export function can(role: RoleKey | undefined, perm: string): boolean {
  if (!role) return false;
  const list = MATRIX[role] ?? [];
  const [entity] = perm.split(".");
  return list.some((p) => p === ALL || p === perm || p === `${entity}.*`);
}

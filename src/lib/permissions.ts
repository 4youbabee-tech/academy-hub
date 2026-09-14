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
    "students.*",
    "courses.*",
    "classes.*",
    "enrollments.*",
    "finance.*",
    "payroll.*",
    "expenses.*",
    "reports.*",
    "settings.*",
    // Directors manage non-owner accounts; owner-specific guards are enforced in the data layer.
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

export function can(role: RoleKey | undefined, perm: string): boolean {
  if (!role) return false;
  const list = MATRIX[role] ?? [];
  const [entity] = perm.split(".");
  return list.some((p) => p === ALL || p === perm || p === `${entity}.*`);
}

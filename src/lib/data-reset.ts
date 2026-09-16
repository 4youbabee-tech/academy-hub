import { audit, flushDb, replaceDb, snapshot } from "./db";
import { canUser } from "./permissions";
import type { DB, ID } from "./types";

export const DATA_RESET_CONFIRMATION = "مسح البيانات نهائياً";

const OPERATIONAL_COLLECTIONS = [
  "students",
  "courses",
  "classes",
  "enrollments",
  "invoices",
  "installments",
  "payments",
  "employees",
  "payroll_items",
  "payroll_payments",
  "advances",
  "expenses",
  "incomes",
] as const satisfies readonly (keyof DB)[];

export function buildOperationalResetSnapshot(source: DB, userId: ID): DB {
  const user = source.users.find((item) => item.id === userId && item.is_active);
  if (!user || !canUser(user, "system.reset")) {
    throw new Error("لا تملك صلاحية مسح بيانات التشغيل.");
  }

  const next = structuredClone(source);
  for (const collection of OPERATIONAL_COLLECTIONS) {
    next[collection] = [] as never;
  }

  next.settings = {
    ...next.settings,
    student_code_next: 1,
    receipt_next: 1,
    monthly_generation_last_period: null,
  };
  if (next.settings.payroll_receipt_next !== undefined) next.settings.payroll_receipt_next = 1;

  audit(
    next,
    { id: user.id, name: user.full_name },
    "system",
    null,
    "reset-operational-data",
    "مسح بيانات التشغيل بعد تأكيد مزدوج وإنشاء نسخة أمان؛ تم الاحتفاظ بالمستخدمين والإعدادات وسجل التدقيق",
  );

  return next;
}

export async function resetOperationalData(userId: ID): Promise<void> {
  const current = snapshot();
  if (!current) throw new Error("قاعدة البيانات غير جاهزة.");
  replaceDb(buildOperationalResetSnapshot(current, userId));
  await flushDb();
}

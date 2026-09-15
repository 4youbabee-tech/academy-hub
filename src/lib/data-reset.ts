import { audit, flushDb, replaceDb, snapshot } from "./db";
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

export function buildOperationalResetSnapshot(source: DB, ownerUserId: ID): DB {
  const owner = source.users.find((user) => user.id === ownerUserId && user.is_active && user.role === "owner");
  if (!owner) throw new Error("مسح البيانات متاح لمالك النظام النشط فقط.");

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
    { id: owner.id, name: owner.full_name },
    "system",
    null,
    "reset-operational-data",
    "مسح بيانات التشغيل بعد تأكيد مزدوج وإنشاء نسخة أمان؛ تم الاحتفاظ بالمستخدمين والإعدادات وسجل التدقيق",
  );

  return next;
}

export async function resetOperationalData(ownerUserId: ID): Promise<void> {
  const current = snapshot();
  if (!current) throw new Error("قاعدة البيانات غير جاهزة.");
  replaceDb(buildOperationalResetSnapshot(current, ownerUserId));
  await flushDb();
}

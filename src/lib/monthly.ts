import { audit, snapshot, transact, type Actor } from "./db";
import { today } from "./format";
import { generateMonthlyStudentChargesInDb } from "./finance";
import { generatePayrollInDb } from "./payroll";

export interface MonthlyGenerationSummary {
  period: string;
  student_charges_created: number;
  payroll_items_created: number;
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("الفترة الشهرية غير صالحة");
}

export function currentPeriod(): string {
  return today().slice(0, 7);
}

function nextPeriod(period: string): string {
  assertPeriod(period);
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function periodsSince(lastPeriod: string | null, targetPeriod: string): string[] {
  assertPeriod(targetPeriod);
  if (!lastPeriod || lastPeriod >= targetPeriod) return [targetPeriod];
  assertPeriod(lastPeriod);
  const periods: string[] = [];
  let cursor = nextPeriod(lastPeriod);
  while (cursor <= targetPeriod) {
    periods.push(cursor);
    cursor = nextPeriod(cursor);
  }
  return periods;
}

/**
 * Single-transaction monthly cycle. On first activation it only processes the current month, so legacy
 * history is never manufactured. Later startups catch up every missed period. Each underlying generator
 * is idempotent, so it is also safe to run again in the same month for newly added students/employees.
 */
export function runMonthlyGeneration(period = currentPeriod(), actor: Actor): MonthlyGenerationSummary {
  assertPeriod(period);
  const summary: MonthlyGenerationSummary = { period, student_charges_created: 0, payroll_items_created: 0 };
  const lastPeriod = snapshot()?.settings.monthly_generation_last_period ?? null;
  const periods = periodsSince(lastPeriod, period);

  transact((db) => {
    for (const target of periods) {
      summary.student_charges_created += generateMonthlyStudentChargesInDb(db, target);
      summary.payroll_items_created += generatePayrollInDb(db, target);
    }
    if (!db.settings.monthly_generation_last_period || db.settings.monthly_generation_last_period < period) {
      db.settings.monthly_generation_last_period = period;
    }
    if (summary.student_charges_created > 0 || summary.payroll_items_created > 0) {
      audit(db, actor, "monthly_cycle", null, "generate", `الدورة الشهرية حتى ${period}: ${summary.student_charges_created} استحقاق طلاب، ${summary.payroll_items_created} كشف رواتب`);
    }
  });
  return summary;
}

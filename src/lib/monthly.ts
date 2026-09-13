import { audit, transact, type Actor } from "./db";
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

/**
 * Single-transaction monthly cycle. Safe to call on every app startup: generators are idempotent
 * and only create missing student charges and payroll rows for the requested period.
 */
export function runMonthlyGeneration(period = currentPeriod(), actor: Actor): MonthlyGenerationSummary {
  assertPeriod(period);
  const summary: MonthlyGenerationSummary = {
    period,
    student_charges_created: 0,
    payroll_items_created: 0,
  };

  transact((db) => {
    summary.student_charges_created = generateMonthlyStudentChargesInDb(db, period);
    summary.payroll_items_created = generatePayrollInDb(db, period);
    if (summary.student_charges_created > 0 || summary.payroll_items_created > 0) {
      audit(
        db,
        actor,
        "monthly_cycle",
        null,
        "generate",
        `الدورة الشهرية ${period}: ${summary.student_charges_created} استحقاق طلاب، ${summary.payroll_items_created} كشف رواتب`,
      );
    }
  });
  return summary;
}

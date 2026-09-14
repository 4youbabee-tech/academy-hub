import { Field, Select } from "@/components/ui-kit";
import { periodMonth, periodYear, withPeriodMonth, withPeriodYear } from "@/lib/format";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function MonthYearPicker({
  period,
  onChange,
}: {
  period: string;
  onChange: (period: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const selectedYear = periodYear(period);
  const years = Array.from({ length: 21 }, (_, index) => currentYear - 10 + index);

  return (
    <>
      <Field label="الشهر">
        <Select value={String(periodMonth(period))} onChange={(event) => onChange(withPeriodMonth(period, Number(event.target.value)))}>
          {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
        </Select>
      </Field>
      <Field label="السنة">
        <Select value={String(selectedYear)} onChange={(event) => onChange(withPeriodYear(period, Number(event.target.value)))}>
          {!years.includes(selectedYear) ? <option value={selectedYear}>{selectedYear}</option> : null}
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </Select>
      </Field>
    </>
  );
}

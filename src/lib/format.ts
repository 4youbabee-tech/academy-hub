export function money(minor: number, currency = "USD"): string {
  const v = (minor ?? 0) / 100;
  return `${v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function toMinor(input: string | number): number {
  const n = typeof input === "number" ? input : parseFloat(String(input).replace(/,/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromMinor(minor: number): string {
  return ((minor ?? 0) / 100).toFixed(2);
}

export function dateStr(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
    : typeof d === "string"
      ? new Date(d)
      : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar day on this device. Use for accounting filters and date-only fields. */
export function localDateKey(value: string | Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Calendar month on this device (YYYY-MM). */
export function localMonthKey(value: string | Date = new Date()): string {
  return localDateKey(value).slice(0, 7);
}

/** Displays a stored YYYY-MM accounting period using numeric month/year only. */
export function numericMonthPeriodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return period;
  return `${Number(match[2])} / ${match[1]}`;
}

export function periodMonth(period: string): number {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return match ? Number(match[2]) : 1;
}

export function periodYear(period: string): number {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return match ? Number(match[1]) : new Date().getFullYear();
}

export function withPeriodMonth(period: string, month: number): string {
  const safeMonth = Math.min(12, Math.max(1, Math.trunc(month)));
  return `${periodYear(period)}-${pad2(safeMonth)}`;
}

export function withPeriodYear(period: string, year: number): string {
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
  return `${safeYear}-${pad2(periodMonth(period))}`;
}

/** Local timestamp safe for backup filenames. */
export function localFileTimestamp(value: Date = new Date()): string {
  return `${localDateKey(value)}_${pad2(value.getHours())}-${pad2(value.getMinutes())}-${pad2(value.getSeconds())}`;
}

export function today(): string {
  return localDateKey();
}

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

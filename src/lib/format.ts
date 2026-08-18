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
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

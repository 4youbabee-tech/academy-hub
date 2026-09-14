import { invoiceFinancials, invoiceInstallments } from "./finance";
import { dateStr, money, numericMonthPeriodLabel } from "./format";
import { printHtmlDocument } from "./print-document";
import type { DB, Installment, Invoice } from "./types";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

function installmentLabel(item: Installment): string {
  if (item.kind === "registration") return "رسوم التسجيل";
  if (item.kind === "monthly" && item.period) return `استحقاق شهر ${numericMonthPeriodLabel(item.period)}`;
  return `قسط ${item.seq ?? 1}`;
}

export function printInvoice(db: DB, invoice: Invoice): void {
  const settings = db.settings;
  const student = db.students.find((row) => row.id === invoice.student_id);
  const enrollment = db.enrollments.find((row) => row.id === invoice.enrollment_id);
  const klass = db.classes.find((row) => row.id === enrollment?.class_id);
  const course = db.courses.find((row) => row.id === klass?.course_id);
  const financials = invoiceFinancials(db, invoice);
  const installments = invoiceInstallments(db, invoice.id);
  const statusLabel = invoice.status === "paid" ? "مسددة" : invoice.status === "cancelled" ? "ملغاة" : financials.paid > 0 ? "مدفوعة جزئيًا" : "غير مدفوعة";
  const row = (label: string, value: string) => `<div class="row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const installmentRows = installments.map((item) => `
    <tr>
      <td>${esc(installmentLabel(item))}</td>
      <td>${esc(item.period ? numericMonthPeriodLabel(item.period) : dateStr(item.due_date))}</td>
      <td>${esc(item.status === "paid" ? "مدفوع" : item.status === "partial" ? "جزئي" : "مستحق")}</td>
      <td>${esc(money(item.amount, settings.currency))}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8" />
<title>فاتورة ${esc(invoice.number)}</title>
<style>
@page { size:A4; margin:10mm; }
body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; margin:0; padding:10px; color:#111; background:#fff; }
.sheet { max-width:190mm; margin:auto; border:1px solid #ddd; border-radius:10px; padding:18px; }
.header { text-align:center; border-bottom:2px solid #14532d20; padding-bottom:10px; margin-bottom:14px; }
.logo { max-height:72px; max-width:140px; object-fit:contain; }
.name { font-size:22px; font-weight:800; }.sub { color:#666; font-size:12px; }.kind { margin-top:8px; font-size:17px; font-weight:800; }
.row { display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px dashed #e5e7eb; font-size:13px; }
.meta { display:grid; grid-template-columns:1fr 1fr; gap:0 20px; }
table { width:100%; border-collapse:collapse; margin-top:14px; font-size:12px; } th,td { border:1px solid #e5e7eb; padding:8px; text-align:right; } th { background:#f8fafc; }
.summary { margin-top:16px; margin-right:auto; max-width:380px; border:1px solid #e5e7eb; border-radius:8px; padding:10px; background:#fafafa; }
.cancelled { margin-top:8px; border:2px solid #b91c1c; color:#b91c1c; padding:8px; border-radius:8px; font-weight:800; }
.sign { display:flex; justify-content:space-between; margin-top:32px; font-size:12px; }.footer { text-align:center; color:#777; font-size:11px; margin-top:18px; border-top:1px solid #eee; padding-top:8px; }
@media print { body { padding:0; } .sheet { border:0; } }
</style></head><body><div class="sheet">
<div class="header">
${settings.receipt_show_logo !== false && settings.logo_data_url ? `<img class="logo" src="${settings.logo_data_url}" />` : ""}
<div class="name">${esc(settings.institute_name)}</div><div class="sub">${esc(settings.address)}</div><div class="sub">${esc(settings.phone)}</div><div class="kind">فاتورة طالب</div>
${invoice.status === "cancelled" ? `<div class="cancelled">فاتورة ملغاة — نسخة تاريخية للطباعة فقط</div>` : ""}
</div>
<div class="meta">${row("رقم الفاتورة", invoice.number)}${row("تاريخ الإصدار", dateStr(invoice.issued_at))}${row("الطالب", `${student?.full_name ?? "—"} (${student?.code ?? "—"})`)}${row("ولي الأمر", student?.guardian_name || "—")}${row("العام الدراسي / الصف", `${course?.name ?? "—"}${klass ? ` — ${klass.name}` : ""}`)}${row("الحالة", statusLabel)}</div>
<table><thead><tr><th>البيان</th><th>الفترة / الاستحقاق</th><th>الحالة</th><th>القيمة</th></tr></thead><tbody>${installmentRows || `<tr><td colspan="4">لا توجد بنود تفصيلية.</td></tr>`}</tbody></table>
<div class="summary">${row("إجمالي المستحق", money(invoice.total, settings.currency))}${row("إجمالي المقبوض", money(financials.paid, settings.currency))}${row("المتبقي", money(financials.due, settings.currency))}</div>
<div class="sign"><span>توقيع الإدارة: ..................</span><span>توقيع ولي الأمر: ..................</span></div>
<div class="footer">${esc(settings.receipt_footer_text || "شكراً لثقتكم بنا")}</div>
</div></body></html>`;

  printHtmlDocument(html, "A4");
}

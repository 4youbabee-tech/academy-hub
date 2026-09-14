import type { DB, PayrollItem, PayrollPayment } from "./types";
import { dateStr, money } from "./format";
import { printHtmlDocument } from "./print-document";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] || ch);
}

function historicalPaidBefore(db: DB, item: PayrollItem, payment: PayrollPayment): number {
  const rows = db.payroll_payments
    .filter((row) => row.payroll_item_id === item.id && !row.is_void)
    .slice()
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at) || a.created_at.localeCompare(b.created_at));
  let total = 0;
  for (const row of rows) {
    if (row.id === payment.id) return total;
    total += row.amount;
  }
  return Math.max(0, total - payment.amount);
}

export function printPayrollPaymentReceipt(db: DB, item: PayrollItem, payment: PayrollPayment): void {
  if (payment.is_void) throw new Error("لا يمكن طباعة دفعة راتب ملغاة كسند ساري");
  const employee = db.employees.find((row) => row.id === item.employee_id);
  const settings = db.settings;
  const paidBefore = payment.paid_before_snapshot ?? historicalPaidBefore(db, item, payment);
  const paidAfter = payment.paid_after_snapshot ?? paidBefore + payment.amount;
  const remainingAfter = payment.remaining_after_snapshot ?? Math.max(0, item.net - paidAfter);
  const netSnapshot = payment.payroll_net_snapshot ?? item.net;
  const employeeName = employee?.full_name ?? "—";
  const jobTitle = employee?.job_title || (employee?.kind === "teacher" ? "مدرّس" : "موظف");
  const reference = payment.id.slice(0, 8).toUpperCase();

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>سند صرف راتب - ${escapeHtml(employeeName)}</title>
  <style>
    @page { size: A5; margin: 8mm; }
    body { font-family: Arial, sans-serif; direction: rtl; margin: 0; padding: 10px; color: #111; background: #fff; }
    .slip { max-width: 148mm; margin: auto; border: 1px solid #d6d6d6; border-radius: 10px; padding: 16px; }
    .header { text-align: center; border-bottom: 2px solid #1f6b5c; padding-bottom: 10px; margin-bottom: 12px; }
    .logo { max-height: 64px; max-width: 150px; margin-bottom: 6px; }
    .center-name { font-size: 20px; font-weight: 800; }
    .muted { font-size: 12px; color: #666; }
    .title { margin-top: 7px; font-size: 16px; font-weight: 800; }
    .row { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; border-bottom: 1px dashed #e5e5e5; font-size: 13px; }
    .row b { text-align: left; }
    .payment { margin-top: 12px; padding: 10px; border: 1px solid #dfe8e5; border-radius: 8px; font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; }
    .signatures { display: flex; justify-content: space-between; gap: 20px; margin-top: 30px; font-size: 12px; }
    .footer { margin-top: 18px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 8px; }
    @media print { body { padding: 0; } .slip { border: none; } }
  </style>
</head>
<body>
  <div class="slip">
    <div class="header">
      ${settings.logo_data_url ? `<img class="logo" src="${settings.logo_data_url}" alt="شعار المركز التعليمي" />` : ""}
      <div class="center-name">${escapeHtml(settings.institute_name)}</div>
      ${settings.address ? `<div class="muted">${escapeHtml(settings.address)}</div>` : ""}
      ${settings.phone ? `<div class="muted">${escapeHtml(settings.phone)}</div>` : ""}
      <div class="title">سند صرف دفعة راتب</div>
      <div class="muted">مرجع: ${escapeHtml(reference)}</div>
    </div>

    <div class="row"><span>الموظف</span><b>${escapeHtml(employeeName)}</b></div>
    <div class="row"><span>المسمى الوظيفي</span><b>${escapeHtml(jobTitle)}</b></div>
    <div class="row"><span>شهر الراتب</span><b>${escapeHtml(item.period)}</b></div>
    <div class="row"><span>تاريخ الدفعة</span><b>${escapeHtml(dateStr(payment.paid_at))}</b></div>
    <div class="row"><span>صافي الراتب المستحق</span><b>${escapeHtml(money(netSnapshot, settings.currency))}</b></div>
    <div class="row"><span>المدفوع قبل هذه الدفعة</span><b>${escapeHtml(money(paidBefore, settings.currency))}</b></div>
    <div class="payment"><span>قيمة هذه الدفعة</span><span>${escapeHtml(money(payment.amount, settings.currency))}</span></div>
    <div class="row"><span>إجمالي المدفوع بعدها</span><b>${escapeHtml(money(paidAfter, settings.currency))}</b></div>
    <div class="row"><span>المتبقي بعد الدفعة</span><b>${escapeHtml(money(remainingAfter, settings.currency))}</b></div>
    ${payment.note ? `<div class="row"><span>ملاحظة</span><b>${escapeHtml(payment.note)}</b></div>` : ""}

    <div class="signatures">
      <span>توقيع الموظف: ......................</span>
      <span>توقيع الإدارة: ......................</span>
    </div>
    <div class="footer">سند صرف صادر من نظام إدارة المركز التعليمي</div>
  </div>
</body>
</html>`;

  printHtmlDocument(html, "A5");
}

import type { DB, PayrollItem, PayrollPayment } from "./types";
import { dateStr, money, numericMonthPeriodLabel } from "./format";
import { printHtmlDocument } from "./print-document";
import { payrollSettlementRows } from "./payroll-settlement";

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
    .filter((row) => row.payroll_item_id === item.id && (!row.is_void || row.id === payment.id))
    .slice()
    .sort((a, b) => a.paid_at.localeCompare(b.paid_at) || a.created_at.localeCompare(b.created_at));
  let total = 0;
  for (const row of rows) {
    if (row.id === payment.id) return total;
    total += row.amount;
  }
  return Math.max(0, total - payment.amount);
}

/** Prints either a legacy one-month salary payment or one grouped multi-month settlement. */
export function printPayrollPaymentReceipt(db: DB, item: PayrollItem, payment: PayrollPayment): void {
  const group = payrollSettlementRows(db, payment);
  const employee = db.employees.find((row) => row.id === payment.employee_id);
  const settings = db.settings;
  const employeeName = employee?.full_name ?? "—";
  const jobTitle = employee?.job_title || (employee?.kind === "teacher" ? "مدرّس" : "موظف");
  const groupVoid = group.every((row) => row.is_void);
  const totalPayment = group.reduce((sum, row) => sum + row.amount, 0);
  const reference = payment.settlement_no ?? payment.id.slice(0, 8).toUpperCase();

  const allocations = group.map((row) => {
    const payrollItem = db.payroll_items.find((candidate) => candidate.id === row.payroll_item_id);
    const paidBefore = row.paid_before_snapshot
      ?? (payrollItem ? historicalPaidBefore(db, payrollItem, row) : 0);
    const net = row.payroll_net_snapshot ?? payrollItem?.net ?? 0;
    const paidAfter = row.paid_after_snapshot ?? paidBefore + row.amount;
    const remainingAfter = row.remaining_after_snapshot ?? Math.max(0, net - paidAfter);
    return { row, payrollItem, paidBefore, net, paidAfter, remainingAfter };
  });

  const allocationHtml = allocations.map(({ row, payrollItem, remainingAfter }) => `
    <div class="allocation">
      <div><b>${escapeHtml(payrollItem ? numericMonthPeriodLabel(payrollItem.period) : "شهر غير معروف")}</b></div>
      <div>${escapeHtml(money(row.amount, settings.currency))}</div>
      <div class="muted">المتبقي لهذا الشهر بعد الدفعة: ${escapeHtml(money(remainingAfter, settings.currency))}</div>
    </div>`).join("");

  const legacyItem = group.length === 1 ? (allocations[0]?.payrollItem ?? item) : null;
  const legacyPaidBefore = allocations[0]?.paidBefore ?? 0;
  const legacyPaidAfter = allocations[0]?.paidAfter ?? 0;
  const legacyRemaining = allocations[0]?.remainingAfter ?? 0;
  const legacyNet = allocations[0]?.net ?? item.net;

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
    .allocations { margin-top: 12px; border: 1px solid #dfe8e5; border-radius: 8px; padding: 8px; }
    .allocation { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 7px 0; border-bottom: 1px dashed #e5e5e5; font-size: 13px; }
    .allocation:last-child { border-bottom: 0; }
    .allocation .muted { grid-column: 1 / -1; }
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
      <div class="title">${groupVoid ? "نسخة سند صرف راتب ملغى" : "سند صرف راتب"}</div>
      <div class="muted">مرجع: ${escapeHtml(reference)}</div>
      ${groupVoid ? `<div style="margin-top:8px;padding:8px;border:2px solid #b91c1c;color:#b91c1c;font-weight:800;border-radius:8px;">ملغى — ${escapeHtml(payment.void_reason || "بدون سبب مسجل")}</div>` : ""}
    </div>

    <div class="row"><span>الموظف</span><b>${escapeHtml(employeeName)}</b></div>
    <div class="row"><span>المسمى الوظيفي</span><b>${escapeHtml(jobTitle)}</b></div>
    <div class="row"><span>تاريخ الدفعة</span><b>${escapeHtml(dateStr(payment.paid_at))}</b></div>
    ${group.length > 1 ? `
      <div class="allocations">
        <div class="title" style="font-size:13px;margin:0 0 4px;">توزيع الدفعة على الأشهر</div>
        ${allocationHtml}
      </div>` : `
      <div class="row"><span>شهر الراتب</span><b>${escapeHtml(legacyItem ? numericMonthPeriodLabel(legacyItem.period) : "—")}</b></div>
      <div class="row"><span>صافي الراتب المستحق</span><b>${escapeHtml(money(legacyNet, settings.currency))}</b></div>
      <div class="row"><span>المدفوع قبل هذه الدفعة</span><b>${escapeHtml(money(legacyPaidBefore, settings.currency))}</b></div>
      <div class="row"><span>إجمالي المدفوع بعدها</span><b>${escapeHtml(money(legacyPaidAfter, settings.currency))}</b></div>
      <div class="row"><span>المتبقي بعد الدفعة</span><b>${escapeHtml(money(legacyRemaining, settings.currency))}</b></div>`}
    <div class="payment"><span>إجمالي هذه الدفعة</span><span>${escapeHtml(money(totalPayment, settings.currency))}</span></div>
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

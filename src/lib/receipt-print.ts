import { money, numericMonthPeriodLabel } from "./format";
import { printHtmlDocument } from "./print-document";
import { receiptGroupRows } from "./student-settlement";
import type { DB, Installment, Payment } from "./types";

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function paymentOrder(a: Payment, b: Payment): number {
  const byPaidAt = a.paid_at.localeCompare(b.paid_at);
  if (byPaidAt !== 0) return byPaidAt;
  const byCreatedAt = a.created_at.localeCompare(b.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;
  return a.receipt_no.localeCompare(b.receipt_no);
}

function installmentLabel(installment: Installment | undefined): string {
  if (!installment) return "دفعة على الفاتورة";
  if (installment.kind === "registration") return "رسوم التسجيل";
  if (installment.kind === "monthly" && installment.period) return `شهر ${numericMonthPeriodLabel(installment.period)}`;
  return `قسط ${installment.seq ?? 1}`;
}

/** Prints one user-visible receipt, including all month/installment allocations that share its group id. */
export function printReceipt(db: DB, payment: Payment): void {
  const s = db.settings;
  const groupRows = receiptGroupRows(db, payment);
  const groupIds = new Set(groupRows.map((row) => row.id));
  const student = db.students.find((x) => x.id === payment.student_id);
  const invoice = db.invoices.find((i) => i.id === payment.invoice_id);
  const enrollment = db.enrollments.find((e) => e.id === invoice?.enrollment_id);
  const klass = db.classes.find((c) => c.id === enrollment?.class_id);
  const course = db.courses.find((c) => c.id === klass?.course_id);
  const statement = payment.note?.trim() || "دفعة";
  const groupAmount = groupRows.reduce((sum, row) => sum + row.amount, 0);
  const groupVoid = groupRows.every((row) => row.is_void);

  const validPayments = db.payments
    .filter((p) => p.invoice_id === payment.invoice_id && (!p.is_void || groupIds.has(p.id)))
    .slice()
    .sort(paymentOrder);
  const groupLastIndex = validPayments.reduce((latest, row, index) => groupIds.has(row.id) ? index : latest, -1);
  const throughGroup = groupLastIndex >= 0 ? validPayments.slice(0, groupLastIndex + 1) : [];
  const snapshotPaid = groupRows.find((row) => typeof row.paid_after_snapshot === "number")?.paid_after_snapshot;
  const snapshotDue = groupRows.find((row) => typeof row.due_after_snapshot === "number")?.due_after_snapshot;
  const snapshotTotal = groupRows.find((row) => typeof row.invoice_total_snapshot === "number")?.invoice_total_snapshot;
  const paidThroughThisReceipt = snapshotPaid ?? throughGroup.reduce((sum, p) => sum + p.amount, 0);
  const invoiceTotal = snapshotTotal ?? invoice?.total ?? 0;
  const remainingAfterThisReceipt = snapshotDue ?? Math.max(0, invoiceTotal - paidThroughThisReceipt);

  const allocations = groupRows.map((row) => {
    const installment = row.installment_id ? db.installments.find((item) => item.id === row.installment_id) : undefined;
    return { label: installmentLabel(installment), amount: row.amount };
  });

  const width = (s.receipt_paper_size || "A5") === "A4" ? "210mm" : "148mm";
  const methodLabel = payment.method === "cash" ? "نقدًا" : payment.method === "bank" ? "مصرف" : "أخرى";
  const row = (k: string, v: string) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const pageSize = (s.receipt_paper_size || "A5") === "A4" ? "A4" : "A5";
  const allocationHtml = allocations.length > 1 || payment.receipt_group_id
    ? `<div class="allocations"><div class="allocation-title">توزيع الدفعة</div>${allocations.map((allocation) => row(allocation.label, money(allocation.amount, s.currency))).join("")}</div>`
    : allocations.length === 1
      ? `<div class="allocations">${row("عن", `${allocations[0]?.label ?? "دفعة"}`)}</div>`
      : "";

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>سند قبض ${esc(payment.receipt_no)}</title>
<style>
  @page { size: ${(s.receipt_paper_size || "A5") === "A4" ? "A4" : "A5"}; margin: 8mm; }
  body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; background:#fff; color:#111; margin:0; padding:10px; }
  .receipt { max-width:${width}; margin:auto; border:1px solid #d5d5d5; border-radius:10px; padding:16px; }
  .header { text-align:center; border-bottom:2px solid #14532d20; padding-bottom:8px; margin-bottom:10px; }
  .logo { max-height:64px; max-width:120px; object-fit:contain; margin-bottom:6px; }
  .title { font-size:20px; font-weight:800; }
  .sub { font-size:12px; color:#555; }
  .kind { margin-top:6px; font-size:15px; font-weight:800; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:5px 0; border-bottom:1px dashed #eee; font-size:13px; }
  .summary,.allocations { margin-top:10px; padding:9px; border:1px solid #e5e7eb; border-radius:8px; background:#fafafa; }
  .allocation-title { font-size:12px; font-weight:800; margin-bottom:4px; }
  .total { margin-top:12px; font-size:19px; font-weight:800; text-align:left; }
  .sign { display:flex; justify-content:space-between; margin-top:26px; font-size:12px; color:#444; }
  .footer { margin-top:14px; text-align:center; font-size:11px; color:#888; border-top:1px solid #eee; padding-top:8px; }
  @media print { body { padding:0; } .receipt { border:none; } }
</style></head><body><div class="receipt">
  <div class="header">
    ${s.receipt_show_logo !== false && s.logo_data_url ? `<img class="logo" src="${s.logo_data_url}" />` : ""}
    <div class="title">${esc(s.institute_name)}</div>
    <div class="sub">${esc(s.address)}</div>
    <div class="sub">${esc(s.phone)}</div>
    <div class="kind">${groupVoid || invoice?.status === "cancelled" ? "نسخة سند قبض تاريخي" : "سند قبض"}</div>
    ${groupVoid ? `<div style="margin-top:8px;padding:8px;border:2px solid #b91c1c;color:#b91c1c;font-weight:800;border-radius:8px;">السند ملغى — ${esc(payment.void_reason || "بدون سبب مسجل")}</div>` : ""}
    ${!groupVoid && invoice?.status === "cancelled" ? `<div style="margin-top:8px;padding:8px;border:2px solid #b45309;color:#92400e;font-weight:800;border-radius:8px;">الفاتورة المرتبطة بهذا السند ملغاة — هذه نسخة تاريخية لإعادة الطباعة فقط</div>` : ""}
  </div>
  ${row("رقم السند", payment.receipt_no)}
  ${row("التاريخ", new Date(payment.paid_at).toLocaleString("ar-EG"))}
  ${row("الطالب", `${student?.full_name ?? "—"} (${student?.code ?? "—"})`)}
  ${s.receipt_show_guardian !== false ? row("ولي الأمر", student?.guardian_name || "—") : ""}
  ${row("العام الدراسي / الصف", `${course?.name ?? "—"}${klass ? " — " + klass.name : ""}`)}
  ${row("الفاتورة", invoice?.number ?? "—")}
  ${row("البيان", statement)}
  ${s.receipt_show_payment_method !== false ? row("طريقة الدفع", methodLabel) : ""}
  ${allocationHtml}
  <div class="summary">
    ${row("إجمالي المستحق", money(invoiceTotal, s.currency))}
    ${row("المقبوض حتى هذا السند", money(paidThroughThisReceipt, s.currency))}
    ${row("المتبقي بعد هذا السند", money(remainingAfterThisReceipt, s.currency))}
  </div>
  <div class="total">المقبوض بهذا السند: ${esc(money(groupAmount, s.currency))}</div>
  <div class="sign"><span>توقيع المحاسب: ..................</span><span>توقيع المستلم: ..................</span></div>
  <div class="footer">${esc(s.receipt_footer_text || "شكراً لثقتكم بنا")}</div>
</div></body></html>`;

  printHtmlDocument(html, pageSize);
}

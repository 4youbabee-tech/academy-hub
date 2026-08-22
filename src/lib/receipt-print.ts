import { installmentLabel } from "./finance";
import { money } from "./format";
import type { DB, Payment } from "./types";

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Prints an A5 (or A4) receipt for a payment — used from the receipts page and the student file. */
export function printReceipt(db: DB, payment: Payment): void {
  const s = db.settings;
  const student = db.students.find((x) => x.id === payment.student_id);
  const invoice = db.invoices.find((i) => i.id === payment.invoice_id);
  const enrollment = db.enrollments.find((e) => e.id === invoice?.enrollment_id);
  const klass = db.classes.find((c) => c.id === enrollment?.class_id);
  const course = db.courses.find((c) => c.id === klass?.course_id);
  const inst = db.installments.find((i) => i.id === payment.installment_id);
  const kindLabel = inst ? installmentLabel(inst) : "دفعة على الحساب";

  const paidAll = db.payments
    .filter((p) => p.invoice_id === payment.invoice_id && !p.is_void)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, (invoice?.total ?? 0) - paidAll);

  const width = (s.receipt_paper_size || "A5") === "A4" ? "210mm" : "148mm";
  const methodLabel = payment.method === "cash" ? "نقدًا" : payment.method === "bank" ? "مصرف" : "أخرى";
  const win = window.open("", "_blank");
  if (!win) return;

  const row = (k: string, v: string) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>سند قبض ${esc(payment.receipt_no)}</title>
<style>
  @page { size: ${(s.receipt_paper_size || "A5") === "A4" ? "A4" : "A5"}; margin: 8mm; }
  body { font-family: 'Cairo','Segoe UI',Arial,sans-serif; direction: rtl; background:#fff; color:#111; margin:0; padding:10px; }
  .receipt { max-width:${width}; margin:auto; border:1px solid #d5d5d5; border-radius:10px; padding:16px; }
  .header { text-align:center; border-bottom:2px solid #14532d20; padding-bottom:8px; margin-bottom:10px; }
  .logo { max-height:64px; margin-bottom:6px; }
  .title { font-size:20px; font-weight:800; }
  .sub { font-size:12px; color:#555; }
  .kind { margin-top:6px; font-size:15px; font-weight:800; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:5px 0; border-bottom:1px dashed #eee; font-size:13px; }
  .total { margin-top:12px; font-size:19px; font-weight:800; text-align:left; }
  .sign { display:flex; justify-content:space-between; margin-top:26px; font-size:12px; color:#444; }
  .footer { margin-top:14px; text-align:center; font-size:11px; color:#888; border-top:1px solid #eee; padding-top:8px; }
  .void { color:#b00; font-weight:800; text-align:center; margin-top:6px; }
</style></head><body><div class="receipt">
  <div class="header">
    ${s.receipt_show_logo !== false && s.logo_data_url ? `<img class="logo" src="${s.logo_data_url}" />` : ""}
    <div class="title">${esc(s.institute_name)}</div>
    <div class="sub">${esc(s.address)}</div>
    <div class="sub">${esc(s.phone)}</div>
    <div class="kind">سند قبض — ${esc(kindLabel)}</div>
  </div>
  ${row("رقم السند", payment.receipt_no)}
  ${row("التاريخ", new Date(payment.paid_at).toLocaleString("ar-EG"))}
  ${row("الطالب", `${student?.full_name ?? "—"} (${student?.code ?? "—"})`)}
  ${s.receipt_show_guardian !== false ? row("ولي الأمر", student?.guardian_name || "—") : ""}
  ${row("الدورة / الصف", `${course?.name ?? "—"}${klass ? " — " + klass.name : ""}`)}
  ${row("الفاتورة", invoice?.number ?? "—")}
  ${row("نوع الدفعة", kindLabel)}
  ${s.receipt_show_payment_method !== false ? row("طريقة الدفع", methodLabel) : ""}
  ${row("إجمالي قيمة الدورة", money(invoice?.total ?? 0, s.currency))}
  ${row("المتبقي بعد هذا السند", money(remaining, s.currency))}
  ${s.receipt_show_notes !== false && payment.note ? row("ملاحظات", payment.note) : ""}
  <div class="total">المبلغ المقبوض: ${esc(money(payment.amount, s.currency))}</div>
  ${payment.is_void ? `<div class="void">سند ملغى — ${esc(payment.void_reason)}</div>` : ""}
  <div class="sign"><span>توقيع المحاسب: ..................</span><span>توقيع المستلم: ..................</span></div>
  <div class="footer">${esc(s.receipt_footer_text || "شكراً لثقتكم بنا")}</div>
</div><script>setTimeout(function(){window.print();},400);<\/script></body></html>`);
  win.document.close();
}

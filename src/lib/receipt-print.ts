import { money } from "./format";
import type { DB, Payment } from "./types";

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function paymentOrder(a: Payment, b: Payment): number {
  const byPaidAt = a.paid_at.localeCompare(b.paid_at);
  if (byPaidAt !== 0) return byPaidAt;

  const byCreatedAt = a.created_at.localeCompare(b.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.receipt_no.localeCompare(b.receipt_no);
}

/** Prints an A5 (or A4) receipt for a payment — used from the receipts page and the student file. */
export function printReceipt(db: DB, payment: Payment): void {
  const s = db.settings;
  const student = db.students.find((x) => x.id === payment.student_id);
  const invoice = db.invoices.find((i) => i.id === payment.invoice_id);
  if (payment.is_void || invoice?.status === "cancelled") return;
  const enrollment = db.enrollments.find((e) => e.id === invoice?.enrollment_id);
  const klass = db.classes.find((c) => c.id === enrollment?.class_id);
  const course = db.courses.find((c) => c.id === klass?.course_id);
  const statement = payment.note?.trim() || "دفعة";

  // نحسب الرصيد كما كان مباشرة بعد هذا السند، وليس الرصيد الحالي بعد دفعات لاحقة.
  const validPayments = db.payments
    .filter((p) => p.invoice_id === payment.invoice_id && !p.is_void)
    .slice()
    .sort(paymentOrder);

  const currentIndex = validPayments.findIndex((p) => p.id === payment.id);
  const throughCurrent = currentIndex >= 0 ? validPayments.slice(0, currentIndex + 1) : [];
  const paidThroughThisReceipt = payment.paid_after_snapshot
    ?? throughCurrent.reduce((sum, p) => sum + p.amount, 0);
  const invoiceTotal = payment.invoice_total_snapshot ?? invoice?.total ?? 0;
  const remainingAfterThisReceipt = payment.due_after_snapshot
    ?? Math.max(0, invoiceTotal - paidThroughThisReceipt);

  const width = (s.receipt_paper_size || "A5") === "A4" ? "210mm" : "148mm";
  const methodLabel = payment.method === "cash" ? "نقدًا" : payment.method === "bank" ? "مصرف" : "أخرى";
  const win = window.open("", "_blank");
  if (!win) return;

  const row = (k: string, v: string) => `<div class="row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
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
  .summary { margin-top:10px; padding:9px; border:1px solid #e5e7eb; border-radius:8px; background:#fafafa; }
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
    <div class="kind">سند قبض</div>
  </div>
  ${row("رقم السند", payment.receipt_no)}
  ${row("التاريخ", new Date(payment.paid_at).toLocaleString("ar-EG"))}
  ${row("الطالب", `${student?.full_name ?? "—"} (${student?.code ?? "—"})`)}
  ${s.receipt_show_guardian !== false ? row("ولي الأمر", student?.guardian_name || "—") : ""}
  ${row("الدورة / الصف", `${course?.name ?? "—"}${klass ? " — " + klass.name : ""}`)}
  ${row("الفاتورة", invoice?.number ?? "—")}
  ${row("البيان", statement)}
  ${s.receipt_show_payment_method !== false ? row("طريقة الدفع", methodLabel) : ""}

  <div class="summary">
    ${row("إجمالي المستحق", money(invoiceTotal, s.currency))}
    ${row("المقبوض حتى هذا السند", money(paidThroughThisReceipt, s.currency))}
    ${row("المتبقي بعد هذا السند", money(remainingAfterThisReceipt, s.currency))}
  </div>

  <div class="total">المقبوض بهذا السند: ${esc(money(payment.amount, s.currency))}</div>
  <div class="sign"><span>توقيع المحاسب: ..................</span><span>توقيع المستلم: ..................</span></div>
  <div class="footer">${esc(s.receipt_footer_text || "شكراً لثقتكم بنا")}</div>
</div><script>setTimeout(function(){window.print();},400);</script></body></html>`);
  win.document.close();
}

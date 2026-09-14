import { invoiceFinancials, studentBalance } from "./finance";
import { dateStr, money } from "./format";
import { printHtmlDocument } from "./print-document";
import type { DB, ID } from "./types";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

export function printStudentStatement(db: DB, studentId: ID): void {
  const student = db.students.find((row) => row.id === studentId);
  if (!student) throw new Error("الطالب غير موجود");
  const settings = db.settings;
  const balance = studentBalance(db, student.id);
  const invoices = db.invoices
    .filter((invoice) => invoice.student_id === student.id)
    .slice()
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  const rows = invoices.map((invoice) => {
    const financials = invoiceFinancials(db, invoice);
    const enrollment = db.enrollments.find((item) => item.id === invoice.enrollment_id);
    const klass = db.classes.find((item) => item.id === enrollment?.class_id);
    const course = db.courses.find((item) => item.id === klass?.course_id);
    const status = invoice.status === "cancelled" ? "ملغاة" : financials.due <= 0 ? "مسددة" : financials.paid > 0 ? "جزئية" : "عليها رصيد";
    return `<tr><td>${esc(invoice.number)}</td><td>${esc(`${course?.name ?? "—"}${klass ? ` — ${klass.name}` : ""}`)}</td><td>${esc(money(invoice.total, settings.currency))}</td><td>${esc(money(financials.paid, settings.currency))}</td><td>${esc(money(financials.due, settings.currency))}</td><td>${esc(status)}</td><td>${esc(dateStr(invoice.issued_at))}</td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8" /><title>كشف حساب ${esc(student.full_name)}</title><style>
  @page{size:A4;margin:10mm}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;margin:0;padding:10px;color:#111}.sheet{max-width:190mm;margin:auto}.head{text-align:center;border-bottom:2px solid #14532d20;padding-bottom:10px}.logo{max-height:72px;max-width:140px}.name{font-size:22px;font-weight:800}.sub{font-size:12px;color:#666}.title{margin-top:7px;font-size:17px;font-weight:800}.info{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin:14px 0;font-size:13px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.box{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}.box b{display:block;margin-top:4px;font-size:16px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:7px;text-align:right}th{background:#f8fafc}.footer{text-align:center;font-size:11px;color:#777;margin-top:18px;border-top:1px solid #eee;padding-top:8px}@media print{body{padding:0}}
  </style></head><body><div class="sheet"><div class="head">${settings.receipt_show_logo !== false && settings.logo_data_url ? `<img class="logo" src="${settings.logo_data_url}" />` : ""}<div class="name">${esc(settings.institute_name)}</div><div class="sub">${esc(settings.address)} ${settings.phone ? `— ${esc(settings.phone)}` : ""}</div><div class="title">كشف حساب طالب</div></div>
  <div class="info"><div><b>الطالب:</b> ${esc(student.full_name)}</div><div><b>الرمز:</b> ${esc(student.code)}</div><div><b>ولي الأمر:</b> ${esc(student.guardian_name || "—")}</div><div><b>الهاتف:</b> ${esc(student.phone || student.guardian_phone || "—")}</div></div>
  <div class="summary"><div class="box">إجمالي المستحق<b>${esc(money(balance.billed, settings.currency))}</b></div><div class="box">إجمالي المقبوض<b>${esc(money(balance.paid, settings.currency))}</b></div><div class="box">إجمالي المتبقي<b>${esc(money(balance.due, settings.currency))}</b></div></div>
  <table><thead><tr><th>الفاتورة</th><th>العام الدراسي / الصف</th><th>المستحق</th><th>المقبوض</th><th>المتبقي</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${rows || `<tr><td colspan="7">لا توجد فواتير.</td></tr>`}</tbody></table>
  <div class="footer">كشف صادر من نظام ${esc(settings.institute_name)}</div></div></body></html>`;
  printHtmlDocument(html, "A4");
}

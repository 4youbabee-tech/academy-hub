import { printHtmlDocument } from "./print-document";
import type { Settings } from "./types";

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

export interface PrintableReport {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  summary?: { label: string; value: string }[];
}

export function printReport(settings: Settings, report: PrintableReport): void {
  const summary = report.summary?.length
    ? `<div class="summary">${report.summary.map((item) => `<div class="box"><span>${esc(item.label)}</span><b>${esc(item.value)}</b></div>`).join("")}</div>`
    : "";
  const tableRows = report.rows.length
    ? report.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${Math.max(1, report.headers.length)}" class="empty">لا توجد بيانات مطابقة.</td></tr>`;
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8" /><title>${esc(report.title)}</title><style>
  @page{size:A4;margin:9mm}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;margin:0;padding:10px;color:#111;background:#fff}.sheet{max-width:192mm;margin:auto}.head{text-align:center;border-bottom:2px solid #14532d20;padding-bottom:10px;margin-bottom:12px}.logo{max-height:68px;max-width:140px;object-fit:contain}.name{font-size:21px;font-weight:800}.sub{font-size:12px;color:#666}.title{font-size:17px;font-weight:800;margin-top:7px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}.box{border:1px solid #ddd;border-radius:8px;padding:9px;text-align:center;font-size:11px}.box b{display:block;margin-top:4px;font-size:14px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #ddd;padding:6px;text-align:right;vertical-align:top}th{background:#f8fafc;font-weight:800}.empty{text-align:center;color:#777;padding:18px}.footer{text-align:center;font-size:10px;color:#777;border-top:1px solid #eee;margin-top:14px;padding-top:7px}@media print{body{padding:0}}
  </style></head><body><div class="sheet"><div class="head">${settings.receipt_show_logo !== false && settings.logo_data_url ? `<img class="logo" src="${settings.logo_data_url}" />` : ""}<div class="name">${esc(settings.institute_name)}</div>${settings.address ? `<div class="sub">${esc(settings.address)}</div>` : ""}${settings.phone ? `<div class="sub">${esc(settings.phone)}</div>` : ""}<div class="title">${esc(report.title)}</div>${report.subtitle ? `<div class="sub">${esc(report.subtitle)}</div>` : ""}</div>${summary}<table><thead><tr>${report.headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table><div class="footer">تقرير صادر من نظام ${esc(settings.institute_name)}</div></div></body></html>`;
  printHtmlDocument(html, "A4");
}

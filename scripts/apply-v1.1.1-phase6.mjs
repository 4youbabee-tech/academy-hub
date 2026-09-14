import fs from "node:fs";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const receiptsPath = "src/routes/receipts.tsx";
let receipts = read(receiptsPath);
receipts = replaceRequired(
  receipts,
  'import { Denied } from "@/components/AppShell";\n',
  'import { Denied } from "@/components/AppShell";\nimport { snapshot } from "@/lib/db";\n',
  "receipts snapshot import",
);
receipts = receipts.replaceAll("الإيصالات والفواتير — نظام إدارة المركز التعليمي", "الفواتير والتحصيل — نظام إدارة المركز التعليمي");
receipts = receipts.replaceAll("الإيصالات والفواتير — نظام إدارة المعهد", "الفواتير والتحصيل — نظام إدارة المركز التعليمي");
receipts = receipts.replaceAll('title="الإيصالات والفواتير"', 'title="الفواتير والتحصيل"');
receipts = receipts.replaceAll('subtitle="كل ما يخص مستحقات الطلاب والقبض في مكان واحد"', 'subtitle="المستحق والقبض والطباعة من نفس شاشة الفاتورة"');

receipts = replaceRequired(
  receipts,
  `      recordPayment(\n        {\n          invoice_id: payFor,\n          amount: toMinor(amount),\n          method,\n          note: note.trim(),\n        },\n        actor,\n      );\n      setPayFor(null);`,
  `      const paymentId = recordPayment(\n        {\n          invoice_id: payFor,\n          amount: toMinor(amount),\n          method,\n          note: note.trim(),\n        },\n        actor,\n      );\n      const updated = snapshot();\n      const createdPayment = updated?.payments.find((payment) => payment.id === paymentId);\n      if (updated && createdPayment) printReceipt(updated, createdPayment);\n      setPayFor(null);\n      setSection("invoices");`,
  "print receipt immediately after collection",
);

receipts = replaceRequired(
  receipts,
  `        actions={\n          canPay && openInvoices.length > 0 ? (\n            <Button onClick={() => fillPaymentForm(openInvoices[0]?.id || null)}>+ سند قبض جديد</Button>\n          ) : null\n        }`,
  `        actions={\n          <Button variant="secondary" onClick={() => setSection((current) => current === "receipts" ? "invoices" : "receipts")}>\n            {section === "receipts" ? "العودة للفواتير" : "سجل القبض"}\n          </Button>\n        }`,
  "single secondary receipt history action",
);

receipts = replaceRequired(
  receipts,
  `      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">\n        <Button variant={section === "invoices" ? "primary" : "ghost"} onClick={() => setSection("invoices")}>\n          الفواتير والمستحقات\n        </Button>\n        <Button variant={section === "receipts" ? "primary" : "ghost"} onClick={() => setSection("receipts")}>\n          سندات القبض\n        </Button>\n      </div>\n\n`,
  "",
  "remove duplicate finance tabs",
);
receipts = receipts.replaceAll('title="سند قبض جديد"', 'title="قبض على الفاتورة"');
receipts = receipts.replaceAll('<Button onClick={submitPayment}>تسجيل السند</Button>', '<Button onClick={submitPayment}>تسجيل القبض وطباعة السند</Button>');
write(receiptsPath, receipts);

console.log("Applied Academy Hub v1.1.1 phase 6 unified invoice collection workflow.");

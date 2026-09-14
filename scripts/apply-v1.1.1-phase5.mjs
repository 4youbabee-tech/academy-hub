import fs from "node:fs";
import path from "node:path";

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, content) { fs.writeFileSync(file, content, "utf8"); }
function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) throw new Error(`Missing expected source for ${label}`);
  return content.replace(from, to);
}

const typesPath = "src/lib/types.ts";
let types = read(typesPath);
types = replaceRequired(
  types,
  '  note?: string;\n}\n\nexport interface Expense',
  '  note?: string;\n  /** Immutable payroll state immediately after issuing this payment receipt. */\n  payroll_net_snapshot?: number;\n  paid_before_snapshot?: number;\n  paid_after_snapshot?: number;\n  remaining_after_snapshot?: number;\n}\n\nexport interface Expense',
  "payroll payment snapshots",
);
write(typesPath, types);

const payrollPath = "src/lib/payroll.ts";
let payroll = read(payrollPath);
payroll = replaceRequired(
  payroll,
  '    validatePayrollItem(item);\n    const remaining = payrollRemaining(db, item.id);\n',
  '    validatePayrollItem(item);\n    const paidBefore = payrollPaid(db, item.id);\n    const remaining = Math.max(0, item.net - paidBefore);\n',
  "payroll payment paid-before snapshot",
);
payroll = replaceRequired(
  payroll,
  '      user_id: actor.id,\n      note: note.trim(),\n    };',
  '      user_id: actor.id,\n      note: note.trim(),\n      payroll_net_snapshot: item.net,\n      paid_before_snapshot: paidBefore,\n      paid_after_snapshot: paidBefore + amount,\n      remaining_after_snapshot: Math.max(0, item.net - paidBefore - amount),\n    };',
  "payroll payment immutable snapshots",
);
write(payrollPath, payroll);

const employeesPath = "src/routes/employees.tsx";
let employees = read(employeesPath);
employees = replaceRequired(
  employees,
  'import { printHtmlDocument } from "@/lib/print-document";\n',
  'import { printHtmlDocument } from "@/lib/print-document";\nimport { printPayrollPaymentReceipt } from "@/lib/payroll-print";\n',
  "payroll payment print import",
);
employees = replaceRequired(
  employees,
  '      recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");\n      setPayFor(null);\n      setPayAmount("");\n      setError(null);',
  '      const paidItem = payFor;\n      recordPayrollPayment(payFor.id, amount, actor, "دفعة راتب");\n      setPayFor(null);\n      setPaymentHistoryFor(paidItem);\n      setPayAmount("");\n      setError(null);',
  "open payroll history after payment",
);
employees = replaceRequired(
  employees,
  '                  {i.status === "paid" ? (\n                    <Button variant="ghost" onClick={() => printSalaryReceipt(i)}>\n                      🖨️ طباعة سند\n                    </Button>\n                  ) : null}',
  '                  {i.status === "paid" ? (\n                    <Button variant="ghost" onClick={() => printSalaryReceipt(i)}>\n                      🖨️ كشف الراتب الكامل\n                    </Button>\n                  ) : null}',
  "full payroll print label",
);
employees = replaceRequired(
  employees,
  '<Td>{!payment.is_void && canVoidPayroll ? <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button> : null}</Td>',
  '<Td><div className="flex flex-wrap gap-1">{!payment.is_void ? <Button variant="ghost" onClick={() => printPayrollPaymentReceipt(currentDb, paymentHistoryFor, payment)}>🖨️ طباعة</Button> : null}{!payment.is_void && canVoidPayroll ? <Button variant="ghost" onClick={() => { setVoidPayrollPaymentId(payment.id); setVoidPayrollReason(""); }}>إلغاء</Button> : null}</div></Td>',
  "payroll payment history print button",
);
write(employeesPath, employees);

// Remove the generic institute terminology everywhere user-facing. The student's school field remains unchanged.
for (const dir of ["src/components", "src/routes", "src/lib"]) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    const full = path.join(dir, name);
    let content = read(full);
    content = content.replaceAll("المعهد", "المركز التعليمي");
    write(full, content);
  }
}

const testPath = "tests/monthly-financial-harness.ts";
let test = read(testPath);
test = replaceRequired(
  test,
  'assert.equal(payrollRemaining(current, payroll.id), 15_000);\n\nconst salaryPart2',
  'assert.equal(payrollRemaining(current, payroll.id), 15_000);\nconst salaryPart1Row = current.payroll_payments.find((item) => item.id === salaryPart1)!;\nassert.equal(salaryPart1Row.payroll_net_snapshot, 30_000);\nassert.equal(salaryPart1Row.paid_before_snapshot, 0);\nassert.equal(salaryPart1Row.paid_after_snapshot, 15_000);\nassert.equal(salaryPart1Row.remaining_after_snapshot, 15_000);\n\nconst salaryPart2',
  "payroll payment snapshot assertions",
);
write(testPath, test);

console.log("Applied Academy Hub v1.1.1 phase 5 payroll receipt safeguards and terminology cleanup.");

import { useMemo } from "react";
import { Badge, Button, Empty, Modal, Panel, Stat, Table, Td } from "@/components/ui-kit";
import { StudentAnnualBillingCard } from "@/components/StudentAnnualBillingCard";
import { useApp } from "@/lib/session";
import { dateStr, money } from "@/lib/format";
import { invoiceFinancials, studentBalance } from "@/lib/finance";
import { printInvoice } from "@/lib/invoice-print";
import { printReceipt } from "@/lib/receipt-print";
import { receiptGroupRows } from "@/lib/student-settlement";
import { printStudentStatement } from "@/lib/student-statement-print";
import type { Payment } from "@/lib/types";

interface Props {
  studentId: string | null;
  open: boolean;
  onClose: () => void;
}

export function StudentCardModal({ studentId, open, onClose }: Props) {
  const { db, allowed } = useApp();

  const data = useMemo(() => {
    if (!db || !studentId) return null;
    const student = db.students.find((item) => item.id === studentId);
    if (!student) return null;
    const enrollments = db.enrollments
      .filter((item) => item.student_id === studentId)
      .slice()
      .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
    const invoices = db.invoices
      .filter((item) => item.student_id === studentId)
      .slice()
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    const allPayments = db.payments
      .filter((item) => item.student_id === studentId)
      .slice()
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at));
    const payments = allPayments.filter((payment, index, rows) => {
      const key = payment.receipt_group_id || payment.id;
      return rows.findIndex((candidate) => (candidate.receipt_group_id || candidate.id) === key) === index;
    });
    return { student, enrollments, invoices, payments };
  }, [db, studentId]);

  if (!db || !open) return null;
  if (!allowed("students.view")) return <Modal open={open} title="بطاقة الطالب" onClose={onClose}><Empty text="لا تملك صلاحية فتح بطاقة الطالب." /></Modal>;
  if (!data) return <Modal open={open} title="بطاقة الطالب" onClose={onClose}><Empty text="الطالب غير موجود." /></Modal>;

  const currentDb = db;
  const { student, enrollments, invoices, payments } = data;
  const balance = studentBalance(currentDb, student.id);
  const currency = currentDb.settings.currency;

  function receiptRows(payment: Payment) {
    return receiptGroupRows(currentDb, payment);
  }

  return (
    <Modal open={open} title={`بطاقة الطالب — ${student.full_name}`} onClose={onClose} extraWide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{student.code} — {student.education_level || "بدون مستوى"}</p>
            <p className="mt-1 text-lg font-extrabold">{student.full_name}</p>
          </div>
          {allowed("finance.view") ? <Button variant="secondary" onClick={() => printStudentStatement(currentDb, student.id)}>🖨️ طباعة كشف الطالب</Button> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="إجمالي المستحق" value={money(balance.billed, currency)} />
          <Stat label="إجمالي المقبوض" value={money(balance.paid, currency)} tone="success" />
          <Stat label="المتبقي على الطالب" value={money(balance.due, currency)} tone={balance.due > 0 ? "danger" : "success"} />
          <Stat label="الحالة" value={student.status === "active" ? "نشط" : student.status === "graduated" ? "متخرّج" : student.status === "archived" ? "مؤرشف" : "غير نشط"} />
        </div>

        <Panel>
          <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <p><b>ولي الأمر:</b> {student.guardian_name || "—"}</p>
            <p><b>هاتف ولي الأمر:</b> {student.guardian_phone || "—"}</p>
            <p><b>هاتف الطالب:</b> {student.phone || "—"}</p>
            <p><b>اسم الأم:</b> {student.mother_name || "—"}</p>
            <p><b>المدرسة:</b> {student.school_name || "—"}</p>
            <p><b>العنوان:</b> {student.address || "—"}</p>
          </div>
        </Panel>

        {allowed("finance.view") ? <StudentAnnualBillingCard studentId={student.id} /> : null}

        <div>
          <h3 className="mb-2 text-sm font-bold">التسجيلات</h3>
          {enrollments.length ? (
            <Table head={["التاريخ", "العام الدراسي / الصف", "الحالة"]}>
              {enrollments.map((enrollment) => {
                const klass = currentDb.classes.find((item) => item.id === enrollment.class_id);
                const course = klass ? currentDb.courses.find((item) => item.id === klass.course_id) : undefined;
                return <tr key={enrollment.id}><Td>{dateStr(enrollment.enrolled_at)}</Td><Td>{course?.name || "—"}{klass ? ` — ${klass.name}` : ""}</Td><Td><Badge tone={enrollment.status === "active" ? "success" : "muted"}>{enrollment.status === "active" ? "نشط" : enrollment.status === "completed" ? "مكتمل" : enrollment.status === "withdrawn" ? "منسحب" : "ملغى"}</Badge></Td></tr>;
              })}
            </Table>
          ) : <Empty text="لا توجد تسجيلات لهذا الطالب." />}
        </div>

        {allowed("finance.view") ? (
          <>
            <div>
              <h3 className="mb-2 text-sm font-bold">الفواتير</h3>
              {invoices.length ? (
                <Table head={["الفاتورة", "التاريخ", "المستحق", "المقبوض", "المتبقي", "الحالة", ""]}>
                  {invoices.map((invoice) => {
                    const financials = invoiceFinancials(currentDb, invoice);
                    return <tr key={invoice.id}><Td className="font-semibold">{invoice.number}</Td><Td>{dateStr(invoice.issued_at)}</Td><Td>{money(invoice.total, currency)}</Td><Td>{money(financials.paid, currency)}</Td><Td className={financials.due > 0 ? "text-destructive" : ""}>{money(financials.due, currency)}</Td><Td><Badge tone={invoice.status === "paid" ? "success" : invoice.status === "cancelled" ? "danger" : financials.paid > 0 ? "primary" : "muted"}>{invoice.status === "paid" ? "مسددة" : invoice.status === "cancelled" ? "ملغاة" : financials.paid > 0 ? "جزئية" : "مفتوحة"}</Badge></Td><Td><Button variant="secondary" onClick={() => printInvoice(currentDb, invoice)}>🖨️ طباعة الفاتورة</Button></Td></tr>;
                  })}
                </Table>
              ) : <Empty text="لا توجد فواتير لهذا الطالب." />}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold">سندات القبض</h3>
              {payments.length ? (
                <Table head={["السند", "التاريخ", "المبلغ", "الحالة", ""]}>
                  {payments.map((payment) => {
                    const rows = receiptRows(payment);
                    const amount = rows.reduce((sum, row) => sum + row.amount, 0);
                    const isVoid = rows.length > 0 && rows.every((row) => row.is_void);
                    return <tr key={payment.receipt_group_id || payment.id}><Td className="font-semibold">{payment.receipt_no}</Td><Td>{dateStr(payment.paid_at)}</Td><Td>{money(amount, currency)}</Td><Td><Badge tone={isVoid ? "danger" : "success"}>{isVoid ? "ملغى" : "ساري"}</Badge></Td><Td><Button variant="secondary" onClick={() => printReceipt(currentDb, payment)}>{isVoid ? "🖨️ نسخة تاريخية" : "🖨️ طباعة السند"}</Button></Td></tr>;
                  })}
                </Table>
              ) : <Empty text="لا توجد سندات قبض لهذا الطالب." />}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

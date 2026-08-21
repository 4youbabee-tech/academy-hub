import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from "@/components/ui-kit";
import { insert, transact } from "@/lib/db";
import { dateStr } from "@/lib/format";
import { finalResult } from "@/lib/grading";
import type { Certificate } from "@/lib/types";

export const Route = createFileRoute("/certificates")({
  head: () => ({
    meta: [
      { title: "الشهادات — نظام إدارة المعهد" },
      { name: "description", content: "إصدار شهادات نجاح، إتمام، أو حضور مع رقم فريد ورمز تحقق." },
    ],
  }),
  component: CertificatesPage,
});

function CertificatesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: "",
    enrollment_id: "",
    type: "completion" as Certificate["type"],
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  if (!db) return null;
  if (!allowed("certificates.view")) return <Denied />;
  const canCreate = allowed("certificates.create");

  const students = db.students.filter((s) => s.status === "active" || s.status === "graduated");
  const enrollments = db.enrollments.filter((e) => e.status === "active" || e.status === "completed");

  const certificates = useMemo(
    () => db.certificates.slice().sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
    [db],
  );

  const filteredEnrollments = form.student_id
    ? enrollments.filter((e) => e.student_id === form.student_id)
    : [];

  function getStudentName(id: string) {
    return db.students.find((s) => s.id === id)?.full_name || "—";
  }

  function getEnrollmentInfo(id: string) {
    const e = db.enrollments.find((en) => en.id === id);
    if (!e) return "—";
    const klass = db.classes.find((c) => c.id === e.class_id);
    return klass?.name || "—";
  }

  function generateVerificationCode() {
    return `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  function issueCertificate() {
    if (!form.student_id) return setError("اختر الطالب");
    if (!form.enrollment_id) return setError("اختر التسجيل");

    const student = db.students.find((s) => s.id === form.student_id);
    const enrollment = db.enrollments.find((e) => e.id === form.enrollment_id);
    if (!student || !enrollment) return setError("البيانات غير صحيحة");

    let serial = "";
    transact((d) => {
      const n = d.settings.certificate_next;
      d.settings.certificate_next = n + 1;
      serial = `${d.settings.certificate_prefix}${String(n).padStart(5, "0")}`;
    });

    const verificationCode = generateVerificationCode();

    try {
      insert(
        "certificates",
        {
          serial,
          student_id: form.student_id,
          enrollment_id: form.enrollment_id,
          type: form.type,
          issued_at: new Date().toISOString(),
          verification_token: verificationCode,
          note: form.note.trim(),
        },
        actor,
        `إصدار شهادة ${form.type} للطالب ${student.full_name}`,
      );
      setOpen(false);
      setError(null);
      setForm({ student_id: "", enrollment_id: "", type: "completion", note: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function printCertificate(cert: Certificate) {
    const student = db.students.find((s) => s.id === cert.student_id);
    const enrollment = db.enrollments.find((e) => e.id === cert.enrollment_id);
    const klass = enrollment ? db.classes.find((c) => c.id === enrollment.class_id) : null;
    const course = klass ? db.courses.find((c) => c.id === klass.course_id) : null;

    const res = enrollment ? finalResult(db, enrollment.id) : null;

    const win = window.open("", "_blank");
    if (!win) return;

    const typeMap = { completion: "إتمام", success: "نجاح", attendance: "حضور" };

    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>شهادة ${typeMap[cert.type]}</title>
        <style>
          body { font-family: 'Cairo', 'Arial', sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
          .cert { max-width: 800px; margin: auto; background: white; padding: 50px; border: 3px double #1a4a4a; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h1 { color: #1a4a4a; font-size: 28px; margin-bottom: 8px; }
          .sub { color: #555; font-size: 16px; margin-bottom: 30px; }
          .name { font-size: 36px; font-weight: bold; color: #b9762b; margin: 20px 0; }
          .detail { font-size: 18px; margin: 10px 0; color: #333; }
          .detail strong { color: #1a4a4a; }
          .code { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px; font-size: 14px; color: #888; }
          .footer { margin-top: 20px; font-size: 14px; color: #666; }
          .qr-placeholder { margin: 20px auto; width: 120px; height: 120px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 12px; }
          @media print { body { background: white; padding: 20px; } .cert { box-shadow: none; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="cert">
          <h1>شهادة ${typeMap[cert.type]}</h1>
          <div class="sub">${dateStr(cert.issued_at)}</div>
          <div class="name">${student?.full_name || "—"}</div>
          <div class="detail"><strong>الدورة / الصف:</strong> ${course?.name || "—"} (${klass?.name || "—"})</div>
          ${res?.total !== null && res?.total !== undefined ? `<div class="detail"><strong>النتيجة:</strong> ${res.total.toFixed(1)}%</div>` : ""}
          ${cert.note ? `<div class="detail"><strong>ملاحظات:</strong> ${cert.note}</div>` : ""}
          <div class="code">
            <div>رقم الشهادة: <strong>${cert.serial}</strong></div>
            <div>رمز التحقق: <strong>${cert.verification_token}</strong></div>
          </div>
          <div class="qr-placeholder">[QR Code]</div>
          <div class="footer">صدرت بواسطة: ${db.settings.institute_name}</div>
        </div>
        <script>
          setTimeout(() => { window.print(); }, 500);
        <\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  const typeLabels = { completion: "إتمام", success: "نجاح", attendance: "حضور" };

  return (
    <div>
      <PageHeader
        title="الشهادات"
        subtitle={`${certificates.length} شهادة${certificates.length !== 1 ? "ات" : ""}`}
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setForm({ student_id: "", enrollment_id: "", type: "completion", note: "" });
                setError(null);
                setOpen(true);
              }}
            >
              + إصدار شهادة
            </Button>
          ) : null
        }
      />

      {certificates.length === 0 ? (
        <Empty text="لا توجد شهادات صادرة حتى الآن." />
      ) : (
        <Table head={["الرقم", "الطالب", "النوع", "التاريخ", "رمز التحقق", ""]}>
          {certificates.map((c) => (
            <tr key={c.id}>
              <Td className="font-semibold">{c.serial}</Td>
              <Td>{getStudentName(c.student_id)}</Td>
              <Td>
                <Badge tone={c.type === "success" ? "success" : c.type === "completion" ? "primary" : "warning"}>
                  {typeLabels[c.type]}
                </Badge>
              </Td>
              <Td>{dateStr(c.issued_at)}</Td>
              <Td className="text-xs text-muted-foreground">{c.verification_token}</Td>
              <Td>
                <Button variant="ghost" onClick={() => printCertificate(c)}>
                  🖨️ طباعة
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={open} title="إصدار شهادة جديدة" onClose={() => setOpen(false)} wide>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الطالب">
              <Select
                value={form.student_id}
                onChange={(e) => {
                  setForm({ ...form, student_id: e.target.value, enrollment_id: "" });
                }}
              >
                <option value="">— اختر —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="التسجيل (الصف / الدورة)">
              <Select
                value={form.enrollment_id}
                onChange={(e) => setForm({ ...form, enrollment_id: e.target.value })}
                disabled={!form.student_id}
              >
                <option value="">— اختر —</option>
                {filteredEnrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {getEnrollmentInfo(e.id)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="نوع الشهادة">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as Certificate["type"] })}
              >
                <option value="completion">إتمام</option>
                <option value="success">نجاح</option>
                <option value="attendance">حضور</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="ملاحظات إضافية">
                <Textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                  placeholder="ملاحظات تظهر على الشهادة..."
                />
              </Field>
            </div>
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={issueCertificate}>إصدار</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from "@/components/ui-kit";
import { insert, nextStudentCode, snapshot, transact, update } from "@/lib/db";
import { studentBalance } from "@/lib/finance";
import { money } from "@/lib/format";
import type { Student } from "@/lib/types";

export const Route = createFileRoute("/students")({
  head: () => ({
    meta: [
      { title: "الطلاب — نظام إدارة المعهد" },
      { name: "description", content: "إدارة سجلات الطلاب: البيانات الشخصية، أولياء الأمور، الحالة والرصيد المالي." },
    ],
  }),
  component: StudentsPage,
});

const EMPTY = {
  full_name: "",
  birth_date: "",
  gender: "" as Student["gender"],
  phone: "",
  guardian_name: "",
  guardian_phone: "",
  address: "",
  education_level: "" as Student["education_level"],
  status: "active" as Student["status"],
  notes: "",
};

function StudentsPage() {
  const { db, actor, allowed } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!db) return [];
    const term = q.trim().toLowerCase();
    return db.students
      .filter((s) => (status ? s.status === status : true))
      .filter((s) =>
        term
          ? s.full_name.toLowerCase().includes(term) ||
            s.code.toLowerCase().includes(term) ||
            s.phone.includes(term)
          : true,
      )
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
  }, [db, q, status]);

  if (!db) return null;
  if (!allowed("students.view")) return <Denied />;
  const canEdit = allowed("students.create");

  function startAdd() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function startEdit(s: Student) {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      birth_date: s.birth_date ?? "",
      gender: s.gender,
      phone: s.phone,
      guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone,
      address: s.address,
      education_level: s.education_level || "",
      status: s.status,
      notes: s.notes,
    });
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!form.full_name.trim()) return setError("اسم الطالب إلزامي");
    try {
      if (editing) {
        update(
          "students",
          editing.id,
          {
            ...form,
            birth_date: form.birth_date || null,
            education_level: form.education_level || null,
          },
          actor,
          `تعديل الطالب ${form.full_name}`,
        );
      } else {
        let code = "";
        transact((d) => {
          code = nextStudentCode(d);
        });
        insert(
          "students",
          {
            ...form,
            code,
            birth_date: form.birth_date || null,
            education_level: form.education_level || null,
          },
          actor,
          `إضافة الطالب ${form.full_name}`,
        );
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const cur = db.settings.currency;

  return (
    <div>
      <PageHeader
        title="الطلاب"
        subtitle={`${db.students.length} طالب مسجّل`}
        actions={canEdit ? <Button onClick={startAdd}>+ طالب جديد</Button> : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
        <Input placeholder="بحث بالاسم أو الرمز أو الهاتف" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">غير نشط</option>
          <option value="graduated">متخرّج</option>
        </Select>
      </div>

      {rows.length ? (
        <Table head={["الرمز", "الاسم", "المستوى", "الدورة / الصف", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", ""]}>
          {rows.map((s) => {
            const bal = studentBalance(db, s.id);
            const activeEnrollments = db.enrollments.filter((e) => e.student_id === s.id && e.status === "active");
            const labels = activeEnrollments.map((e) => {
              const klass = db.classes.find((k) => k.id === e.class_id);
              const course = db.courses.find((c) => c.id === klass?.course_id);
              return course?.name ? `${course.name}${klass ? ` — ${klass.name}` : ""}` : klass?.name || "—";
            });
            return (
              <tr key={s.id}>
                <Td className="tabular-nums">{s.code}</Td>
                <Td>
                  <Link to="/students/$id" params={{ id: s.id }} className="font-semibold text-primary hover:underline">
                    {s.full_name}
                  </Link>
                </Td>
                <Td>{s.education_level || "—"}</Td>
                <Td className="text-xs">{labels.length ? labels.join("، ") : "—"}</Td>
                <Td className="tabular-nums">{money(bal.billed, cur)}</Td>
                <Td className="tabular-nums text-emerald-700">{money(bal.paid, cur)}</Td>
                <Td className={bal.due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(bal.due, cur)}</Td>
                <Td>
                  <Badge tone={s.status === "active" ? "success" : s.status === "graduated" ? "primary" : "muted"}>
                    {s.status === "active" ? "نشط" : s.status === "graduated" ? "متخرّج" : "غير نشط"}
                  </Badge>
                </Td>
                <Td>{canEdit ? <Button variant="ghost" onClick={() => startEdit(s)}>تعديل</Button> : null}</Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty text="لا يوجد طلاب مطابقون." />
      )}

      <Modal open={open} title={editing ? "تعديل طالب" : "طالب جديد"} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم الكامل">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="تاريخ الميلاد">
            <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </Field>
          <Field label="الجنس">
            <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Student["gender"] })}>
              <option value="">—</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </Select>
          </Field>
          <Field label="الهاتف">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="اسم ولي الأمر">
            <Input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          </Field>
          <Field label="هاتف ولي الأمر">
            <Input value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </Field>
          <Field label="المستوى التعليمي">
            <Select
              value={form.education_level ?? ""}
              onChange={(e) => setForm({ ...form, education_level: e.target.value as Student["education_level"] })}
            >
              <option value="">— اختر —</option>
              <option value="ابتدائي">ابتدائي</option>
              <option value="متوسط">متوسط</option>
              <option value="ثانوي">ثانوي</option>
              <option value="جامعي">جامعي</option>
            </Select>
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Student["status"] })}>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="graduated">متخرّج</option>
            </Select>
          </Field>
          <Field label="العنوان">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="ملاحظات">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={!snapshot()}>
            حفظ
          </Button>
        </div>
      </Modal>
    </div>
  );
}

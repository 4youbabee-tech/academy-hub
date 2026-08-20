import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import { createEnrollmentWithInvoice } from "@/lib/finance";
import { dateStr, fromMinor, money, today, toMinor, WEEKDAYS } from "@/lib/format";
import type { Klass } from "@/lib/types";

export const Route = createFileRoute("/classes")({
  head: () => ({
    meta: [
      { title: "الصفوف والجداول — نظام إدارة المعهد" },
      { name: "description", content: "إدارة الصفوف الدراسية والمدرّسين والجداول الأسبوعية وتسجيل الطلاب." },
      { property: "og:title", content: "الصفوف والجداول — نظام إدارة المعهد" },
      { property: "og:description", content: "الصفوف والمدرّسون والجداول الأسبوعية وتسجيل الطلاب." },
    ],
  }),
  component: ClassesPage,
});

const EMPTY = {
  name: "",
  course_id: "",
  teacher_id: "",
  term: "",
  capacity: "20",
  start_date: today(),
  end_date: today(),
  status: "planned" as Klass["status"],
};

function ClassesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Klass | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [slots, setSlots] = useState<Klass["schedule"]>([]);
  const [error, setError] = useState<string | null>(null);

  const [enrollFor, setEnrollFor] = useState<Klass | null>(null);
  const [enrollForm, setEnrollForm] = useState({ student_id: "", price: "0", discount: "0", reason: "", count: "1" });
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    db?.enrollments.forEach((e) => {
      if (e.status === "cancelled" || e.status === "withdrawn") return;
      m.set(e.class_id, (m.get(e.class_id) ?? 0) + 1);
    });
    return m;
  }, [db]);

  if (!db) return null;
  if (!allowed("classes.view")) return <Denied />;
  const canEdit = allowed("classes.create");
  const canEnroll = allowed("enrollments.create");
  const cur = db.settings.currency;

  const courseName = (id: string) => db.courses.find((c) => c.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => db.employees.find((e) => e.id === id)?.full_name ?? "—";

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, course_id: db!.courses[0]?.id ?? "" });
    setSlots([]);
    setError(null);
    setOpen(true);
  }

  function openEdit(k: Klass) {
    setEditing(k);
    setForm({
      name: k.name,
      course_id: k.course_id,
      teacher_id: k.teacher_id ?? "",
      term: k.term,
      capacity: String(k.capacity),
      start_date: k.start_date,
      end_date: k.end_date,
      status: k.status,
    });
    setSlots(k.schedule);
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return setError("اسم الصف إلزامي");
    if (!form.course_id) return setError("اختر الدورة");
    const payload = {
      name: form.name.trim(),
      course_id: form.course_id,
      teacher_id: form.teacher_id || null,
      term: form.term.trim(),
      capacity: Number(form.capacity) || 0,
      start_date: form.start_date,
      end_date: form.end_date,
      schedule: slots,
      status: form.status,
    };
    try {
      if (editing) update("classes", editing.id, payload, actor, `تعديل الصف ${payload.name}`);
      else insert("classes", payload, actor, `إضافة الصف ${payload.name}`);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openEnroll(k: Klass) {
    const course = db!.courses.find((c) => c.id === k.course_id);
    setEnrollFor(k);
    setEnrollForm({
      student_id: "",
      price: fromMinor(course?.default_price ?? 0),
      discount: "0",
      reason: "",
      count: "1",
    });
    setEnrollError(null);
  }

  function submitEnroll() {
    if (!enrollFor) return;
    if (!enrollForm.student_id) return setEnrollError("اختر الطالب");
    const exists = db!.enrollments.some(
      (e) => e.class_id === enrollFor.id && e.student_id === enrollForm.student_id && e.status === "active",
    );
    if (exists) return setEnrollError("الطالب مسجّل مسبقًا في هذا الصف");
    const used = counts.get(enrollFor.id) ?? 0;
    if (enrollFor.capacity > 0 && used >= enrollFor.capacity) return setEnrollError("الصف مكتمل العدد");

    const price = toMinor(enrollForm.price);
    const discount = toMinor(enrollForm.discount);
    const total = Math.max(0, price - discount);
    const n = Math.max(1, Number(enrollForm.count) || 1);
    const per = Math.floor(total / n);
    const installments = Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      return { due_date: d.toISOString().slice(0, 10), amount: i === n - 1 ? total - per * (n - 1) : per };
    });
    try {
      createEnrollmentWithInvoice(
        {
          student_id: enrollForm.student_id,
          class_id: enrollFor.id,
          price,
          discount,
          discount_reason: enrollForm.reason.trim(),
          installments,
        },
        actor,
      );
      setEnrollFor(null);
    } catch (e) {
      setEnrollError((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الصفوف والجداول"
        subtitle={`${db.classes.length} صف`}
        actions={canEdit ? <Button onClick={openNew}>+ صف جديد</Button> : null}
      />

      {db.classes.length ? (
        <Table head={["الصف", "الدورة", "المدرّس", "الفصل", "الفترة", "المسجّلون", "الحالة", ""]}>
          {db.classes.map((k) => (
            <tr key={k.id}>
              <Td className="font-semibold">{k.name}</Td>
              <Td>{courseName(k.course_id)}</Td>
              <Td>{teacherName(k.teacher_id)}</Td>
              <Td>{k.term || "—"}</Td>
              <Td className="whitespace-nowrap text-xs">
                {dateStr(k.start_date)} ← {dateStr(k.end_date)}
              </Td>
              <Td className="tabular-nums">
                {counts.get(k.id) ?? 0}
                {k.capacity ? ` / ${k.capacity}` : ""}
              </Td>
              <Td>
                <Badge tone={k.status === "running" ? "success" : k.status === "finished" ? "muted" : "primary"}>
                  {k.status === "running" ? "جارٍ" : k.status === "finished" ? "منتهٍ" : "مخطط"}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1">
                  {canEnroll ? (
                    <Button variant="ghost" onClick={() => openEnroll(k)}>
                      تسجيل طالب
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button variant="ghost" onClick={() => openEdit(k)}>
                      تعديل
                    </Button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="لا توجد صفوف بعد." />
      )}

      <Modal open={open} title={editing ? "تعديل صف" : "صف جديد"} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الصف">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="الدورة">
            <Select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">— اختر —</option>
              {db.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المدرّس">
            <Select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">— بدون —</option>
              {db.employees
                .filter((e) => e.kind === "teacher" && e.active)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="الفصل / الترم">
            <Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
          </Field>
          <Field label="السعة">
            <Input
              type="number"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
          <Field label="الحالة">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Klass["status"] })}
            >
              <option value="planned">مخطط</option>
              <option value="running">جارٍ</option>
              <option value="finished">منتهٍ</option>
            </Select>
          </Field>
          <Field label="تاريخ البداية">
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Field>
          <Field label="تاريخ النهاية">
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">الجدول الأسبوعي</p>
            <Button
              variant="secondary"
              onClick={() => setSlots([...slots, { weekday: 1, start_time: "16:00", end_time: "18:00", room: "" }])}
            >
              + موعد
            </Button>
          </div>
          <div className="space-y-2">
            {slots.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Select
                  value={s.weekday}
                  onChange={(e) => {
                    const next = [...slots];
                    next[i] = { ...s, weekday: Number(e.target.value) };
                    setSlots(next);
                  }}
                >
                  {WEEKDAYS.map((d, idx) => (
                    <option key={d} value={idx}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Input
                  type="time"
                  value={s.start_time}
                  onChange={(e) => {
                    const next = [...slots];
                    next[i] = { ...s, start_time: e.target.value };
                    setSlots(next);
                  }}
                />
                <Input
                  type="time"
                  value={s.end_time}
                  onChange={(e) => {
                    const next = [...slots];
                    next[i] = { ...s, end_time: e.target.value };
                    setSlots(next);
                  }}
                />
                <Input
                  placeholder="القاعة"
                  value={s.room}
                  onChange={(e) => {
                    const next = [...slots];
                    next[i] = { ...s, room: e.target.value };
                    setSlots(next);
                  }}
                />
                <Button variant="ghost" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                  حذف
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={save}>حفظ</Button>
        </div>
      </Modal>

      <Modal
        open={!!enrollFor}
        title={`تسجيل طالب — ${enrollFor?.name ?? ""}`}
        onClose={() => setEnrollFor(null)}
      >
        <div className="space-y-3">
          <Field label="الطالب">
            <Select
              value={enrollForm.student_id}
              onChange={(e) => setEnrollForm({ ...enrollForm, student_id: e.target.value })}
            >
              <option value="">— اختر —</option>
              {db.students
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.code})
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`السعر (${cur})`}>
              <Input value={enrollForm.price} onChange={(e) => setEnrollForm({ ...enrollForm, price: e.target.value })} />
            </Field>
            <Field label={`الخصم (${cur})`}>
              <Input
                value={enrollForm.discount}
                onChange={(e) => setEnrollForm({ ...enrollForm, discount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="سبب الخصم">
            <Input value={enrollForm.reason} onChange={(e) => setEnrollForm({ ...enrollForm, reason: e.target.value })} />
          </Field>
          <Field label="عدد الأقساط" hint="تُوزّع شهريًا بدءًا من اليوم">
            <Input
              type="number"
              min={1}
              value={enrollForm.count}
              onChange={(e) => setEnrollForm({ ...enrollForm, count: e.target.value })}
            />
          </Field>
          <p className="rounded-lg bg-muted p-3 text-sm">
            الصافي: <b>{money(Math.max(0, toMinor(enrollForm.price) - toMinor(enrollForm.discount)), cur)}</b>
          </p>
          {enrollError ? <p className="text-sm font-semibold text-destructive">{enrollError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEnrollFor(null)}>
              إلغاء
            </Button>
            <Button onClick={submitEnroll}>تسجيل وإصدار فاتورة</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

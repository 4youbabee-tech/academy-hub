import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import { dateStr, today, WEEKDAYS } from "@/lib/format";
import type { Klass } from "@/lib/types";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/classes")({
  head: () => ({
    meta: [
      { title: "الصفوف — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إدارة الصفوف والمدرّسين والجداول الأسبوعية. تسجيل الطلاب يتم من بطاقة الطالب." },
      { property: "og:title", content: "الصفوف — نظام إدارة المركز التعليمي" },
      { property: "og:description", content: "إدارة الصفوف والمدرّسين والجداول الأسبوعية." },
    ],
  }),
  component: ClassesPage,
});

function defaultClassEndDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function emptyClassForm() {
  return {
    name: "",
    course_id: "",
    teacher_id: "",
    term: "",
    capacity: "20",
    start_date: today(),
    end_date: defaultClassEndDate(),
    status: "running" as Klass["status"],
  };
}

function ClassesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Klass | null>(null);
  const [form, setForm] = useState(emptyClassForm());
  const [slots, setSlots] = useState<Klass["schedule"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    db?.enrollments.forEach((enrollment) => {
      if (enrollment.status === "cancelled" || enrollment.status === "withdrawn") return;
      result.set(enrollment.class_id, (result.get(enrollment.class_id) ?? 0) + 1);
    });
    return result;
  }, [db]);

  const rows = useMemo(() => {
    if (!db) return [];
    const term = query.trim().toLowerCase();
    const courseById = new Map(db.courses.map((course) => [course.id, course.name.toLowerCase()]));
    const teacherById = new Map(db.employees.map((employee) => [employee.id, employee.full_name.toLowerCase()]));
    return db.classes
      .filter((klass) => !status || klass.status === status)
      .filter((klass) => {
        if (!term) return true;
        return [
          klass.name.toLowerCase(),
          courseById.get(klass.course_id) ?? "",
          klass.teacher_id ? teacherById.get(klass.teacher_id) ?? "" : "",
          klass.term.toLowerCase(),
        ].some((value) => value.includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [db, query, status]);

  const pagination = usePagination(rows, `${query}|${status}`);

  if (!db) return null;
  if (!allowed("classes.view")) return <Denied />;
  const currentDb = db;
  const canEdit = allowed("classes.create");

  const courseName = (id: string) => currentDb.courses.find((course) => course.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => currentDb.employees.find((employee) => employee.id === id)?.full_name ?? "—";

  function openNew() {
    const firstYear = currentDb.courses.find((course) => course.active) ?? currentDb.courses[0];
    setEditing(null);
    setForm({ ...emptyClassForm(), course_id: firstYear?.id ?? "" });
    setSlots([]);
    setError(null);
    setOpen(true);
  }

  function openEdit(klass: Klass) {
    setEditing(klass);
    setForm({
      name: klass.name,
      course_id: klass.course_id,
      teacher_id: klass.teacher_id ?? "",
      term: klass.term,
      capacity: String(klass.capacity),
      start_date: klass.start_date,
      end_date: klass.end_date,
      status: klass.status,
    });
    setSlots(klass.schedule);
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return setError("اسم الصف إلزامي");
    if (!form.course_id) return setError("اختر العام الدراسي");
    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      return setError("تاريخ نهاية الصف لا يمكن أن يسبق تاريخ البداية");
    }
    const duplicate = currentDb.classes.some(
      (klass) =>
        klass.id !== editing?.id &&
        klass.course_id === form.course_id &&
        klass.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    );
    if (duplicate) return setError("يوجد صف بنفس الاسم ضمن هذا العام الدراسي");

    const payload = {
      name: form.name.trim(),
      course_id: form.course_id,
      teacher_id: form.teacher_id || null,
      term: form.term.trim(),
      capacity: Math.max(0, Number(form.capacity) || 0),
      start_date: form.start_date,
      end_date: form.end_date,
      schedule: slots,
      status: form.status,
    };

    try {
      if (editing) update("classes", editing.id, payload, actor, `تعديل الصف ${payload.name}`);
      else insert("classes", payload, actor, `إضافة الصف ${payload.name}`);
      setOpen(false);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الصفوف"
        subtitle="إدارة الصفوف فقط — تسجيل الطالب يتم من صفحة الطلاب والتسجيل"
        actions={canEdit ? <Button onClick={openNew}>+ صف جديد</Button> : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالصف أو العام الدراسي أو المدرّس" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">كل الحالات</option>
          <option value="running">جارٍ</option>
          <option value="finished">منتهٍ</option>
        </Select>
      </div>

      {rows.length ? (
        <>
          <Table head={["الصف", "العام الدراسي", "المدرّس", "الفصل / الترم", "الفترة", "عدد الطلاب", "الحالة", ""]}>
            {pagination.rows.map((klass) => (
              <tr key={klass.id}>
                <Td className="font-semibold">{klass.name}</Td>
                <Td>{courseName(klass.course_id)}</Td>
                <Td>{teacherName(klass.teacher_id)}</Td>
                <Td>{klass.term || "—"}</Td>
                <Td className="whitespace-nowrap text-xs">{dateStr(klass.start_date)} ← {dateStr(klass.end_date)}</Td>
                <Td className="tabular-nums">{counts.get(klass.id) ?? 0}{klass.capacity ? ` / ${klass.capacity}` : ""}</Td>
                <Td><Badge tone={klass.status === "running" ? "success" : "muted"}>{klass.status === "running" ? "جارٍ" : "منتهٍ"}</Badge></Td>
                <Td>{canEdit ? <Button variant="ghost" onClick={() => openEdit(klass)}>تعديل الصف</Button> : null}</Td>
              </tr>
            ))}
          </Table>
          <PaginationControls
            page={pagination.page}
            pageCount={pagination.pageCount}
            pageSize={pagination.pageSize}
            total={pagination.total}
            from={pagination.from}
            to={pagination.to}
            onPrevious={pagination.previous}
            onNext={pagination.next}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      ) : <Empty text="لا توجد صفوف مطابقة." />}

      <Modal open={open} title={editing ? "تعديل صف" : "صف جديد"} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الصف">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="العام الدراسي">
            <Select
              value={form.course_id}
              onChange={(event) => setForm({ ...form, course_id: event.target.value })}
              disabled={!!editing && currentDb.enrollments.some((enrollment) => enrollment.class_id === editing.id)}
            >
              <option value="">— اختر —</option>
              {currentDb.courses.filter((course) => course.active || course.id === form.course_id).map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </Select>
            {editing && currentDb.enrollments.some((enrollment) => enrollment.class_id === editing.id) ? (
              <span className="block text-xs text-muted-foreground">العام الدراسي محمي بعد وجود تسجيلات في الصف.</span>
            ) : null}
          </Field>
          <Field label="المدرّس">
            <Select value={form.teacher_id} onChange={(event) => setForm({ ...form, teacher_id: event.target.value })}>
              <option value="">— بدون —</option>
              {currentDb.employees.filter((employee) => employee.kind === "teacher" && employee.active).map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="الفصل / الترم">
            <Input value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value })} />
          </Field>
          <Field label="السعة">
            <Input type="number" min="0" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Klass["status"] })}>
              <option value="running">جارٍ</option>
              <option value="finished">منتهٍ</option>
            </Select>
          </Field>
          <Field label="تاريخ البداية">
            <Input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          </Field>
          <Field label="تاريخ النهاية">
            <Input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">الجدول الأسبوعي</p>
            <Button variant="secondary" onClick={() => setSlots([...slots, { weekday: 1, start_time: "16:00", end_time: "18:00", room: "" }])}>+ موعد</Button>
          </div>
          <div className="space-y-2">
            {slots.map((slot, index) => (
              <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Select
                  value={slot.weekday}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = { ...slot, weekday: Number(event.target.value) };
                    setSlots(next);
                  }}
                >
                  {WEEKDAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}
                </Select>
                <Input
                  type="time"
                  value={slot.start_time}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = { ...slot, start_time: event.target.value };
                    setSlots(next);
                  }}
                />
                <Input
                  type="time"
                  value={slot.end_time}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = { ...slot, end_time: event.target.value };
                    setSlots(next);
                  }}
                />
                <Input
                  placeholder="القاعة"
                  value={slot.room}
                  onChange={(event) => {
                    const next = [...slots];
                    next[index] = { ...slot, room: event.target.value };
                    setSlots(next);
                  }}
                />
                <Button variant="ghost" onClick={() => setSlots(slots.filter((_, itemIndex) => itemIndex !== index))}>حذف</Button>
              </div>
            ))}
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save}>حفظ</Button>
        </div>
      </Modal>
    </div>
  );
}

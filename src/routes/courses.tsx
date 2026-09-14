import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import { fromMinor, money, toMinor } from "@/lib/format";
import type { Course } from "@/lib/types";

export const Route = createFileRoute("/courses")({
  head: () => ({
    meta: [
      { title: "العام الدراسي — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إدارة العام الدراسي والقسط الشهري الافتراضي." },
      { property: "og:title", content: "العام الدراسي — نظام إدارة المركز التعليمي" },
      { property: "og:description", content: "العام الدراسي والقسط الشهري الافتراضي." },
    ],
  }),
  component: CoursesPage,
});

function academicYearNow(): string {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

function emptyYearForm() {
  return { name: academicYearNow(), code: "", level: "", hours: "0", price: "0", active: true };
}

function CoursesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(emptyYearForm());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    if (!db) return [];
    const term = query.trim().toLowerCase();
    return db.courses
      .filter((course) => status !== "active" || course.active)
      .filter((course) => status !== "inactive" || !course.active)
      .filter((course) => !term || course.name.toLowerCase().includes(term))
      .sort((a, b) => b.name.localeCompare(a.name, "ar"));
  }, [db, query, status]);

  if (!db) return null;
  if (!allowed("courses.view")) return <Denied />;
  const currentDb = db;
  const canEdit = allowed("courses.create");
  const cur = currentDb.settings.currency;

  function openNew() {
    setEditing(null);
    setForm(emptyYearForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setForm({
      name: course.name,
      code: course.code,
      level: course.level,
      hours: String(course.hours),
      price: fromMinor(course.default_price),
      active: course.active,
    });
    setError(null);
    setOpen(true);
  }

  function save() {
    const name = form.name.trim();
    if (!name) return setError("اسم العام الدراسي إلزامي");
    if (!/^\d{4}-\d{4}$/.test(name)) return setError("صيغة العام الدراسي يجب أن تكون مثل 2026-2027");
    const [startText, endText] = name.split("-");
    if (Number(endText) !== Number(startText) + 1) return setError("العام الدراسي يجب أن يكون سنتين متتاليتين");
    if (currentDb.courses.some((course) => course.id !== editing?.id && course.name.trim() === name)) {
      return setError("هذا العام الدراسي موجود مسبقًا");
    }
    const price = toMinor(form.price);
    if (price < 0) return setError("القسط الشهري غير صالح");

    const payload = {
      name,
      code: "",
      level: "",
      hours: 0,
      default_price: price,
      active: form.active,
    };

    try {
      if (editing) update("courses", editing.id, payload, actor, `تعديل العام الدراسي ${payload.name}`);
      else insert("courses", payload, actor, `إضافة العام الدراسي ${payload.name}`);
      setOpen(false);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="العام الدراسي"
        subtitle={`${rows.length} من ${currentDb.courses.length} عام دراسي`}
        actions={canEdit ? <Button onClick={openNew}>+ عام دراسي جديد</Button> : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم العام الدراسي" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">كل الحالات</option>
          <option value="active">مفعّلة</option>
          <option value="inactive">موقوفة</option>
        </Select>
      </div>

      {rows.length ? (
        <Table head={["العام الدراسي", "القسط الشهري الافتراضي", "الحالة", ""]}>
          {rows.map((course) => (
            <tr key={course.id}>
              <Td className="font-semibold">{course.name}</Td>
              <Td className="tabular-nums">{money(course.default_price, cur)}</Td>
              <Td><Badge tone={course.active ? "success" : "muted"}>{course.active ? "مفعّلة" : "موقوفة"}</Badge></Td>
              <Td>{canEdit ? <Button variant="ghost" onClick={() => openEdit(course)}>تعديل</Button> : null}</Td>
            </tr>
          ))}
        </Table>
      ) : <Empty text="لا توجد أعوام دراسية مطابقة." />}

      <Modal open={open} title={editing ? "تعديل عام دراسي" : "عام دراسي جديد"} onClose={() => setOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم العام الدراسي">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={academicYearNow()} />
          </Field>
          <Field label={`القسط الشهري الافتراضي (${cur})`}>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          </Field>
          <Field label="الحالة">
            <Select value={form.active ? "1" : "0"} onChange={(event) => setForm({ ...form, active: event.target.value === "1" })}>
              <option value="1">مفعّلة</option>
              <option value="0">موقوفة</option>
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">عند إنشاء عام جديد يقترح النظام السنة الحالية تلقائيًا، ويمكن تعديلها عند الحاجة.</p>
        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save}>حفظ</Button>
        </div>
      </Modal>
    </div>
  );
}

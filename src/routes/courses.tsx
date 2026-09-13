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
      { title: "الأعوام الدراسية — نظام إدارة المعهد" },
      { name: "description", content: "إدارة الأعوام الدراسية والقسط الشهري الافتراضي." },
      { property: "og:title", content: "الأعوام الدراسية — نظام إدارة المعهد" },
      { property: "og:description", content: "الأعوام الدراسية والأقساط الشهرية الافتراضية." },
    ],
  }),
  component: CoursesPage,
});

const EMPTY = { name: "", code: "", level: "", hours: "0", price: "0", active: true };

function CoursesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const rows = useMemo(() => {
    if (!db) return [];
    const term = q.trim().toLowerCase();
    return db.courses.filter((course) => {
      if (status === "active" && !course.active) return false;
      if (status === "inactive" && course.active) return false;
      return !term || course.name.toLowerCase().includes(term) || course.code.toLowerCase().includes(term);
    });
  }, [db, q, status]);

  if (!db) return null;
  if (!allowed("courses.view")) return <Denied />;
  const canEdit = allowed("courses.create");
  const cur = db.settings.currency;

  function save() {
    if (!form.name.trim()) return setError("اسم العام الدراسي إلزامي");
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      level: form.level.trim(),
      hours: Number(form.hours) || 0,
      default_price: toMinor(form.price),
      active: form.active,
    };
    try {
      if (editing) update("courses", editing.id, payload, actor, `تعديل العام الدراسي ${payload.name}`);
      else insert("courses", payload, actor, `إضافة العام الدراسي ${payload.name}`);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الأعوام الدراسية"
        subtitle={`${rows.length} من ${db.courses.length} عام دراسي`}
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
                setError(null);
                setOpen(true);
              }}
            >
              + عام دراسي جديد
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث باسم العام الدراسي أو الرمز" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option><option value="active">مفعّلة</option><option value="inactive">موقوفة</option>
        </Select>
      </div>

      {rows.length ? (
        <Table head={["العام الدراسي", "الرمز", "القسط الشهري الافتراضي", "الحالة", ""]}>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td className="font-semibold">{c.name}</Td>
              <Td>{c.code || "—"}</Td>
              <Td className="tabular-nums">{money(c.default_price, cur)}</Td>
              <Td>
                <Badge tone={c.active ? "success" : "muted"}>{c.active ? "مفعّلة" : "موقوفة"}</Badge>
              </Td>
              <Td>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(c);
                      setForm({
                        name: c.name,
                        code: c.code,
                        level: c.level,
                        hours: String(c.hours),
                        price: fromMinor(c.default_price),
                        active: c.active,
                      });
                      setError(null);
                      setOpen(true);
                    }}
                  >
                    تعديل
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="لا توجد أعوام دراسية مطابقة." />
      )}

      <Modal open={open} title={editing ? "تعديل عام دراسي" : "عام دراسي جديد"} onClose={() => setOpen(false)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم العام الدراسي">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="الرمز">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label={`القسط الشهري الافتراضي (${cur})`}>
            <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="الحالة">
            <Select value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
              <option value="1">مفعّلة</option>
              <option value="0">موقوفة</option>
            </Select>
          </Field>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={save}>حفظ</Button>
        </div>
      </Modal>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui-kit";
import { transact, audit, baseFields } from "@/lib/db";
import { today } from "@/lib/format";
import { attendanceRate } from "@/lib/grading";
import type { Attendance } from "@/lib/types";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [
      { title: "الحضور والغياب — نظام إدارة المعهد" },
      { name: "description", content: "تسجيل حضور وغياب الطلاب لكل صف بتاريخ محدد مع نسب الحضور." },
      { property: "og:title", content: "الحضور والغياب — نظام إدارة المعهد" },
      { property: "og:description", content: "تسجيل الحضور اليومي ونسب الالتزام لكل طالب." },
    ],
  }),
  component: AttendancePage,
});

const STATUSES: { key: Attendance["status"]; label: string }[] = [
  { key: "present", label: "حاضر" },
  { key: "late", label: "متأخر" },
  { key: "excused", label: "بعذر" },
  { key: "absent", label: "غائب" },
];

function AttendancePage() {
  const { db, actor, allowed } = useApp();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today());
  const [saved, setSaved] = useState(false);

  const roster = useMemo(() => {
    if (!db || !classId) return [];
    return db.enrollments
      .filter((e) => e.class_id === classId && e.status === "active")
      .map((e) => ({ enrollment: e, student: db.students.find((s) => s.id === e.student_id) }))
      .filter((r) => r.student);
  }, [db, classId]);

  if (!db) return null;
  if (!allowed("attendance.view")) return <Denied />;
  const canEdit = allowed("attendance.create");

  const current = (enrollmentId: string) =>
    db.attendance.find((a) => a.enrollment_id === enrollmentId && a.date === date);

  function mark(enrollmentId: string, status: Attendance["status"]) {
    transact((d) => {
      const existing = d.attendance.find((a) => a.enrollment_id === enrollmentId && a.date === date);
      if (existing) {
        existing.status = status;
        existing.updated_at = new Date().toISOString();
      } else {
        d.attendance.push({
          ...baseFields(),
          enrollment_id: enrollmentId,
          class_id: classId,
          date,
          status,
          note: "",
          recorded_by: actor.id,
        });
      }
      audit(d, actor, "attendance", enrollmentId, "mark", `تسجيل حضور ${date}: ${status}`);
    });
    setSaved(true);
  }

  function markAll(status: Attendance["status"]) {
    roster.forEach((r) => mark(r.enrollment.id, status));
  }

  return (
    <div>
      <PageHeader title="الحضور والغياب" subtitle="اختر الصف والتاريخ ثم سجّل الحالة لكل طالب" />

      <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-3">
        <Field label="الصف">
          <Select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSaved(false);
            }}
          >
            <option value="">— اختر —</option>
            {db.classes.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="التاريخ">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {canEdit && roster.length ? (
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => markAll("present")}>
              الجميع حاضر
            </Button>
            <Button variant="ghost" onClick={() => markAll("absent")}>
              الجميع غائب
            </Button>
          </div>
        ) : null}
      </div>

      {!classId ? (
        <Empty text="اختر صفًا لعرض قائمة الطلاب." />
      ) : roster.length === 0 ? (
        <Empty text="لا يوجد طلاب مسجّلون في هذا الصف." />
      ) : (
        <>
          {saved ? <p className="mb-3 text-sm font-semibold text-success">تم الحفظ تلقائيًا.</p> : null}
          <Table head={["الطالب", "الحالة اليوم", "نسبة الحضور", "تسجيل"]}>
            {roster.map(({ enrollment, student }) => {
              const rec = current(enrollment.id);
              const rate = attendanceRate(db, enrollment.id);
              return (
                <tr key={enrollment.id}>
                  <Td className="font-semibold">{student!.full_name}</Td>
                  <Td>
                    {rec ? (
                      <Badge
                        tone={
                          rec.status === "present" ? "success" : rec.status === "absent" ? "danger" : "warning"
                        }
                      >
                        {STATUSES.find((s) => s.key === rec.status)?.label}
                      </Badge>
                    ) : (
                      <Badge>لم يُسجّل</Badge>
                    )}
                  </Td>
                  <Td className="tabular-nums">{rate === null ? "—" : `${rate.toFixed(0)}%`}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <Button
                          key={s.key}
                          variant={rec?.status === s.key ? "primary" : "ghost"}
                          disabled={!canEdit}
                          onClick={() => mark(enrollment.id, s.key)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </div>
  );
}

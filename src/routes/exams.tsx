import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td } from "@/components/ui-kit";
import { audit, baseFields, insert, transact } from "@/lib/db";
import { dateStr, today } from "@/lib/format";
import { finalResult } from "@/lib/grading";
import type { Exam } from "@/lib/types";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "الامتحانات والعلامات — نظام إدارة المعهد" },
      { name: "description", content: "إنشاء الامتحانات وإدخال العلامات وحساب النتيجة النهائية الموزونة." },
      { property: "og:title", content: "الامتحانات والعلامات — نظام إدارة المعهد" },
      { property: "og:description", content: "الامتحانات، العلامات، والنتائج النهائية الموزونة." },
    ],
  }),
  component: ExamsPage,
});

function ExamsPage() {
  const { db, actor, allowed } = useApp();
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", type: "quiz" as Exam["type"], max: "100", weight: "15", date: today() });
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ gradeId: string; oldScore: number; newScore: number } | null>(null);
  const [reason, setReason] = useState("");

  const exams = useMemo(() => (db && classId ? db.exams.filter((e) => e.class_id === classId) : []), [db, classId]);
  const roster = useMemo(() => {
    if (!db || !classId) return [];
    return db.enrollments
      .filter((e) => e.class_id === classId && e.status !== "cancelled")
      .map((e) => ({ enrollment: e, student: db.students.find((s) => s.id === e.student_id) }))
      .filter((r) => r.student);
  }, [db, classId]);

  if (!db) return null;
  if (!allowed("exams.view")) return <Denied />;
  const canEdit = allowed("grades.create");

  function addExam() {
    if (!classId) return setError("اختر الصف أولًا");
    if (!form.title.trim()) return setError("عنوان الامتحان إلزامي");
    const max = Number(form.max);
    if (!(max > 0)) return setError("العلامة العظمى يجب أن تكون أكبر من صفر");
    try {
      insert(
        "exams",
        {
          class_id: classId,
          title: form.title.trim(),
          type: form.type,
          max_score: max,
          weight_snapshot: Number(form.weight) || 0,
          date: form.date,
        },
        actor,
        `إضافة امتحان ${form.title}`,
      );
      setOpen(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function setScore(examId: string, enrollmentId: string, raw: string) {
    const exam = db!.exams.find((e) => e.id === examId);
    if (!exam) return;
    const score = Math.max(0, Math.min(exam.max_score, Number(raw) || 0));
    const existing = db!.grades.find((g) => g.exam_id === examId && g.enrollment_id === enrollmentId);
    if (existing) {
      if (existing.score === score) return;
      setReasonFor({ gradeId: existing.id, oldScore: existing.score, newScore: score });
      setReason("");
      return;
    }
    transact((d) => {
      d.grades.push({ ...baseFields(), exam_id: examId, enrollment_id: enrollmentId, score, entered_by: actor.id });
      audit(d, actor, "grades", examId, "create", `إدخال علامة ${score}/${exam.max_score}`);
    });
  }

  function confirmRevision() {
    if (!reasonFor) return;
    if (!reason.trim()) return;
    transact((d) => {
      const g = d.grades.find((x) => x.id === reasonFor.gradeId);
      if (!g) return;
      d.grade_revisions.push({
        ...baseFields(),
        grade_id: g.id,
        old_score: g.old_score ?? reasonFor.oldScore,
        new_score: reasonFor.newScore,
        reason: reason.trim(),
        user_id: actor.id,
      } as never);
      g.score = reasonFor.newScore;
      g.updated_at = new Date().toISOString();
      audit(d, actor, "grades", g.id, "update", `تعديل علامة ${reasonFor.oldScore} ← ${reasonFor.newScore} — ${reason}`);
    });
    setReasonFor(null);
  }

  return (
    <div>
      <PageHeader
        title="الامتحانات والعلامات"
        subtitle="النتيجة النهائية تُحسب حسب أوزان الامتحانات ووزن الحضور"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setForm({ title: "", type: "quiz", max: "100", weight: "15", date: today() });
                setError(null);
                setOpen(true);
              }}
              disabled={!classId}
            >
              + امتحان جديد
            </Button>
          ) : null
        }
      />

      <div className="panel mb-5 p-4">
        <Field label="الصف">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">— اختر —</option>
            {db.classes.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!classId ? (
        <Empty text="اختر صفًا لعرض امتحاناته." />
      ) : (
        <div className="space-y-6">
          {exams.length ? (
            <Table head={["الامتحان", "النوع", "التاريخ", "العظمى", "الوزن %"]}>
              {exams.map((x) => (
                <tr key={x.id}>
                  <Td className="font-semibold">{x.title}</Td>
                  <Td>{x.type}</Td>
                  <Td>{dateStr(x.date)}</Td>
                  <Td className="tabular-nums">{x.max_score}</Td>
                  <Td className="tabular-nums">{x.weight_snapshot}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty text="لا توجد امتحانات لهذا الصف." />
          )}

          {roster.length && exams.length ? (
            <Table head={["الطالب", ...exams.map((e) => `${e.title} /${e.max_score}`), "النتيجة", "الحالة"]}>
              {roster.map(({ enrollment, student }) => {
                const res = finalResult(db, enrollment.id);
                return (
                  <tr key={enrollment.id}>
                    <Td className="font-semibold">{student!.full_name}</Td>
                    {exams.map((x) => {
                      const g = db.grades.find((y) => y.exam_id === x.id && y.enrollment_id === enrollment.id);
                      return (
                        <Td key={x.id}>
                          <Input
                            className="w-20 tabular-nums"
                            type="number"
                            disabled={!canEdit}
                            defaultValue={g ? String(g.score) : ""}
                            onBlur={(e) => e.target.value !== "" && setScore(x.id, enrollment.id, e.target.value)}
                          />
                        </Td>
                      );
                    })}
                    <Td className="tabular-nums font-bold">
                      {res?.total === null || res?.total === undefined ? "—" : `${res.total.toFixed(1)}%`}
                    </Td>
                    <Td>
                      {res?.total === null || res?.total === undefined ? (
                        <Badge>غير مكتمل</Badge>
                      ) : (
                        <Badge tone={res.passed ? "success" : "danger"}>{res.passed ? "ناجح" : "راسب"}</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : null}
        </div>
      )}

      <Modal open={open} title="امتحان جديد" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="العنوان">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النوع">
              <Select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as Exam["type"];
                  const w = db.settings.grading.weights;
                  const weight = type === "final" ? w.final : type === "midterm" ? w.midterm : type === "quiz" ? w.quiz : 0;
                  setForm({ ...form, type, weight: String(weight) });
                }}
              >
                <option value="final">نهائي</option>
                <option value="midterm">نصفي</option>
                <option value="quiz">اختبار قصير</option>
                <option value="other">أخرى</option>
              </Select>
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="العلامة العظمى">
              <Input type="number" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />
            </Field>
            <Field label="الوزن %">
              <Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </Field>
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={addExam}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!reasonFor} title="سبب تعديل العلامة" onClose={() => setReasonFor(null)}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {reasonFor?.oldScore} ← {reasonFor?.newScore} — تعديل العلامات يتطلب سببًا ويُسجَّل في سجل المراجعات.
          </p>
          <Field label="السبب">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReasonFor(null)}>
              إلغاء
            </Button>
            <Button onClick={confirmRevision} disabled={!reason.trim()}>
              تأكيد
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

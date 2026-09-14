import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Button, Field, Input, Modal, Select } from "@/components/ui-kit";
import { createMonthlyEnrollmentWithInvoice } from "@/lib/finance";
import { fromMinor, localMonthKey, money, toMinor } from "@/lib/format";

interface StudentEnrollmentModalProps {
  open: boolean;
  studentId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type EnrollmentForm = {
  course_id: string;
  class_id: string;
  price: string;
  discount: string;
  registration_fee: string;
  discount_preset_id: string;
  reason: string;
  start_period: string;
};

const EMPTY: EnrollmentForm = {
  course_id: "",
  class_id: "",
  price: "0",
  discount: "0",
  registration_fee: "0",
  discount_preset_id: "",
  reason: "",
  start_period: localMonthKey(),
};

export function StudentEnrollmentModal({ open, studentId, onClose, onSuccess }: StudentEnrollmentModalProps) {
  const { db, actor, allowed } = useApp();
  const [form, setForm] = useState<EnrollmentForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const activeCourses = useMemo(() => db?.courses.filter((course) => course.active) ?? [], [db]);
  const eligibleClasses = useMemo(() => {
    if (!db || !form.course_id) return [];
    return db.classes.filter((klass) => klass.course_id === form.course_id && klass.status === "running");
  }, [db, form.course_id]);

  useEffect(() => {
    if (!open || !db) return;
    const course = activeCourses[0];
    const firstClass = course
      ? db.classes.find((klass) => klass.course_id === course.id && klass.status === "running")
      : undefined;
    setForm({
      ...EMPTY,
      course_id: course?.id ?? "",
      class_id: firstClass?.id ?? "",
      price: fromMinor(course?.default_price ?? 0),
      start_period: localMonthKey(),
    });
    setError(null);
  }, [open, db, activeCourses]);

  if (!db || !studentId) return null;
  const student = db.students.find((item) => item.id === studentId);
  if (!student) return null;
  const currentDb = db;
  const currentStudent = student;
  const cur = currentDb.settings.currency;
  const canEnroll = allowed("enrollments.create");

  function changeCourse(courseId: string) {
    const course = currentDb.courses.find((item) => item.id === courseId);
    const firstClass = currentDb.classes.find((klass) => klass.course_id === courseId && klass.status === "running");
    setForm((current) => ({
      ...current,
      course_id: courseId,
      class_id: firstClass?.id ?? "",
      price: fromMinor(course?.default_price ?? 0),
      discount: "0",
      discount_preset_id: "",
      reason: "",
    }));
  }

  function save() {
    if (!canEnroll) return setError("لا تملك صلاحية تسجيل الطلاب");
    if (!form.course_id) return setError("اختر العام الدراسي");
    if (!form.class_id) return setError("اختر الصف");
    const klass = currentDb.classes.find((item) => item.id === form.class_id);
    if (!klass || klass.course_id !== form.course_id || klass.status !== "running") {
      return setError("الصف المختار غير متاح للتسجيل ضمن هذا العام الدراسي");
    }
    const preset = currentDb.settings.discount_presets.find(
      (item) => item.id === form.discount_preset_id && item.active,
    );
    try {
      createMonthlyEnrollmentWithInvoice(
        {
          student_id: currentStudent.id,
          class_id: form.class_id,
          monthly_price: toMinor(form.price),
          discount: toMinor(form.discount),
          discount_preset_id: preset?.id ?? null,
          discount_title: preset?.title ?? form.reason.trim(),
          registration_fee: toMinor(form.registration_fee),
          start_period: form.start_period,
        },
        actor,
      );
      setError(null);
      onSuccess?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const netMonthly = Math.max(0, toMinor(form.price) - toMinor(form.discount));

  return (
    <Modal open={open} title={`تسجيل الطالب — ${currentStudent.full_name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-3 text-sm">
          <p><b>الطالب:</b> {currentStudent.full_name}</p>
          <p className="text-xs text-muted-foreground">{currentStudent.code}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="العام الدراسي">
            <Select value={form.course_id} onChange={(e) => changeCourse(e.target.value)}>
              <option value="">— اختر العام الدراسي —</option>
              {activeCourses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="الصف">
            <Select
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              disabled={!form.course_id}
            >
              <option value="">— اختر الصف —</option>
              {eligibleClasses.map((klass) => (
                <option key={klass.id} value={klass.id}>{klass.name}</option>
              ))}
            </Select>
          </Field>

          <Field label={`القسط الشهري الأساسي (${cur})`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </Field>

          <Field label="الخصم المحدد">
            <Select
              value={form.discount_preset_id}
              onChange={(e) => {
                const id = e.target.value;
                const preset = currentDb.settings.discount_presets.find((item) => item.id === id && item.active);
                setForm({
                  ...form,
                  discount_preset_id: id,
                  discount: preset ? fromMinor(preset.amount) : "0",
                  reason: preset?.title ?? "",
                });
              }}
            >
              <option value="">بدون خصم جاهز</option>
              {currentDb.settings.discount_presets.filter((item) => item.active).map((item) => (
                <option key={item.id} value={item.id}>{item.title} — {money(item.amount, cur)}</option>
              ))}
            </Select>
          </Field>

          <Field label={`قيمة الخصم (${cur})`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.discount}
              disabled={!!form.discount_preset_id}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
            />
          </Field>

          <Field label="بداية الاستحقاق الشهري">
            <Input
              type="month"
              value={form.start_period}
              onChange={(e) => setForm({ ...form, start_period: e.target.value })}
            />
          </Field>

          <Field label={`رسوم تسجيل لمرة واحدة (${cur})`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.registration_fee}
              onChange={(e) => setForm({ ...form, registration_fee: e.target.value })}
            />
          </Field>

          {!form.discount_preset_id ? (
            <Field label="عنوان الخصم اليدوي / ملاحظة">
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
          ) : null}
        </div>

        <div className="rounded-xl bg-muted p-3 text-sm">
          <p>القسط الشهري بعد الخصم: <b>{money(netMonthly, cur)}</b></p>
          <p className="mt-1 text-xs text-muted-foreground">
            يبدأ التوليد المالي من الشهر المحدد. الأشهر المستقبلية لا تصبح دينًا فعليًا إلا عند دخولها وتوليد استحقاقها.
          </p>
        </div>

        {!eligibleClasses.length && form.course_id ? (
          <p className="text-sm font-semibold text-warning">لا توجد صفوف جارية ضمن هذا العام الدراسي.</p>
        ) : null}
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={!canEnroll || !form.class_id}>تسجيل وبدء الاستحقاق الشهري</Button>
        </div>
      </div>
    </Modal>
  );
}

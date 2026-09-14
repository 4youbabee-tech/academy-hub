import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import {
  cancelEnrollmentWithInvoice,
  createMonthlyEnrollmentWithInvoice,
  createEnrollmentWithInvoice,
  invoiceFinancials,
  stopMonthlyEnrollment,
  transitionLegacyEnrollmentToMonthly,
  updateEnrollmentWithInvoice,
  updateMonthlyEnrollmentTerms,
} from "@/lib/finance";
import { dateStr, fromMinor, localMonthKey, money, today, toMinor, WEEKDAYS } from "@/lib/format";
import type { Enrollment, Klass } from "@/lib/types";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/classes")({
  head: () => ({
    meta: [
      { title: "الصفوف والتسجيل — نظام إدارة المعهد" },
      { name: "description", content: "إدارة الصفوف الدراسية والمدرّسين والجداول الأسبوعية وتسجيل الطلاب." },
      { property: "og:title", content: "الصفوف والتسجيل — نظام إدارة المعهد" },
      { property: "og:description", content: "الصفوف والمدرّسون والجداول الأسبوعية وتسجيل الطلاب." },
    ],
  }),
  component: ClassesPage,
});

function defaultClassEndDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

const EMPTY = {
  name: "",
  course_id: "",
  teacher_id: "",
  term: "",
  capacity: "20",
  start_date: today(),
  end_date: defaultClassEndDate(),
  status: "running" as Klass["status"],
};

const EMPTY_ENROLL = {
  student_id: "",
  price: "0",
  discount: "0",
  registration_fee: "0",
  reason: "",
  discount_preset_id: "",
  start_period: localMonthKey(),
};

function ClassesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Klass | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [slots, setSlots] = useState<Klass["schedule"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classQuery, setClassQuery] = useState("");
  const [classStatus, setClassStatus] = useState("");

  const [enrollFor, setEnrollFor] = useState<Klass | null>(null);
  const [enrollForm, setEnrollForm] = useState(EMPTY_ENROLL);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [registrantsFor, setRegistrantsFor] = useState<Klass | null>(null);
  const [registrantQuery, setRegistrantQuery] = useState("");
  const [transitionEnrollment, setTransitionEnrollment] = useState<Enrollment | null>(null);
  const [transitionForm, setTransitionForm] = useState(EMPTY_ENROLL);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [editEnrollForm, setEditEnrollForm] = useState(EMPTY_ENROLL);
  const [editEnrollError, setEditEnrollError] = useState<string | null>(null);
  const [cancelEnrollment, setCancelEnrollment] = useState<Enrollment | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    db?.enrollments.forEach((e) => {
      if (e.status === "cancelled" || e.status === "withdrawn") return;
      m.set(e.class_id, (m.get(e.class_id) ?? 0) + 1);
    });
    return m;
  }, [db]);

  const classes = useMemo(() => {
    if (!db) return [];
    const term = classQuery.trim().toLowerCase();
    const courseById = new Map(db.courses.map((item) => [item.id, item.name.toLowerCase()]));
    const teacherById = new Map(db.employees.map((item) => [item.id, item.full_name.toLowerCase()]));
    const studentById = new Map(db.students.map((item) => [item.id, item.full_name.toLowerCase()]));
    const studentNamesByClass = new Map<string, string[]>();
    for (const enrollment of db.enrollments) {
      if (enrollment.status === "cancelled") continue;
      const name = studentById.get(enrollment.student_id);
      if (!name) continue;
      studentNamesByClass.set(enrollment.class_id, [...(studentNamesByClass.get(enrollment.class_id) ?? []), name]);
    }
    return db.classes.filter((klass) => {
      if (classStatus && klass.status !== classStatus) return false;
      if (!term) return true;
      const values = [klass.name.toLowerCase(), courseById.get(klass.course_id) ?? "", klass.teacher_id ? teacherById.get(klass.teacher_id) ?? "" : "", ...(studentNamesByClass.get(klass.id) ?? [])];
      return values.some((value) => value.includes(term));
    });
  }, [db, classQuery, classStatus]);
  const registrants = useMemo(() => {
    if (!db || !registrantsFor) return [];
    const term = registrantQuery.trim().toLowerCase();
    const studentById = new Map(db.students.map((student) => [student.id, student]));
    return db.enrollments
      .filter((enrollment) => enrollment.class_id === registrantsFor.id)
      .filter((enrollment) => {
        if (!term) return true;
        const student = studentById.get(enrollment.student_id);
        return Boolean(student && (student.full_name.toLowerCase().includes(term) || student.code.toLowerCase().includes(term)));
      })
      .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
  }, [db, registrantsFor, registrantQuery]);
  const classPagination = usePagination(classes, "classes");
  const registrantPagination = usePagination(registrants, `${registrantsFor?.id ?? "none"}|${registrantQuery}`);

  if (!db) return null;
  if (!allowed("classes.view")) return <Denied />;
  const currentDb = db;
  const canEdit = allowed("classes.create");
  const canEnroll = allowed("enrollments.create");
  const canManageEnrollments = allowed("enrollments.update");
  const canViewFinance = allowed("finance.view");
  const cur = currentDb.settings.currency;

  const courseName = (id: string) => currentDb.courses.find((c) => c.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => currentDb.employees.find((e) => e.id === id)?.full_name ?? "—";

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, course_id: currentDb.courses[0]?.id ?? "" });
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
    if (!form.course_id) return setError("اختر العام الدراسي");
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
    const course = currentDb.courses.find((c) => c.id === k.course_id);
    setEnrollFor(k);
    setEnrollForm({
      student_id: "",
      price: fromMinor(course?.default_price ?? 0),
      discount: "0",
      registration_fee: "0",
      reason: "",
      discount_preset_id: "",
      start_period: localMonthKey(),
    });
    setEnrollError(null);
  }

  function buildInstallments(priceText: string, discountText: string, firstDueDate?: string) {
    const price = toMinor(priceText);
    const discount = toMinor(discountText);
    const tuition = Math.max(0, price - discount);
    const dueDate = firstDueDate || today();
    // استحقاق داخلي واحد فقط لقيمة الدورة؛ العامل غير ملزم بخطة أقساط.
    const installments = tuition > 0 ? [{ due_date: dueDate, amount: tuition }] : [];
    return { price, discount, tuition, installments };
  }

  function submitEnroll() {
    if (!enrollFor) return;
    if (!enrollForm.student_id) return setEnrollError("اختر الطالب");
    const exists = currentDb.enrollments.some(
      (e) => e.class_id === enrollFor.id && e.student_id === enrollForm.student_id && e.status === "active",
    );
    if (exists) return setEnrollError("الطالب مسجّل مسبقًا في هذا الصف");
    const used = counts.get(enrollFor.id) ?? 0;
    if (enrollFor.capacity > 0 && used >= enrollFor.capacity) return setEnrollError("الصف مكتمل العدد");

    const price = toMinor(enrollForm.price);
    const discount = toMinor(enrollForm.discount);
    const registrationFee = toMinor(enrollForm.registration_fee);
    const preset = currentDb.settings.discount_presets.find((item) => item.id === enrollForm.discount_preset_id && item.active);
    const discountTitle = preset?.title ?? enrollForm.reason.trim();

    try {
      createMonthlyEnrollmentWithInvoice(
        {
          student_id: enrollForm.student_id,
          class_id: enrollFor.id,
          monthly_price: price,
          discount,
          discount_preset_id: preset?.id ?? null,
          discount_title: discountTitle,
          registration_fee: registrationFee,
          start_period: enrollForm.start_period,
        },
        actor,
      );
      setEnrollFor(null);
      setEnrollError(null);
    } catch (e) {
      setEnrollError((e as Error).message);
    }
  }

  function openEnrollmentEdit(enrollment: Enrollment) {
    const invoice = currentDb.invoices.find((i) => i.enrollment_id === enrollment.id && i.status !== "cancelled");
    const invoiceInstallments = invoice ? currentDb.installments.filter((i) => i.invoice_id === invoice.id) : [];
    const registration = invoiceInstallments.find((i) => i.kind === "registration");

    setEditingEnrollment(enrollment);
    setEditEnrollForm({
      student_id: enrollment.student_id,
      price: fromMinor(enrollment.price_snapshot),
      discount: fromMinor(enrollment.discount_snapshot),
      registration_fee: fromMinor(registration?.amount ?? 0),
      reason: enrollment.discount_reason || "",
      discount_preset_id: enrollment.discount_preset_id ?? "",
      start_period: enrollment.billing_start_period ?? localMonthKey(),
    });
    setEditEnrollError(null);
  }

  function submitEnrollmentEdit() {
    if (!editingEnrollment) return;
    if (editingEnrollment.billing_mode === "monthly") {
      const price = toMinor(editEnrollForm.price);
      const discount = toMinor(editEnrollForm.discount);
      const preset = currentDb.settings.discount_presets.find((item) => item.id === editEnrollForm.discount_preset_id && item.active);
      try {
        updateMonthlyEnrollmentTerms({
          enrollment_id: editingEnrollment.id,
          monthly_price: price,
          discount,
          discount_preset_id: preset?.id ?? null,
          discount_title: preset?.title ?? editEnrollForm.reason.trim(),
        }, actor);
        setEditingEnrollment(null);
        setEditEnrollError(null);
      } catch (e) {
        setEditEnrollError((e as Error).message);
      }
      return;
    }
    const invoice = currentDb.invoices.find((i) => i.enrollment_id === editingEnrollment.id && i.status !== "cancelled");
    const firstDueDate = invoice
      ? currentDb.installments.find((i) => i.invoice_id === invoice.id && i.kind !== "registration")?.due_date
      : undefined;
    const { price, discount, installments } = buildInstallments(
      editEnrollForm.price,
      editEnrollForm.discount,
      firstDueDate,
    );
    const registrationFee = toMinor(editEnrollForm.registration_fee);

    try {
      updateEnrollmentWithInvoice(
        {
          enrollment_id: editingEnrollment.id,
          price,
          discount,
          registration_fee: registrationFee,
          discount_reason: editEnrollForm.reason.trim() || "تسجيل",
          installments,
        },
        actor,
      );
      setEditingEnrollment(null);
      setEditEnrollError(null);
    } catch (e) {
      setEditEnrollError((e as Error).message);
    }
  }

  function openTransition(enrollment: Enrollment) {
    const klass = currentDb.classes.find((item) => item.id === enrollment.class_id);
    const course = klass ? currentDb.courses.find((item) => item.id === klass.course_id) : undefined;
    setTransitionEnrollment(enrollment);
    setTransitionForm({
      ...EMPTY_ENROLL,
      student_id: enrollment.student_id,
      price: fromMinor(course?.default_price ?? 0),
      start_period: localMonthKey(),
    });
    setTransitionError(null);
  }

  function submitTransition() {
    if (!transitionEnrollment) return;
    const price = toMinor(transitionForm.price);
    const discount = toMinor(transitionForm.discount);
    const preset = currentDb.settings.discount_presets.find((item) => item.id === transitionForm.discount_preset_id && item.active);
    try {
      transitionLegacyEnrollmentToMonthly({
        enrollment_id: transitionEnrollment.id,
        monthly_price: price,
        discount,
        discount_preset_id: preset?.id ?? null,
        discount_title: preset?.title ?? transitionForm.reason.trim(),
        start_period: transitionForm.start_period,
      }, actor);
      setTransitionEnrollment(null);
      setTransitionError(null);
    } catch (e) {
      setTransitionError((e as Error).message);
    }
  }

  function submitCancelEnrollment() {
    if (!cancelEnrollment) return;
    try {
      if (cancelEnrollment.billing_mode === "monthly") {
        stopMonthlyEnrollment(cancelEnrollment.id, localMonthKey(), actor);
      } else {
        cancelEnrollmentWithInvoice(cancelEnrollment.id, actor);
      }
      setCancelEnrollment(null);
      setCancelError(null);
    } catch (e) {
      setCancelError((e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="الصفوف والتسجيل"
        subtitle={`${classes.length} من ${currentDb.classes.length} صف`}
        actions={canEdit ? <Button onClick={openNew}>+ صف جديد</Button> : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input value={classQuery} onChange={(e) => setClassQuery(e.target.value)} placeholder="بحث بالصف أو العام الدراسي أو المدرّس أو اسم طالب" />
        <Select value={classStatus} onChange={(e) => setClassStatus(e.target.value)}>
          <option value="">كل الحالات</option><option value="running">جارٍ</option><option value="finished">منتهٍ</option>
        </Select>
      </div>

      {classes.length ? (
        <>
        <Table head={["الصف", "العام الدراسي", "المدرّس", "الفصل", "الفترة", "المسجّلون", "الحالة", ""]}>
          {classPagination.rows.map((k) => (
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
                  {k.status === "finished" ? "منتهٍ" : "جارٍ"}
                </Badge>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRegistrantsFor(k);
                      setCancelError(null);
                    }}
                  >
                    المسجّلون
                  </Button>
                  {canEnroll ? (
                    <Button variant="ghost" onClick={() => openEnroll(k)}>
                      تسجيل طالب
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button variant="ghost" onClick={() => openEdit(k)}>
                      تعديل الصف
                    </Button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        <PaginationControls
          page={classPagination.page}
          pageCount={classPagination.pageCount}
          pageSize={classPagination.pageSize}
          total={classPagination.total}
          from={classPagination.from}
          to={classPagination.to}
          onPrevious={classPagination.previous}
          onNext={classPagination.next}
          onPageSizeChange={classPagination.setPageSize}
        />
        </>
      ) : (
        <Empty text="لا توجد صفوف بعد." />
      )}

      <Modal open={open} title={editing ? "تعديل صف" : "صف جديد"} onClose={() => setOpen(false)} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الصف">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="العام الدراسي">
            <Select
              value={form.course_id}
              onChange={(e) => setForm({ ...form, course_id: e.target.value })}
              disabled={!!editing && currentDb.enrollments.some((enrollment) => enrollment.class_id === editing.id)}
            >
              <option value="">— اختر —</option>
              {currentDb.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {editing && currentDb.enrollments.some((enrollment) => enrollment.class_id === editing.id) ? (
              <span className="block text-xs text-muted-foreground">لا يمكن تغيير العام الدراسي لأن الصف يحتوي على سجلات تسجيل.</span>
            ) : null}
          </Field>
          <Field label="المدرّس">
            <Select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">— بدون —</option>
              {currentDb.employees
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
            <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Klass["status"] })}>
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

      <Modal open={!!enrollFor} title={`تسجيل طالب — ${enrollFor?.name ?? ""}`} onClose={() => setEnrollFor(null)}>
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p><b>العام الدراسي:</b> {enrollFor ? courseName(enrollFor.course_id) : "—"}</p>
            <p><b>الصف:</b> {enrollFor?.name ?? "—"}</p>
            <p><b>المدرّس:</b> {enrollFor ? teacherName(enrollFor.teacher_id) : "—"}</p>
          </div>
          <Field label="الطالب">
            <Select value={enrollForm.student_id} onChange={(e) => setEnrollForm({ ...enrollForm, student_id: e.target.value })}>
              <option value="">— اختر —</option>
              {currentDb.students
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.code})
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`القسط الشهري الأساسي (${cur})`}>
              <Input value={enrollForm.price} onChange={(e) => setEnrollForm({ ...enrollForm, price: e.target.value })} />
            </Field>
            <Field label="الخصم المحدد">
              <Select value={enrollForm.discount_preset_id} onChange={(e) => {
                const id = e.target.value;
                const preset = currentDb.settings.discount_presets.find((item) => item.id === id && item.active);
                setEnrollForm({ ...enrollForm, discount_preset_id: id, discount: preset ? fromMinor(preset.amount) : "0", reason: preset?.title ?? "" });
              }}>
                <option value="">بدون خصم جاهز</option>
                {currentDb.settings.discount_presets.filter((item) => item.active).map((item) => (
                  <option key={item.id} value={item.id}>{item.title} — {money(item.amount, cur)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`قيمة الخصم (${cur})`}>
              <Input value={enrollForm.discount} disabled={!!enrollForm.discount_preset_id} onChange={(e) => setEnrollForm({ ...enrollForm, discount: e.target.value })} />
            </Field>
            <Field label="بداية الاستحقاق الشهري">
              <Input type="month" value={enrollForm.start_period} onChange={(e) => setEnrollForm({ ...enrollForm, start_period: e.target.value })} />
            </Field>
          </div>
          <Field label={`رسوم التسجيل (${cur})`} hint="تُضاف إلى إجمالي المستحق ولا تُعتبر مقبوضة إلا عند إصدار سند قبض">
            <Input
              type="number"
              step="0.01"
              value={enrollForm.registration_fee}
              onChange={(e) => setEnrollForm({ ...enrollForm, registration_fee: e.target.value })}
            />
          </Field>
          {!enrollForm.discount_preset_id ? (
            <Field label="عنوان الخصم اليدوي / ملاحظة">
              <Input value={enrollForm.reason} onChange={(e) => setEnrollForm({ ...enrollForm, reason: e.target.value })} />
            </Field>
          ) : null}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p>القسط الشهري بعد الخصم: <b>{money(Math.max(0, toMinor(enrollForm.price) - toMinor(enrollForm.discount)), cur)}</b></p>
            <p className="mt-1 text-xs text-muted-foreground">رسوم التسجيل لمرة واحدة: {money(toMinor(enrollForm.registration_fee), cur)}</p>
          </div>
          {enrollError ? <p className="text-sm font-semibold text-destructive">{enrollError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEnrollFor(null)}>
              إلغاء
            </Button>
            <Button onClick={submitEnroll}>تسجيل وبدء الاستحقاق الشهري</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!registrantsFor} title={`المسجّلون — ${registrantsFor?.name ?? ""}`} onClose={() => setRegistrantsFor(null)} wide>
        <Input className="mb-3" value={registrantQuery} onChange={(e) => setRegistrantQuery(e.target.value)} placeholder="بحث باسم الطالب أو الرمز" />
        {registrants.length ? (
          <>
          <Table head={canViewFinance
            ? ["الطالب", "تاريخ التسجيل", "إجمالي المستحق", "المقبوض", "المتبقي", "الحالة", ""]
            : ["الطالب", "تاريخ التسجيل", "الحالة", ""]}>
            {registrantPagination.rows.map((enrollment) => {
              const student = currentDb.students.find((s) => s.id === enrollment.student_id);
              const invoice = currentDb.invoices.find((i) => i.enrollment_id === enrollment.id);
              const financials = invoice ? invoiceFinancials(currentDb, invoice) : { total: 0, paid: 0, due: 0 };
              return (
                <tr key={enrollment.id}>
                  <Td>
                    <Link to="/students/$id" params={{ id: enrollment.student_id }} className="font-semibold text-primary hover:underline">
                      {student?.full_name || "—"}
                    </Link>
                  </Td>
                  <Td>{dateStr(enrollment.enrolled_at)}</Td>
                  {canViewFinance ? (
                    <>
                      <Td className="tabular-nums">{money(financials.total, cur)}</Td>
                      <Td className="tabular-nums">{money(financials.paid, cur)}</Td>
                      <Td className={financials.due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{money(financials.due, cur)}</Td>
                    </>
                  ) : null}
                  <Td>
                    <Badge tone={enrollment.status === "active" ? "success" : "muted"}>
                      {enrollment.status === "active" ? "نشط" : enrollment.status === "completed" ? "منتهٍ" : enrollment.status === "withdrawn" ? "منسحب" : "ملغى"}
                    </Badge>
                  </Td>
                  <Td>
                    {canManageEnrollments && enrollment.status === "active" ? (
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" onClick={() => openEnrollmentEdit(enrollment)}>
                          {enrollment.billing_mode === "monthly" ? "تعديل القسط المستقبلي" : "تعديل التسجيل"}
                        </Button>
                        {enrollment.billing_mode !== "monthly" ? (
                          <Button variant="secondary" onClick={() => openTransition(enrollment)}>تحويل إلى شهري</Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setCancelEnrollment(enrollment);
                            setCancelError(null);
                          }}
                        >
                          {enrollment.billing_mode === "monthly" ? "إيقاف التسجيل" : "إلغاء التسجيل"}
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <PaginationControls
            page={registrantPagination.page}
            pageCount={registrantPagination.pageCount}
            pageSize={registrantPagination.pageSize}
            total={registrantPagination.total}
            from={registrantPagination.from}
            to={registrantPagination.to}
            onPrevious={registrantPagination.previous}
            onNext={registrantPagination.next}
            onPageSizeChange={registrantPagination.setPageSize}
          />
          </>
        ) : (
          <Empty text="لا يوجد طلاب مسجلون في هذا الصف." />
        )}
      </Modal>

      <Modal open={!!editingEnrollment} title="تعديل تسجيل الطالب" onClose={() => setEditingEnrollment(null)}>
        <div className="space-y-3">
          <Field label="الطالب">
            <Input
              value={currentDb.students.find((s) => s.id === editingEnrollment?.student_id)?.full_name || "—"}
              disabled
            />
          </Field>
          {editingEnrollment?.billing_mode === "monthly" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`القسط الشهري الأساسي (${cur})`}>
                  <Input value={editEnrollForm.price} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, price: e.target.value })} />
                </Field>
                <Field label="الخصم المحدد">
                  <Select value={editEnrollForm.discount_preset_id} onChange={(e) => {
                    const id = e.target.value;
                    const preset = currentDb.settings.discount_presets.find((item) => item.id === id && item.active);
                    setEditEnrollForm({ ...editEnrollForm, discount_preset_id: id, discount: preset ? fromMinor(preset.amount) : "0", reason: preset?.title ?? "" });
                  }}>
                    <option value="">بدون خصم جاهز</option>
                    {currentDb.settings.discount_presets.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title} — {money(item.amount, cur)}</option>)}
                  </Select>
                </Field>
                <Field label={`قيمة الخصم (${cur})`}>
                  <Input value={editEnrollForm.discount} disabled={!!editEnrollForm.discount_preset_id} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, discount: e.target.value })} />
                </Field>
              </div>
              {!editEnrollForm.discount_preset_id ? <Field label="عنوان الخصم اليدوي / ملاحظة"><Input value={editEnrollForm.reason} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, reason: e.target.value })} /></Field> : null}
              <p className="rounded-lg bg-muted p-3 text-sm">القسط الجديد للأشهر القادمة: <b>{money(Math.max(0, toMinor(editEnrollForm.price) - toMinor(editEnrollForm.discount)), cur)}</b></p>
              <p className="text-xs text-muted-foreground">الأشهر التي تم توليدها سابقاً لن تتغير. القيم الجديدة تطبق فقط عند توليد استحقاق شهري جديد.</p>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`قيمة التسجيل القديمة (${cur})`}><Input value={editEnrollForm.price} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, price: e.target.value })} /></Field>
                <Field label={`الخصم (${cur})`}><Input value={editEnrollForm.discount} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, discount: e.target.value })} /></Field>
              </div>
              <Field label={`رسوم التسجيل (${cur})`}><Input type="number" step="0.01" value={editEnrollForm.registration_fee} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, registration_fee: e.target.value })} /></Field>
              <Field label="سبب الخصم / ملاحظة"><Input value={editEnrollForm.reason} onChange={(e) => setEditEnrollForm({ ...editEnrollForm, reason: e.target.value })} /></Field>
              <p className="rounded-lg bg-muted p-3 text-sm">إجمالي المستحق بعد التعديل: <b>{money(Math.max(0, toMinor(editEnrollForm.price) - toMinor(editEnrollForm.discount) + toMinor(editEnrollForm.registration_fee)), cur)}</b></p>
              <p className="text-xs text-muted-foreground">إذا كان على هذا التسجيل سند قبض فعلي، سيمنع النظام تعديل القيم لحماية الحسابات.</p>
            </>
          )}
          {editEnrollError ? <p className="text-sm font-semibold text-destructive">{editEnrollError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingEnrollment(null)}>
              إلغاء
            </Button>
            <Button onClick={submitEnrollmentEdit}>حفظ التعديل</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!transitionEnrollment} title="تحويل التسجيل القديم إلى شهري" onClose={() => setTransitionEnrollment(null)}>
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            <p><b>الطالب:</b> {currentDb.students.find((item) => item.id === transitionEnrollment?.student_id)?.full_name ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">الفاتورة القديمة ستبقى كما هي ولن تتغير أو تُحذف. سيُنشأ حساب شهري جديد من الشهر الذي تختاره.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`القسط الشهري الأساسي (${cur})`}><Input value={transitionForm.price} onChange={(e) => setTransitionForm({ ...transitionForm, price: e.target.value })} /></Field>
            <Field label="الخصم المحدد">
              <Select value={transitionForm.discount_preset_id} onChange={(e) => {
                const id = e.target.value;
                const preset = currentDb.settings.discount_presets.find((item) => item.id === id && item.active);
                setTransitionForm({ ...transitionForm, discount_preset_id: id, discount: preset ? fromMinor(preset.amount) : "0", reason: preset?.title ?? "" });
              }}>
                <option value="">بدون خصم جاهز</option>
                {currentDb.settings.discount_presets.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title} — {money(item.amount, cur)}</option>)}
              </Select>
            </Field>
            <Field label={`قيمة الخصم (${cur})`}><Input value={transitionForm.discount} disabled={!!transitionForm.discount_preset_id} onChange={(e) => setTransitionForm({ ...transitionForm, discount: e.target.value })} /></Field>
            <Field label="بداية النظام الشهري"><Input type="month" value={transitionForm.start_period} onChange={(e) => setTransitionForm({ ...transitionForm, start_period: e.target.value })} /></Field>
          </div>
          {!transitionForm.discount_preset_id ? <Field label="عنوان الخصم اليدوي / ملاحظة"><Input value={transitionForm.reason} onChange={(e) => setTransitionForm({ ...transitionForm, reason: e.target.value })} /></Field> : null}
          <p className="rounded-lg bg-muted p-3 text-sm">القسط الشهري بعد الخصم: <b>{money(Math.max(0, toMinor(transitionForm.price) - toMinor(transitionForm.discount)), cur)}</b></p>
          {transitionError ? <p className="text-sm font-semibold text-destructive">{transitionError}</p> : null}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTransitionEnrollment(null)}>تراجع</Button><Button onClick={submitTransition}>تأكيد التحويل</Button></div>
        </div>
      </Modal>

      <Modal open={!!cancelEnrollment} title="إلغاء تسجيل الطالب" onClose={() => setCancelEnrollment(null)}>
        <div className="space-y-3">
          <p className="text-sm">
            {cancelEnrollment?.billing_mode === "monthly" ? "هل تريد إيقاف الاستحقاقات الشهرية للطالب " : "هل تريد إلغاء تسجيل "}<b>{currentDb.students.find((s) => s.id === cancelEnrollment?.student_id)?.full_name || "الطالب"}</b>؟
          </p>
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {cancelEnrollment?.billing_mode === "monthly" ? "سيبقى كل الدين والتاريخ المالي السابق محفوظاً، وسيتوقف فقط توليد الأشهر المستقبلية بعد الشهر الحالي." : "إذا كان على التسجيل سند قبض فعلي، سيمنع النظام الإلغاء إلى أن يتم إلغاء السند المالي أولًا."}
          </p>
          {cancelError ? <p className="text-sm font-semibold text-destructive">{cancelError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelEnrollment(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={submitCancelEnrollment}>
              {cancelEnrollment?.billing_mode === "monthly" ? "تأكيد إيقاف التسجيل" : "تأكيد إلغاء التسجيل"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

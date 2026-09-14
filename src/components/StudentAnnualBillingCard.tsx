import { useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, Panel, Table, Td } from "@/components/ui-kit";
import { useApp } from "@/lib/session";
import {
  restoreMonthlyEnrollmentPeriod,
  skipMonthlyEnrollmentPeriod,
  stopMonthlyEnrollment,
  studentMonthlyLedger,
} from "@/lib/finance";
import { localMonthKey, money } from "@/lib/format";
import type { Enrollment } from "@/lib/types";

type PeriodAction = {
  enrollment: Enrollment;
  period: string;
  mode: "skip" | "restore";
};

function nextPeriod(period: string): string {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function twelvePeriods(start: string): string[] {
  const result: string[] = [];
  let cursor = start;
  for (let index = 0; index < 12; index += 1) {
    result.push(cursor);
    cursor = nextPeriod(cursor);
  }
  return result;
}

function numericPeriod(period: string): string {
  const [year, month] = period.split("-");
  return `${Number(month)} / ${year}`;
}

export function StudentAnnualBillingCard({ studentId }: { studentId: string }) {
  const { db, actor, allowed } = useApp();
  const [action, setAction] = useState<PeriodAction | null>(null);
  const [stopFor, setStopFor] = useState<Enrollment | null>(null);
  const [reason, setReason] = useState("لم يدرس الطالب هذا الشهر");
  const [error, setError] = useState<string | null>(null);

  const ledger = useMemo(() => (db ? studentMonthlyLedger(db, studentId) : []), [db, studentId]);
  const ledgerByEnrollmentPeriod = useMemo(
    () => new Map(ledger.map((row) => [`${row.enrollment_id}|${row.period}`, row])),
    [ledger],
  );

  if (!db || !allowed("finance.view")) return null;
  const cur = db.settings.currency;
  const currentPeriod = localMonthKey();
  const monthlyEnrollments = db.enrollments
    .filter((enrollment) => enrollment.student_id === studentId && enrollment.billing_mode === "monthly" && enrollment.status !== "cancelled")
    .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));

  if (!monthlyEnrollments.length) return null;

  function courseAndClass(enrollment: Enrollment) {
    const klass = db!.classes.find((item) => item.id === enrollment.class_id);
    const course = klass ? db!.courses.find((item) => item.id === klass.course_id) : undefined;
    return {
      klass: klass?.name ?? "—",
      course: course?.name ?? "—",
    };
  }

  function openSkip(enrollment: Enrollment, period: string) {
    setAction({ enrollment, period, mode: "skip" });
    setReason("لم يدرس الطالب هذا الشهر");
    setError(null);
  }

  function openRestore(enrollment: Enrollment, period: string) {
    setAction({ enrollment, period, mode: "restore" });
    setReason("");
    setError(null);
  }

  function confirmAction() {
    if (!action) return;
    try {
      if (action.mode === "skip") {
        skipMonthlyEnrollmentPeriod(action.enrollment.id, action.period, reason, actor);
      } else {
        restoreMonthlyEnrollmentPeriod(action.enrollment.id, action.period, actor);
      }
      setAction(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function confirmStop() {
    if (!stopFor) return;
    try {
      stopMonthlyEnrollment(stopFor.id, currentPeriod, actor);
      setStopFor(null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h2 className="mb-2 mt-6 text-sm font-bold">بطاقة الطالب الشهرية — الفعلي والمتوقع</h2>
      <div className="space-y-4">
        {monthlyEnrollments.map((enrollment) => {
          const names = courseAndClass(enrollment);
          const start = enrollment.billing_start_period ?? currentPeriod;
          const periods = twelvePeriods(start);
          const skipped = new Set(enrollment.skipped_periods ?? []);
          const rows = periods.map((period) => {
            const actual = ledgerByEnrollmentPeriod.get(`${enrollment.id}|${period}`);
            const isSkipped = skipped.has(period);
            const isStopped = Boolean(enrollment.billing_end_period && period > enrollment.billing_end_period);
            const monthly = enrollment.monthly_price_snapshot ?? Math.max(0, enrollment.price_snapshot - enrollment.discount_snapshot);
            const expectedAmount = isSkipped || isStopped ? 0 : monthly;
            const future = period > currentPeriod;
            return { period, actual, isSkipped, isStopped, expectedAmount, future };
          });
          const projectedTotal = rows.reduce((sum, row) => sum + (row.actual?.amount ?? row.expectedAmount), 0);
          const actualDue = rows.reduce((sum, row) => sum + (row.actual?.due ?? 0), 0);
          const canManageEnrollment = allowed("enrollments.update");

          return (
            <Panel key={enrollment.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{names.course} — {names.klass}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    القسط الشهري: {money(enrollment.monthly_price_snapshot ?? 0, cur)} — بداية التسجيل: {numericPeriod(start)}
                  </p>
                  {enrollment.billing_end_period ? (
                    <p className="mt-1 text-xs text-muted-foreground">آخر شهر في التسجيل: {numericPeriod(enrollment.billing_end_period)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={enrollment.status === "active" ? "success" : "muted"}>
                    {enrollment.status === "active" ? "التسجيل جارٍ" : "التسجيل متوقف"}
                  </Badge>
                  <Badge tone="primary">المتوقع 12 شهر: {money(projectedTotal, cur)}</Badge>
                  <Badge tone={actualDue > 0 ? "danger" : "success"}>المتبقي الفعلي: {money(actualDue, cur)}</Badge>
                  {canManageEnrollment && enrollment.status === "active" ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setStopFor(enrollment);
                        setError(null);
                      }}
                    >
                      إيقاف التسجيل
                    </Button>
                  ) : null}
                </div>
              </div>

              <Table head={["الشهر", "المستحق", "المدفوع", "المتبقي", "الحالة", ""]}>
                {rows.map((row) => {
                  let statusNode;
                  if (row.isSkipped) statusNode = <Badge tone="muted">✕ متخطّى</Badge>;
                  else if (row.isStopped) statusNode = <Badge tone="muted">متوقف</Badge>;
                  else if (row.actual?.status === "paid") statusNode = <Badge tone="success">مدفوع</Badge>;
                  else if (row.actual?.status === "partial") statusNode = <Badge tone="warning">جزئي</Badge>;
                  else if (row.actual) statusNode = <Badge tone="danger">غير مدفوع</Badge>;
                  else if (row.future) statusNode = <Badge tone="primary">متوقع</Badge>;
                  else statusNode = <Badge tone="warning">بانتظار التوليد</Badge>;

                  const amount = row.actual?.amount ?? row.expectedAmount;
                  const paid = row.actual?.paid ?? 0;
                  const due = row.actual?.due ?? (row.future ? 0 : row.expectedAmount);
                  const hasPayment = Boolean(row.actual && row.actual.paid > 0);
                  const canManage = canManageEnrollment && !row.isStopped;

                  return (
                    <tr key={`${enrollment.id}-${row.period}`}>
                      <Td className="font-semibold">{numericPeriod(row.period)}</Td>
                      <Td className="tabular-nums">{money(amount, cur)}</Td>
                      <Td className="tabular-nums text-emerald-700">{money(paid, cur)}</Td>
                      <Td className={due > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>
                        {row.future && !row.actual ? "—" : money(due, cur)}
                      </Td>
                      <Td>{statusNode}</Td>
                      <Td>
                        {canManage && row.isSkipped ? (
                          <Button variant="ghost" onClick={() => openRestore(enrollment, row.period)}>إعادة الشهر</Button>
                        ) : canManage && !hasPayment ? (
                          <Button variant="ghost" onClick={() => openSkip(enrollment, row.period)}>تخطي الشهر</Button>
                        ) : hasPayment ? (
                          <span className="text-xs text-muted-foreground">محمي بدفعة</span>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            </Panel>
          );
        })}
      </div>

      <Modal
        open={!!action}
        title={action?.mode === "restore" ? "إعادة الشهر إلى التسجيل" : "تخطي شهر للطالب"}
        onClose={() => setAction(null)}
      >
        {action ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-muted p-3 text-sm">
              الشهر: <b>{numericPeriod(action.period)}</b>
              {action.mode === "skip"
                ? " — لن يُنشأ عليه استحقاق مالي، ولن يدخل ضمن المتأخرات أو الإشعارات."
                : " — سيعود الشهر إلى خطة التسجيل، وإذا كان مستحقًا الآن سيُنشأ الاستحقاق فورًا."}
            </p>
            {action.mode === "skip" ? (
              <Field label="سبب التخطي">
                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            ) : null}
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAction(null)}>تراجع</Button>
              <Button onClick={confirmAction}>{action.mode === "restore" ? "إعادة الشهر" : "تأكيد التخطي"}</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!stopFor} title="إيقاف تسجيل الطالب" onClose={() => setStopFor(null)}>
        {stopFor ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-muted p-3 text-sm">
              سيتوقف توليد أي استحقاق جديد بعد شهر <b>{numericPeriod(currentPeriod)}</b>. كل الفواتير والدفعات والبواقي السابقة ستبقى محفوظة كما هي.
            </p>
            <p className="text-xs text-muted-foreground">
              إذا كان الطالب لم يدرس الشهر الحالي، استخدم «تخطي الشهر» أولًا ثم أوقف التسجيل.
            </p>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStopFor(null)}>تراجع</Button>
              <Button variant="danger" onClick={confirmStop}>تأكيد الإيقاف</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

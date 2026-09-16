import { useMemo, useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui-kit";
import { useApp } from "@/lib/session";
import { money, numericMonthPeriodLabel, toMinor } from "@/lib/format";
import { employeePayrollBalanceRows, recordPayrollAllocatedSettlement } from "@/lib/payroll-settlement";
import { printPayrollPaymentReceipt } from "@/lib/payroll-print";

interface Props {
  employeeId: string | null;
  open: boolean;
  onClose: () => void;
  throughPeriod?: string | null;
}

export function PayrollSettlementModal({ employeeId, open, onClose, throughPeriod = null }: Props) {
  const { db, actor } = useApp();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!db || !employeeId) return [];
    return employeePayrollBalanceRows(db, employeeId)
      .filter((row) => row.remaining > 0)
      .filter((row) => !throughPeriod || row.payroll_item.period <= throughPeriod);
  }, [db, employeeId, throughPeriod]);

  if (!db) return null;
  const currentDb = db;
  const employee = employeeId ? currentDb.employees.find((row) => row.id === employeeId) : undefined;
  const currency = currentDb.settings.currency;
  const totalDue = rows.reduce((sum, row) => sum + row.remaining, 0);
  const selectedTotal = rows.reduce((sum, row) => {
    if (!selected[row.payroll_item.id]) return sum;
    try {
      return sum + toMinor(amounts[row.payroll_item.id] || "0");
    } catch {
      return sum;
    }
  }, 0);
  const lastPayment = lastPaymentId
    ? currentDb.payroll_payments.find((payment) => payment.id === lastPaymentId)
    : undefined;
  const lastItem = lastPayment
    ? currentDb.payroll_items.find((item) => item.id === lastPayment.payroll_item_id)
    : undefined;

  function reset() {
    setSelected({});
    setAmounts({});
    setNote("");
    setError(null);
  }

  function closeAll() {
    reset();
    setLastPaymentId(null);
    onClose();
  }

  function toggle(itemId: string, checked: boolean, remaining: number) {
    setSelected((current) => ({ ...current, [itemId]: checked }));
    setAmounts((current) => ({
      ...current,
      [itemId]: checked ? (current[itemId] || (remaining / 100).toFixed(2)) : "",
    }));
    setError(null);
  }

  function submit() {
    if (!employeeId) return;
    try {
      const allocations = rows
        .filter((row) => selected[row.payroll_item.id])
        .map((row) => ({
          payroll_item_id: row.payroll_item.id,
          amount: toMinor(amounts[row.payroll_item.id] || "0"),
        }))
        .filter((row) => row.amount > 0);
      const result = recordPayrollAllocatedSettlement({ employee_id: employeeId, allocations, note: note.trim() }, actor);
      setLastPaymentId(result.payment_ids[0] ?? null);
      reset();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <Modal open={open} title={lastPayment ? "تم تسجيل دفعة الراتب" : "دفع مستحقات الموظف"} onClose={closeAll} wide>
      {lastPayment && lastItem ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-success/5 p-4 text-sm">
            <p className="font-bold text-success">تم حفظ الدفعة مع ربط كل مبلغ بشهره الصحيح.</p>
            <p className="mt-2"><b>الموظف:</b> {employee?.full_name || "—"}</p>
            <p><b>مرجع سند الصرف:</b> {lastPayment.settlement_no || lastPayment.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <Button className="w-full" onClick={() => printPayrollPaymentReceipt(currentDb, lastItem, lastPayment)}>🖨️ طباعة سند الصرف الآن</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            <p><b>الموظف:</b> {employee?.full_name || "—"}</p>
            <p><b>إجمالي المستحق له ضمن الأشهر الظاهرة:</b> {money(totalDue, currency)}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="mb-1 text-sm font-bold">اختر شهر الراتب وحدد مبلغ الدفع</p>
            <p className="mb-3 text-xs leading-6 text-muted-foreground">
              عند تحديد الشهر يُكتب كامل المتبقي تلقائيًا، ويمكنك تعديل المبلغ في نفس السطر إذا أردت دفعة جزئية.
            </p>
            <div className="space-y-2">
              {rows.map((row) => {
                const item = row.payroll_item;
                const checked = Boolean(selected[item.id]);
                const isRemainder = row.paid > 0;
                return (
                  <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_1fr_150px] sm:items-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={checked}
                      onChange={(event) => toggle(item.id, event.target.checked, row.remaining)}
                      aria-label={`اختيار راتب ${numericMonthPeriodLabel(item.period)}`}
                    />
                    <div className="text-sm">
                      <p className="font-semibold">
                        {isRemainder ? "متبقي من راتب شهر" : "راتب شهر"} {numericMonthPeriodLabel(item.period)}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        المستحق {money(item.net, currency)} — المدفوع {money(row.paid, currency)} — المتبقي {money(row.remaining, currency)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!checked}
                      value={amounts[item.id] || ""}
                      onChange={(event) => {
                        setAmounts((current) => ({ ...current, [item.id]: event.target.value }));
                        setError(null);
                      }}
                      placeholder="المبلغ"
                      aria-label={`مبلغ دفع راتب ${numericMonthPeriodLabel(item.period)}`}
                    />
                  </div>
                );
              })}
              {!rows.length ? <p className="py-4 text-center text-sm text-muted-foreground">لا توجد مستحقات رواتب غير مدفوعة.</p> : null}
            </div>
          </div>

          <div className="rounded-xl bg-muted/30 p-3 text-sm">
            <b>إجمالي الدفعة:</b> {money(selectedTotal, currency)}
            <span className="mx-2">—</span>
            <b>المتبقي للموظف بعد الدفعة:</b> {money(Math.max(0, totalDue - selectedTotal), currency)}
          </div>
          <Field label="ملاحظة">
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ملاحظة اختيارية تظهر على السند" />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeAll}>إلغاء</Button>
            <Button onClick={submit} disabled={selectedTotal <= 0}>تسجيل الدفعة</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

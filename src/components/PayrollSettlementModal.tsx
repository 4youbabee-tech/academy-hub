import { useMemo, useState } from "react";
import { Button, Field, Input, Modal, Select } from "@/components/ui-kit";
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
  const [manualItemId, setManualItemId] = useState("");
  const [manualAmount, setManualAmount] = useState("");
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
  const checkedTotal = rows.reduce(
    (sum, row) => sum + (selected[row.payroll_item.id] ? row.remaining : 0),
    0,
  );
  const manualRow = rows.find((row) => row.payroll_item.id === manualItemId && !selected[row.payroll_item.id]);
  let manualMinor = 0;
  try {
    manualMinor = manualAmount.trim() ? toMinor(manualAmount) : 0;
  } catch {
    manualMinor = 0;
  }
  const selectedTotal = checkedTotal + Math.max(0, manualMinor);
  const lastPayment = lastPaymentId
    ? currentDb.payroll_payments.find((payment) => payment.id === lastPaymentId)
    : undefined;
  const lastItem = lastPayment
    ? currentDb.payroll_items.find((item) => item.id === lastPayment.payroll_item_id)
    : undefined;

  function reset() {
    setSelected({});
    setManualItemId("");
    setManualAmount("");
    setNote("");
    setError(null);
  }

  function closeAll() {
    reset();
    setLastPaymentId(null);
    onClose();
  }

  function toggle(itemId: string, checked: boolean) {
    setSelected((current) => ({ ...current, [itemId]: checked }));
    if (checked && manualItemId === itemId) {
      setManualItemId("");
      setManualAmount("");
    }
    setError(null);
  }

  function submit() {
    if (!employeeId) return;
    try {
      const allocations = rows
        .filter((row) => selected[row.payroll_item.id])
        .map((row) => ({ payroll_item_id: row.payroll_item.id, amount: row.remaining }));

      if (manualAmount.trim()) {
        if (!manualRow) throw new Error("اختر شهر الراتب للدفعة الجزئية اليدوية");
        const amount = toMinor(manualAmount);
        if (amount <= 0) throw new Error("المبلغ اليدوي يجب أن يكون أكبر من صفر");
        if (amount > manualRow.remaining) throw new Error("المبلغ اليدوي يتجاوز المتبقي في شهر الراتب المحدد");
        allocations.push({ payroll_item_id: manualRow.payroll_item.id, amount });
      }

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
            <p className="mb-1 text-sm font-bold">اختر الأشهر التي تريد دفعها كاملة</p>
            <p className="mb-3 text-xs leading-6 text-muted-foreground">
              وضع علامة على الشهر يعني دفع كامل المبلغ المتبقي لذلك الشهر. إذا أردت دفعة جزئية استخدم الخانة اليدوية الواحدة الموجودة أسفل الأشهر.
            </p>
            <div className="space-y-2">
              {rows.map((row) => {
                const item = row.payroll_item;
                const checked = Boolean(selected[item.id]);
                const isRemainder = row.paid > 0;
                return (
                  <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/20">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0"
                      checked={checked}
                      onChange={(event) => toggle(item.id, event.target.checked)}
                      aria-label={`اختيار راتب ${numericMonthPeriodLabel(item.period)}`}
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">
                        {isRemainder ? "متبقي من راتب شهر" : "راتب شهر"} {numericMonthPeriodLabel(item.period)}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">
                        المتبقي {money(row.remaining, currency)}
                        {row.paid > 0 ? ` — المدفوع سابقًا ${money(row.paid, currency)} من أصل ${money(item.net, currency)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">دفع كامل المتبقي</span>
                  </label>
                );
              })}
              {!rows.length ? <p className="py-4 text-center text-sm text-muted-foreground">لا توجد مستحقات رواتب غير مدفوعة.</p> : null}
            </div>
          </div>

          {rows.length ? (
            <div className="rounded-xl border border-dashed p-3">
              <p className="mb-3 text-sm font-bold">دفعة جزئية يدوية <span className="font-normal text-muted-foreground">(اختياري)</span></p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="شهر الراتب">
                  <Select value={manualItemId} onChange={(event) => { setManualItemId(event.target.value); setError(null); }}>
                    <option value="">اختر الشهر</option>
                    {rows.filter((row) => !selected[row.payroll_item.id]).map((row) => (
                      <option key={row.payroll_item.id} value={row.payroll_item.id}>
                        {row.paid > 0 ? "متبقي" : "راتب"} {numericMonthPeriodLabel(row.payroll_item.period)} — {money(row.remaining, currency)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="المبلغ اليدوي">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualAmount}
                    onChange={(event) => { setManualAmount(event.target.value); setError(null); }}
                    placeholder="مثال: 100"
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                استخدمها فقط إذا كنت لا تريد دفع كامل المتبقي في ذلك الشهر. لا يمكن أن يتجاوز المبلغ المتبقي للشهر المحدد.
              </p>
            </div>
          ) : null}

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

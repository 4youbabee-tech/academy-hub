import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { insert, update } from "@/lib/db";
import { dateStr, money, toMinor, today } from "@/lib/format";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "المصاريف والمداخيل — نظام إدارة المعهد" },
      { name: "description", content: "المصاريف التشغيلية والمداخيل الأخرى مع عرض مالي واضح وآمن." },
      { property: "og:title", content: "المصاريف والمداخيل — نظام إدارة المعهد" },
      { property: "og:description", content: "مصاريف تشغيلية ومداخيل إضافية مع سجل تدقيق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { db, actor, allowed } = useApp();
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "", amount: "", date: today(), note: "" });
  const [error, setError] = useState<string | null>(null);
  const [voidExpenseId, setVoidExpenseId] = useState<string | null>(null);

  const expenses = useMemo(() => (db ? db.expenses.slice().sort((a, b) => b.date.localeCompare(a.date)) : []), [db]);
  const incomes = useMemo(
    () => (db ? db.incomes.filter((i) => !i.is_void).slice().sort((a, b) => b.date.localeCompare(a.date)) : []),
    [db],
  );

  if (!db) return null;
  if (!allowed("expenses.view")) return <Denied />;
  const canEdit = allowed("expenses.create");
  const cur = db.settings.currency;
  const voidExpense = voidExpenseId ? db.expenses.find((e) => e.id === voidExpenseId) ?? null : null;

  function save() {
    const amount = toMinor(form.amount);
    if (amount <= 0) return setError("المبلغ غير صالح");
    if (!form.category.trim()) return setError(tab === "expense" ? "البند إلزامي" : "المصدر إلزامي");

    if (tab === "expense") {
      insert(
        "expenses",
        { category: form.category.trim(), amount, date: form.date, note: form.note, user_id: actor.id, is_void: false },
        actor,
        `مصروف ${form.category}`,
      );
    } else {
      insert(
        "incomes",
        { source: form.category.trim(), amount, date: form.date, note: form.note, user_id: actor.id, is_void: false },
        actor,
        `مدخول ${form.category}`,
      );
    }

    setOpen(false);
    setError(null);
  }

  function confirmVoidExpense() {
    if (!voidExpense) return;
    update(
      "expenses",
      voidExpense.id,
      { is_void: true },
      actor,
      `إلغاء مصروف ${voidExpense.category}`,
    );
    setVoidExpenseId(null);
  }

  const totalOperatingExpenses = expenses.filter((e) => !e.is_void).reduce((s, e) => s + e.amount, 0);
  const totalPaidPayroll = db.payroll_items
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.net + p.advance_deducted, 0);
  const totalCompanyExpenses = totalOperatingExpenses + totalPaidPayroll;
  const totalInc = incomes.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="المصاريف والمداخيل"
        subtitle="المصاريف التشغيلية هنا، والرواتب تُجمع تلقائيًا ضمن إجمالي مصروفات الشركة"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setForm({ category: "", amount: "", date: today(), note: "" });
                setError(null);
                setOpen(true);
              }}
            >
              {tab === "expense" ? "مصروف جديد" : "مدخول جديد"}
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="المصاريف التشغيلية" value={money(totalOperatingExpenses, cur)} tone="danger" />
        <Stat label="تكلفة الرواتب" value={money(totalPaidPayroll, cur)} tone="danger" />
        <Stat label="إجمالي مصروفات الشركة" value={money(totalCompanyExpenses, cur)} tone="danger" />
        <Stat label="المداخيل الأخرى" value={money(totalInc, cur)} tone="success" />
      </div>

      <div className="mb-4 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
        تكلفة الرواتب تشمل صافي الراتب المدفوع وأي سلفة تم تسويتها مع الراتب، وتُجمع تلقائيًا ضمن إجمالي مصروفات الشركة بدون تسجيلها مرة ثانية داخل جدول المصاريف.
      </div>

      <div className="mb-4 flex gap-2">
        <Button variant={tab === "expense" ? "primary" : "secondary"} onClick={() => setTab("expense")}>
          المصاريف
        </Button>
        <Button variant={tab === "income" ? "primary" : "secondary"} onClick={() => setTab("income")}>
          المداخيل
        </Button>
      </div>

      {tab === "expense" ? (
        expenses.length === 0 ? (
          <Empty text="لا توجد مصاريف." />
        ) : (
          <Table head={["البند", "المبلغ", "التاريخ", "ملاحظة", "الحالة", ""]}>
            {expenses.map((e) => (
              <tr key={e.id} className={e.is_void ? "opacity-60" : ""}>
                <Td className="font-semibold">{e.category}</Td>
                <Td className="tabular-nums">{money(e.amount, cur)}</Td>
                <Td>{dateStr(e.date)}</Td>
                <Td>{e.note || "—"}</Td>
                <Td>{e.is_void ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</Td>
                <Td>
                  {!e.is_void && canEdit ? (
                    <Button variant="ghost" onClick={() => setVoidExpenseId(e.id)}>
                      إلغاء
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )
      ) : (
        <>
          <div className="mb-3 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
            المداخيل هنا للعرض. سندات قبض الطلاب تُدار من صفحة الإيصالات والفواتير، ولا يتم إلغاؤها من هذه الشاشة. المداخيل الملغاة لا تدخل في الإجمالي ولا تظهر ضمن قائمة المداخيل الفعلية.
          </div>
          {incomes.length === 0 ? (
            <Empty text="لا توجد مداخيل فعلية." />
          ) : (
            <Table head={["المصدر", "المبلغ", "التاريخ", "ملاحظة"]}>
              {incomes.map((e) => (
                <tr key={e.id}>
                  <Td className="font-semibold">{e.source}</Td>
                  <Td className="tabular-nums">{money(e.amount, cur)}</Td>
                  <Td>{dateStr(e.date)}</Td>
                  <Td>{e.note || "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      <Modal open={open} title={tab === "expense" ? "مصروف جديد" : "مدخول جديد"} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tab === "expense" ? "البند" : "المصدر"}>
            {tab === "expense" ? (
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">— اختر —</option>
                {db.expense_categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="المبلغ">
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          <Field label="ملاحظة">
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={save}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!voidExpense} title="تأكيد إلغاء المصروف" onClose={() => setVoidExpenseId(null)}>
        {voidExpense ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <p className="font-bold">هل أنت متأكد من إلغاء هذا المصروف؟</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>البند: <b className="text-foreground">{voidExpense.category}</b></p>
                <p>المبلغ: <b className="text-foreground">{money(voidExpense.amount, cur)}</b></p>
                <p>التاريخ: <b className="text-foreground">{dateStr(voidExpense.date)}</b></p>
                {voidExpense.note ? <p>الملاحظة: <b className="text-foreground">{voidExpense.note}</b></p> : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              سيبقى المصروف محفوظًا في السجل بحالة «ملغى»، لكنه لن يدخل في إجمالي المصاريف الفعلية.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidExpenseId(null)}>
                تراجع
              </Button>
              <Button variant="danger" onClick={confirmVoidExpense}>
                تأكيد الإلغاء
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

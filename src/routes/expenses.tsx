import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Stat, Table, Td } from "@/components/ui-kit";
import { dateStr, money, toMinor, today } from "@/lib/format";
import { profitAndLoss, recordExpense, recordIncome, voidExpense, voidIncome } from "@/lib/finance";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagination } from "@/hooks/use-pagination";

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
  const [voidIncomeId, setVoidIncomeId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);

  const expenses = useMemo(() => {
    if (!db) return [];
    const term = debouncedQ.trim().toLowerCase();
    return db.expenses
      .filter((expense) => !term || expense.category.toLowerCase().includes(term) || expense.note.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db, debouncedQ]);
  const incomes = useMemo(
    () => {
      if (!db) return [];
      const term = debouncedQ.trim().toLowerCase();
      return db.incomes
        .filter((income) => !term || income.source.toLowerCase().includes(term) || income.note.toLowerCase().includes(term))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    [db, debouncedQ],
  );
  const expensePagination = usePagination(expenses, `expense|${debouncedQ}`);
  const incomePagination = usePagination(incomes, `income|${debouncedQ}`);

  if (!db) return null;
  if (!allowed("expenses.view")) return <Denied />;
  const currentDb = db;
  const canEdit = allowed("expenses.create");
  const canVoid = allowed("expenses.void");
  const cur = currentDb.settings.currency;
  const expenseToVoid = voidExpenseId ? currentDb.expenses.find((e) => e.id === voidExpenseId) ?? null : null;
  const incomeToVoid = voidIncomeId ? currentDb.incomes.find((e) => e.id === voidIncomeId) ?? null : null;

  function save() {
    const amount = toMinor(form.amount);
    if (amount <= 0) return setError("المبلغ غير صالح");
    if (!form.category.trim()) return setError(tab === "expense" ? "البند إلزامي" : "المصدر إلزامي");

    try {
      if (tab === "expense") {
        recordExpense({ category: form.category, amount, date: form.date, note: form.note }, actor);
      } else {
        recordIncome({ source: form.category, amount, date: form.date, note: form.note }, actor);
      }
      setOpen(false);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function confirmVoidExpense() {
    if (!expenseToVoid) return;
    try {
      voidExpense(expenseToVoid.id, actor, voidReason);
      setVoidExpenseId(null);
      setVoidReason("");
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function confirmVoidIncome() {
    if (!incomeToVoid) return;
    try {
      voidIncome(incomeToVoid.id, actor, voidReason);
      setVoidIncomeId(null);
      setVoidReason("");
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const totalOperatingExpenses = currentDb.expenses.filter((e) => !e.is_void).reduce((s, e) => s + e.amount, 0);
  const totalPaidPayroll = profitAndLoss(currentDb, "0001-01-01", "9999-12-31").payroll;
  const totalCompanyExpenses = totalOperatingExpenses + totalPaidPayroll;
  const totalInc = currentDb.incomes.filter((income) => !income.is_void).reduce((sum, income) => sum + income.amount, 0);

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

      <Input
        className="mb-4"
        placeholder={tab === "expense" ? "بحث في المصاريف..." : "بحث في المداخيل الأخرى..."}
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />

      {tab === "expense" ? (
        expenses.length === 0 ? (
          <Empty text="لا توجد مصاريف." />
        ) : (
          <>
          <Table head={["البند", "المبلغ", "التاريخ", "ملاحظة", "الحالة", ""]}>
            {expensePagination.rows.map((e) => (
              <tr key={e.id} className={e.is_void ? "opacity-60" : ""}>
                <Td className="font-semibold">{e.category}</Td>
                <Td className="tabular-nums">{money(e.amount, cur)}</Td>
                <Td>{dateStr(e.date)}</Td>
                <Td>{e.note || "—"}</Td>
                <Td>{e.is_void ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</Td>
                <Td>
                  {!e.is_void && canVoid ? (
                    <Button variant="ghost" onClick={() => { setVoidExpenseId(e.id); setVoidReason(""); }}>
                      إلغاء
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
          <PaginationControls
            page={expensePagination.page}
            pageCount={expensePagination.pageCount}
            pageSize={expensePagination.pageSize}
            total={expensePagination.total}
            from={expensePagination.from}
            to={expensePagination.to}
            onPrevious={expensePagination.previous}
            onNext={expensePagination.next}
            onPageSizeChange={expensePagination.setPageSize}
          />
          </>
        )
      ) : (
        <>
          <div className="mb-3 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
            هذه المداخيل مستقلة عن سندات قبض الطلاب. أي إلغاء يبقى محفوظاً في السجل ولا يدخل في الإجمالي المالي.
          </div>
          {incomes.length === 0 ? (
            <Empty text="لا توجد مداخيل فعلية." />
          ) : (
            <>
            <Table head={["المصدر", "المبلغ", "التاريخ", "ملاحظة", "الحالة", ""]}>
              {incomePagination.rows.map((e) => (
                <tr key={e.id} className={e.is_void ? "opacity-60" : ""}>
                  <Td className="font-semibold">{e.source}</Td>
                  <Td className="tabular-nums">{money(e.amount, cur)}</Td>
                  <Td>{dateStr(e.date)}</Td>
                  <Td>{e.note || "—"}</Td>
                  <Td>{e.is_void ? <Badge tone="danger">ملغى</Badge> : <Badge tone="success">ساري</Badge>}</Td>
                  <Td>{!e.is_void && canVoid ? <Button variant="ghost" onClick={() => { setVoidIncomeId(e.id); setVoidReason(""); }}>إلغاء</Button> : null}</Td>
                </tr>
              ))}
            </Table>
            <PaginationControls
              page={incomePagination.page}
              pageCount={incomePagination.pageCount}
              pageSize={incomePagination.pageSize}
              total={incomePagination.total}
              from={incomePagination.from}
              to={incomePagination.to}
              onPrevious={incomePagination.previous}
              onNext={incomePagination.next}
              onPageSizeChange={incomePagination.setPageSize}
            />
            </>
          )}
        </>
      )}

      <Modal open={open} title={tab === "expense" ? "مصروف جديد" : "مدخول جديد"} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tab === "expense" ? "البند" : "المصدر"}>
            {tab === "expense" ? (
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">— اختر —</option>
                {currentDb.expense_categories.map((c) => (
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

      <Modal open={!!expenseToVoid} title="تأكيد إلغاء المصروف" onClose={() => setVoidExpenseId(null)}>
        {expenseToVoid ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <p className="font-bold">هل أنت متأكد من إلغاء هذا المصروف؟</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>البند: <b className="text-foreground">{expenseToVoid.category}</b></p>
                <p>المبلغ: <b className="text-foreground">{money(expenseToVoid.amount, cur)}</b></p>
                <p>التاريخ: <b className="text-foreground">{dateStr(expenseToVoid.date)}</b></p>
                {expenseToVoid.note ? <p>الملاحظة: <b className="text-foreground">{expenseToVoid.note}</b></p> : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              سيبقى المصروف محفوظًا في السجل بحالة «ملغى»، لكنه لن يدخل في إجمالي المصاريف الفعلية.
            </p>
            <Field label="سبب الإلغاء"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
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

      <Modal open={!!incomeToVoid} title="تأكيد إلغاء المدخول" onClose={() => setVoidIncomeId(null)}>
        {incomeToVoid ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <p className="font-bold">هل أنت متأكد من إلغاء هذا المدخول؟</p>
              <p className="mt-2">المصدر: <b>{incomeToVoid.source}</b></p>
              <p>المبلغ: <b>{money(incomeToVoid.amount, cur)}</b></p>
            </div>
            <Field label="سبب الإلغاء"><Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="سبب واضح وإلزامي" /></Field>
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidIncomeId(null)}>تراجع</Button>
              <Button variant="danger" onClick={confirmVoidIncome}>تأكيد الإلغاء</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceBalance, recordPayment, voidPayment } from "@/lib/finance";
import { dateStr, fromMinor, money, toMinor } from "@/lib/format";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "الفواتير والدفعات — نظام إدارة المعهد" },
      { name: "description", content: "متابعة الفواتير والأقساط وتسجيل الدفعات وإصدار الإيصالات." },
      { property: "og:title", content: "الفواتير والدفعات — نظام إدارة المعهد" },
      { property: "og:description", content: "الفواتير، الأقساط، الدفعات، والإيصالات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const { db, actor, allowed } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [error, setError] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const rows = useMemo(() => {
    if (!db) return [];
    const term = q.trim();
    return db.invoices
      .map((inv) => ({
        inv,
        student: db.students.find((s) => s.id === inv.student_id),
        balance: invoiceBalance(db, inv.id),
      }))
      .filter((r) => (filter === "all" ? true : r.inv.status === filter))
      .filter((r) => !term || r.inv.number.includes(term) || (r.student?.full_name ?? "").includes(term))
      .sort((a, b) => b.inv.issued_at.localeCompare(a.inv.issued_at));
  }, [db, q, filter]);

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const canPay = allowed("finance.pay") || allowed("finance.create");

  const totalBilled = db.invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.total, 0);
  const totalPaid = db.payments.filter((p) => !p.is_void).reduce((s, p) => s + p.amount, 0);

  function submitPayment() {
    if (!payFor) return;
    try {
      recordPayment({ invoice_id: payFor, amount: toMinor(amount), method }, actor);
      setPayFor(null);
      setAmount("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function submitVoid() {
    if (!voidFor) return;
    try {
      voidPayment(voidFor, reason, actor);
      setVoidFor(null);
      setReason("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const payments = db.payments.slice().sort((a, b) => b.paid_at.localeCompare(a.paid_at)).slice(0, 30);

  return (
    <div>
      <PageHeader title="الفواتير والدفعات" subtitle="القبض لا يُحذف — يُلغى بسبب موثّق فقط" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="إجمالي المفوتر" value={money(totalBilled, db.settings.currency)} />
        <Stat label="إجمالي المقبوض" value={money(totalPaid, db.settings.currency)} tone="success" />
        <Stat label="الرصيد المستحق" value={money(totalBilled - totalPaid, db.settings.currency)} tone="warning" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="بحث برقم الفاتورة أو الطالب" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="max-w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">كل الفواتير</option>
          <option value="open">مفتوحة</option>
          <option value="paid">مسددة</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Empty text="لا توجد فواتير." />
      ) : (
        <Table head={["الرقم", "الطالب", "الإجمالي", "المتبقي", "الحالة", "التاريخ", ""]}>
          {rows.map((r) => (
            <tr key={r.inv.id}>
              <Td className="font-semibold">{r.inv.number}</Td>
              <Td>{r.student?.full_name ?? "—"}</Td>
              <Td className="tabular-nums">{money(r.inv.total, db.settings.currency)}</Td>
              <Td className="tabular-nums">{money(r.balance, db.settings.currency)}</Td>
              <Td>
                <Badge tone={r.inv.status === "paid" ? "success" : r.inv.status === "cancelled" ? "danger" : "warning"}>
                  {r.inv.status === "paid" ? "مسددة" : r.inv.status === "cancelled" ? "ملغاة" : "مفتوحة"}
                </Badge>
              </Td>
              <Td>{dateStr(r.inv.issued_at)}</Td>
              <Td>
                {canPay && r.balance > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPayFor(r.inv.id);
                      setAmount(fromMinor(r.balance));
                      setError(null);
                    }}
                  >
                    قبض
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold">آخر الإيصالات</h2>
      {payments.length === 0 ? (
        <Empty text="لا توجد دفعات." />
      ) : (
        <Table head={["الإيصال", "الطالب", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {payments.map((p) => (
            <tr key={p.id}>
              <Td className="font-semibold">{p.receipt_no}</Td>
              <Td>{db.students.find((s) => s.id === p.student_id)?.full_name ?? "—"}</Td>
              <Td className="tabular-nums">{money(p.amount, db.settings.currency)}</Td>
              <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "بنك" : "أخرى"}</Td>
              <Td>{dateStr(p.paid_at)}</Td>
              <Td>{p.is_void ? <Badge tone="danger">ملغاة</Badge> : <Badge tone="success">سارية</Badge>}</Td>
              <Td>
                {!p.is_void && canPay ? (
                  <Button variant="ghost" onClick={() => setVoidFor(p.id)}>
                    إلغاء
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!payFor} title="تسجيل دفعة" onClose={() => setPayFor(null)}>
        <div className="space-y-3">
          <Field label="المبلغ">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["method"])}>
              <option value="cash">نقدًا</option>
              <option value="bank">بنك</option>
              <option value="other">أخرى</option>
            </Select>
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayFor(null)}>
              إلغاء
            </Button>
            <Button onClick={submitPayment}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!voidFor} title="إلغاء إيصال" onClose={() => setVoidFor(null)}>
        <div className="space-y-3">
          <Field label="سبب الإلغاء">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidFor(null)}>
              تراجع
            </Button>
            <Button variant="danger" onClick={submitVoid} disabled={!reason.trim()}>
              تأكيد الإلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { invoiceBalance, recordPayment, voidPayment } from "@/lib/finance";
import { dateStr, fromMinor, money, toMinor, today } from "@/lib/format";
import type { Payment } from "@/lib/types";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      { title: "الإيصالات — نظام إدارة المعهد" },
      { name: "description", content: "جميع الإيصالات الصادرة مع إمكانية الطباعة والإلغاء." },
    ],
  }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { db, actor, allowed } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "void">("all");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [error, setError] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!db) return null;
  if (!allowed("finance.view")) return <Denied />;
  const canPay = allowed("finance.pay") || allowed("finance.create");

  // دالة طباعة الإيصال
  function printReceipt(payment: Payment) {
    const student = db!.students.find((s) => s.id === payment.student_id);
    const settings = db!.settings;
    const paperSize = settings.receipt_paper_size || "A5";
    const maxWidth = paperSize === "A4" ? "210mm" : "148mm";

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>إيصال قبض</title>
        <style>
          body { font-family: 'Cairo', 'Arial', sans-serif; margin: 20px; direction: rtl; background: #fff; }
          .receipt { max-width: ${maxWidth}; margin: auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; background: #fff; }
          .header { text-align: center; border-bottom: 2px solid #1a4a4a; padding-bottom: 10px; margin-bottom: 15px; }
          .logo { max-height: 80px; margin-bottom: 8px; }
          .title { font-size: 22px; font-weight: bold; color: #1a4a4a; }
          .subtitle { font-size: 14px; color: #555; }
          .details { margin: 15px 0; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eee; }
          .total { font-size: 20px; font-weight: bold; margin-top: 15px; text-align: left; }
          .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print { body { margin: 0; padding: 10px; } .receipt { border: none; box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            ${settings.receipt_show_logo !== false && settings.logo_data_url ? `<img src="${settings.logo_data_url}" class="logo" />` : ""}
            <div class="title">${settings.institute_name}</div>
            <div class="subtitle">${settings.address || ""}</div>
            <div class="subtitle">${settings.phone || ""}</div>
            <div style="margin-top:5px; font-size:16px; font-weight:bold;">إيصال قبض</div>
          </div>
          <div class="details">
            <div class="row"><span>رقم الإيصال:</span><span>${payment.receipt_no}</span></div>
            <div class="row"><span>التاريخ:</span><span>${dateStr(payment.paid_at)}</span></div>
            <div class="row"><span>الطالب:</span><span>${student?.full_name || "—"}</span></div>
            ${settings.receipt_show_guardian !== false && student?.guardian_name ? `<div class="row"><span>ولي الأمر:</span><span>${student.guardian_name}</span></div>` : ""}
            <div class="row"><span>المبلغ:</span><span>${money(payment.amount, settings.currency)}</span></div>
            ${settings.receipt_show_payment_method !== false ? `<div class="row"><span>طريقة الدفع:</span><span>${payment.method === "cash" ? "نقدًا" : payment.method === "bank" ? "بنك" : "أخرى"}</span></div>` : ""}
            ${settings.receipt_show_notes !== false && payment.note ? `<div class="row"><span>ملاحظات:</span><span>${payment.note}</span></div>` : ""}
          </div>
          <div class="total">المجموع: ${money(payment.amount, settings.currency)}</div>
          <div class="footer">${settings.receipt_footer_text || "شكراً لثقتكم بنا"}</div>
        </div>
        <script>
          setTimeout(() => { window.print(); }, 500);
        <\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  const receipts = useMemo(() => {
    let list = db.payments.slice();
    const term = q.trim().toLowerCase();

    if (filter === "paid") list = list.filter((p) => !p.is_void);
    else if (filter === "void") list = list.filter((p) => p.is_void);

    if (term) {
      list = list.filter(
        (p) =>
          p.receipt_no.toLowerCase().includes(term) ||
          db.students.find((s) => s.id === p.student_id)?.full_name?.toLowerCase().includes(term)
      );
    }

    return list.sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  }, [db, q, filter]);

  const totalReceipts = db.payments.filter((p) => !p.is_void).length;
  const totalAmount = db.payments.filter((p) => !p.is_void).reduce((s, p) => s + p.amount, 0);
  const voidCount = db.payments.filter((p) => p.is_void).length;

  // الفواتير المفتوحة (لدفع جديدة)
  const openInvoices = db.invoices.filter((i) => i.status === "open");

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

  return (
    <div>
      <PageHeader
        title="📋 الإيصالات"
        subtitle="جميع الإيصالات الصادرة مع إمكانية الطباعة والإلغاء"
        actions={
          canPay && openInvoices.length > 0 ? (
            <Button
              onClick={() => {
                setPayFor(openInvoices[0]?.id || null);
                setAmount("");
                setError(null);
              }}
            >
              + دفعة جديدة
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="عدد الإيصالات" value={String(totalReceipts)} />
        <Stat label="إجمالي المقبوض" value={money(totalAmount, db.settings.currency)} tone="success" />
        <Stat label="الإيصالات الملغاة" value={String(voidCount)} tone="danger" />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="flex-1 min-w-[200px]"
          placeholder="بحث برقم الإيصال أو اسم الطالب..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          className="w-40"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">الكل</option>
          <option value="paid">مدفوعة</option>
          <option value="void">ملغاة</option>
        </Select>
      </div>

      {receipts.length === 0 ? (
        <Empty text="لا توجد إيصالات مطابقة." />
      ) : (
        <Table head={["رقم الإيصال", "الطالب", "المبلغ", "الطريقة", "التاريخ", "الحالة", ""]}>
          {receipts.map((p) => {
            const student = db.students.find((s) => s.id === p.student_id);
            return (
              <tr key={p.id}>
                <Td className="font-semibold">{p.receipt_no}</Td>
                <Td>
                  <a href={`/students/${p.student_id}`} className="text-primary hover:underline">
                    {student?.full_name || "—"}
                  </a>
                </Td>
                <Td className="tabular-nums">{money(p.amount, db.settings.currency)}</Td>
                <Td>{p.method === "cash" ? "نقدًا" : p.method === "bank" ? "بنك" : "أخرى"}</Td>
                <Td>{dateStr(p.paid_at)}</Td>
                <Td>
                  {p.is_void ? (
                    <Badge tone="danger">ملغاة</Badge>
                  ) : (
                    <Badge tone="success">سارية</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {!p.is_void && (
                      <>
                        <Button variant="ghost" onClick={() => printReceipt(p)}>
                          🖨️
                        </Button>
                        {canPay && (
                          <Button variant="ghost" onClick={() => setVoidFor(p.id)}>
                            إلغاء
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {/* نافذة تسجيل دفعة جديدة */}
      <Modal open={!!payFor} title="تسجيل دفعة جديدة" onClose={() => setPayFor(null)}>
        <div className="space-y-3">
          <Field label="الفاتورة">
            <Select
              value={payFor || ""}
              onChange={(e) => setPayFor(e.target.value)}
            >
              <option value="">— اختر فاتورة —</option>
              {openInvoices.map((inv) => {
                const student = db.students.find((s) => s.id === inv.student_id);
                const balance = invoiceBalance(db, inv.id);
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — {student?.full_name || "—"} (المتبقي: {money(balance, db.settings.currency)})
                  </option>
                );
              })}
            </Select>
          </Field>
          <Field label="المبلغ">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="أدخل المبلغ..."
            />
          </Field>
          <Field label="طريقة الدفع">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as Payment["method"])}
            >
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
            <Button onClick={submitPayment}>تسجيل الدفعة</Button>
          </div>
        </div>
      </Modal>

      {/* نافذة إلغاء الإيصال */}
      <Modal open={!!voidFor} title="إلغاء إيصال" onClose={() => setVoidFor(null)}>
        <div className="space-y-3">
          <Field label="سبب الإلغاء">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="السبب إلزامي..."
            />
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

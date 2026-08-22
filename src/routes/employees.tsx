import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { insert, transact, audit, baseFields, update } from "@/lib/db";
import { dateStr, fromMinor, money, toMinor, today } from "@/lib/format";
import type { Employee, PayrollItem } from "@/lib/types";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "الموظفون والرواتب — نظام إدارة المعهد" },
      { name: "description", content: "إدارة الموظفين والمدرّسين، السلف، وكشوف الرواتب الشهرية." },
      { property: "og:title", content: "الموظفون والرواتب — نظام إدارة المعهد" },
      { property: "og:description", content: "الموظفون، السلف، وكشف الرواتب الشهري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeesPage,
});

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] || ch);
}

function EmployeesPage() {
  const { db, actor, allowed } = useApp();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", kind: "teacher" as Employee["kind"], job_title: "", phone: "", salary: "", hired_at: today() });
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(monthNow());
  const [advFor, setAdvFor] = useState<string | null>(null);
  const [adv, setAdv] = useState({ amount: "", reason: "" });

  const employees = useMemo(() => (db ? db.employees : []), [db]);
  const items = useMemo(() => (db ? db.payroll_items.filter((p) => p.period === period) : []), [db, period]);

  if (!db) return null;
  if (!allowed("payroll.view")) return <Denied />;
  const canEdit = allowed("payroll.create");
  const cur = db.settings.currency;

  function saveEmployee() {
    if (!form.full_name.trim()) return setError("الاسم إلزامي");
    const base_salary = toMinor(form.salary);
    if (editId) {
      const outstandingAdvances = db.advances
        .filter((a) => a.employee_id === editId && !a.settled)
        .reduce((sum, a) => sum + a.amount, 0);
      if (base_salary < outstandingAdvances) {
        return setError(`لا يمكن جعل الراتب أقل من السلف غير المسددة (${money(outstandingAdvances, cur)})`);
      }
      update("employees", editId, { full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, base_salary }, actor, `تعديل موظف ${form.full_name}`);
    } else {
      insert(
        "employees",
        { full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, hired_at: form.hired_at, base_salary, active: true },
        actor,
        `موظف جديد ${form.full_name}`,
      );
    }
    setOpen(false);
    setError(null);
  }

  function generatePayroll() {
    transact((d) => {
      for (const emp of d.employees.filter((e) => e.active)) {
        if (d.payroll_items.some((p) => p.employee_id === emp.id && p.period === period)) continue;
        const advances = d.advances.filter((a) => a.employee_id === emp.id && !a.settled);
        const advance_deducted = advances.reduce((s, a) => s + a.amount, 0);
        d.payroll_items.push({
          ...baseFields(),
          employee_id: emp.id,
          period,
          base_snapshot: emp.base_salary,
          bonus: 0,
          deduction: 0,
          advance_deducted,
          net: Math.max(0, emp.base_salary - advance_deducted),
          paid_at: null,
          status: "draft",
        });
      }
      audit(d, actor, "payroll_items", null, "create", `توليد كشف رواتب ${period}`);
    });
  }

  function payItem(id: string) {
    transact((d) => {
      const it = d.payroll_items.find((p) => p.id === id);
      if (!it || it.status === "paid") return;
      it.status = "paid";
      it.paid_at = new Date().toISOString();
      it.updated_at = it.paid_at;
      for (const a of d.advances.filter((a) => a.employee_id === it.employee_id && !a.settled)) a.settled = true;
      audit(d, actor, "payroll_items", it.id, "update", `دفع راتب ${period}`);
    });
  }

  function saveAdvance() {
    if (!advFor) return;
    const amount = toMinor(adv.amount);
    if (amount <= 0) return setError("مبلغ السلفة غير صالح");

    const employee = db.employees.find((e) => e.id === advFor);
    if (!employee) return setError("الموظف غير موجود");

    const outstanding = db.advances
      .filter((a) => a.employee_id === advFor && !a.settled)
      .reduce((sum, a) => sum + a.amount, 0);

    if (outstanding + amount > employee.base_salary) {
      return setError(`إجمالي السلف غير المسددة لا يمكن أن يتجاوز الراتب الأساسي (${money(employee.base_salary, cur)})`);
    }

    transact((d) => {
      d.advances.push({
        ...baseFields(),
        employee_id: advFor,
        amount,
        date: today(),
        reason: adv.reason.trim(),
        settled: false,
      });

      const currentDraft = d.payroll_items.find(
        (p) => p.employee_id === advFor && p.period === monthNow() && p.status === "draft",
      );
      if (currentDraft) {
        currentDraft.advance_deducted += amount;
        currentDraft.net = Math.max(
          0,
          currentDraft.base_snapshot + currentDraft.bonus - currentDraft.deduction - currentDraft.advance_deducted,
        );
        currentDraft.updated_at = new Date().toISOString();
      }

      audit(d, actor, "advances", null, "create", `سلفة موظف بقيمة ${amount / 100}`);
    });

    setAdvFor(null);
    setAdv({ amount: "", reason: "" });
    setError(null);
  }

  function printSalaryReceipt(item: PayrollItem) {
    if (item.status !== "paid" || !item.paid_at) return;

    const employee = db.employees.find((e) => e.id === item.employee_id);
    const settings = db.settings;
    const win = window.open("", "_blank");
    if (!win) return;

    const monthLabel = item.period || "—";
    const employeeName = employee?.full_name || "—";
    const jobTitle = employee?.job_title || (employee?.kind === "teacher" ? "مدرّس" : "موظف");
    const totalDeductions = item.deduction + item.advance_deducted;

    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>سند صرف راتب - ${escapeHtml(employeeName)}</title>
  <style>
    @page { size: A5; margin: 8mm; }
    body { font-family: Arial, sans-serif; direction: rtl; margin: 0; padding: 10px; color: #111; background: #fff; }
    .slip { max-width: 148mm; margin: auto; border: 1px solid #d6d6d6; border-radius: 10px; padding: 16px; }
    .header { text-align: center; border-bottom: 2px solid #1f6b5c; padding-bottom: 10px; margin-bottom: 12px; }
    .logo { max-height: 64px; max-width: 150px; margin-bottom: 6px; }
    .institute { font-size: 20px; font-weight: 800; }
    .muted { font-size: 12px; color: #666; }
    .title { margin-top: 7px; font-size: 16px; font-weight: 800; }
    .row { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; border-bottom: 1px dashed #e5e5e5; font-size: 13px; }
    .row b { text-align: left; }
    .net { margin-top: 12px; padding: 10px; border: 1px solid #dfe8e5; border-radius: 8px; font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; }
    .signatures { display: flex; justify-content: space-between; gap: 20px; margin-top: 30px; font-size: 12px; }
    .footer { margin-top: 18px; text-align: center; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 8px; }
    @media print { body { padding: 0; } .slip { border: none; } }
  </style>
</head>
<body>
  <div class="slip">
    <div class="header">
      ${settings.logo_data_url ? `<img class="logo" src="${settings.logo_data_url}" alt="شعار المعهد" />` : ""}
      <div class="institute">${escapeHtml(settings.institute_name)}</div>
      ${settings.address ? `<div class="muted">${escapeHtml(settings.address)}</div>` : ""}
      ${settings.phone ? `<div class="muted">${escapeHtml(settings.phone)}</div>` : ""}
      <div class="title">سند صرف راتب</div>
    </div>

    <div class="row"><span>الموظف</span><b>${escapeHtml(employeeName)}</b></div>
    <div class="row"><span>المسمى الوظيفي</span><b>${escapeHtml(jobTitle)}</b></div>
    <div class="row"><span>شهر الراتب</span><b>${escapeHtml(monthLabel)}</b></div>
    <div class="row"><span>تاريخ الدفع</span><b>${escapeHtml(dateStr(item.paid_at))}</b></div>
    <div class="row"><span>الراتب الأساسي</span><b>${escapeHtml(money(item.base_snapshot, cur))}</b></div>
    <div class="row"><span>الإضافات</span><b>${escapeHtml(money(item.bonus, cur))}</b></div>
    <div class="row"><span>الحسميات</span><b>${escapeHtml(money(item.deduction, cur))}</b></div>
    <div class="row"><span>خصم السلف</span><b>${escapeHtml(money(item.advance_deducted, cur))}</b></div>
    <div class="row"><span>إجمالي الحسميات</span><b>${escapeHtml(money(totalDeductions, cur))}</b></div>
    <div class="net"><span>الصافي المدفوع</span><span>${escapeHtml(money(item.net, cur))}</span></div>

    <div class="signatures">
      <span>توقيع الموظف: ......................</span>
      <span>توقيع الإدارة: ......................</span>
    </div>
    <div class="footer">سند صرف راتب صادر من نظام ${escapeHtml(settings.institute_name)}</div>
  </div>
  <script>setTimeout(function () { window.print(); }, 350);<\/script>
</body>
</html>`);
    win.document.close();
  }

  const totalSalaryEntitlement = items.reduce(
    (sum, i) => sum + Math.max(0, i.base_snapshot + i.bonus - i.deduction),
    0,
  );
  const paidNet = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.net, 0);
  const advancesThisPeriod = db.advances
    .filter((a) => a.date.slice(0, 7) === period)
    .reduce((sum, a) => sum + a.amount, 0);
  const totalPaidToEmployees = paidNet + advancesThisPeriod;

  return (
    <div>
      <PageHeader
        title="الموظفون والرواتب"
        subtitle="الراتب يُحفظ كـ Snapshot عند توليد الكشف"
        actions={
          canEdit ? (
            <Button
              onClick={() => {
                setEditId(null);
                setForm({ full_name: "", kind: "teacher", job_title: "", phone: "", salary: "", hired_at: today() });
                setError(null);
                setOpen(true);
              }}
            >
              موظف جديد
            </Button>
          ) : null
        }
      />

      {employees.length === 0 ? (
        <Empty text="لا يوجد موظفون." />
      ) : (
        <Table head={["الاسم", "النوع", "المسمى", "الهاتف", "الراتب", "الحالة", ""]}>
          {employees.map((e) => (
            <tr key={e.id}>
              <Td className="font-semibold">{e.full_name}</Td>
              <Td>{e.kind === "teacher" ? "مدرّس" : "إداري"}</Td>
              <Td>{e.job_title || "—"}</Td>
              <Td>{e.phone || "—"}</Td>
              <Td className="tabular-nums">{money(e.base_salary, cur)}</Td>
              <Td>{e.active ? <Badge tone="success">نشط</Badge> : <Badge>موقوف</Badge>}</Td>
              <Td className="whitespace-nowrap">
                {canEdit ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditId(e.id);
                        setForm({ full_name: e.full_name, kind: e.kind, job_title: e.job_title, phone: e.phone, salary: fromMinor(e.base_salary), hired_at: e.hired_at });
                        setOpen(true);
                      }}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAdvFor(e.id);
                        setAdv({ amount: "", reason: "" });
                        setError(null);
                      }}
                    >
                      سلفة
                    </Button>
                    <Button variant="ghost" onClick={() => update("employees", e.id, { active: !e.active }, actor, "تغيير حالة موظف")}>
                      {e.active ? "إيقاف" : "تفعيل"}
                    </Button>
                  </>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold">كشف الرواتب</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input className="max-w-40" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        {canEdit ? <Button onClick={generatePayroll}>توليد الكشف</Button> : null}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إجمالي استحقاق الرواتب" value={money(totalSalaryEntitlement, cur)} />
        <Stat label="سلف مدفوعة خلال الشهر" value={money(advancesThisPeriod, cur)} />
        <Stat label="رواتب مدفوعة نقدًا" value={money(paidNet, cur)} tone="success" />
        <Stat label="إجمالي ما صُرف للموظفين" value={money(totalPaidToEmployees, cur)} tone="success" />
      </div>

      {items.length === 0 ? (
        <Empty text="لا يوجد كشف لهذه الفترة." />
      ) : (
        <Table head={["الموظف", "الأساسي", "خصم السلف", "الصافي", "الحالة", "تاريخ الدفع", ""]}>
          {items.map((i) => (
            <tr key={i.id}>
              <Td>{db.employees.find((e) => e.id === i.employee_id)?.full_name ?? "—"}</Td>
              <Td className="tabular-nums">{money(i.base_snapshot, cur)}</Td>
              <Td className="tabular-nums">{money(i.advance_deducted, cur)}</Td>
              <Td className="tabular-nums font-semibold">{money(i.net, cur)}</Td>
              <Td>{i.status === "paid" ? <Badge tone="success">مدفوع</Badge> : <Badge tone="warning">مسودة</Badge>}</Td>
              <Td>{i.paid_at ? dateStr(i.paid_at) : "—"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {i.status !== "paid" && canEdit ? (
                    <Button variant="secondary" onClick={() => payItem(i.id)}>
                      دفع
                    </Button>
                  ) : null}
                  {i.status === "paid" ? (
                    <Button variant="ghost" onClick={() => printSalaryReceipt(i)}>
                      🖨️ طباعة سند
                    </Button>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={open} title={editId ? "تعديل موظف" : "موظف جديد"} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="الاسم الكامل">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النوع">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Employee["kind"] })}>
                <option value="teacher">مدرّس</option>
                <option value="staff">إداري</option>
              </Select>
            </Field>
            <Field label="المسمى الوظيفي">
              <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
            </Field>
            <Field label="الهاتف">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="الراتب الأساسي">
              <Input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            </Field>
          </div>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveEmployee}>حفظ</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!advFor}
        title="سلفة موظف"
        onClose={() => {
          setAdvFor(null);
          setError(null);
        }}
      >
        <div className="space-y-3">
          <Field label="المبلغ">
            <Input value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} />
          </Field>
          <Field label="السبب">
            <Input value={adv.reason} onChange={(e) => setAdv({ ...adv, reason: e.target.value })} />
          </Field>
          {advFor ? (
            <p className="text-xs text-muted-foreground">
              السلف غير المسددة الحالية: {money(
                db.advances.filter((a) => a.employee_id === advFor && !a.settled).reduce((sum, a) => sum + a.amount, 0),
                cur,
              )}
            </p>
          ) : null}
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdvFor(null)}>
              إلغاء
            </Button>
            <Button onClick={saveAdvance}>حفظ</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

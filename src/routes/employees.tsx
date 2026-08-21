import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Stat, Table, Td } from "@/components/ui-kit";
import { insert, transact, audit, baseFields, update } from "@/lib/db";
import { dateStr, fromMinor, money, toMinor, today } from "@/lib/format";
import type { Employee } from "@/lib/types";

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
    if (amount <= 0) return;
    insert("advances", { employee_id: advFor, amount, date: today(), reason: adv.reason, settled: false }, actor, "سلفة موظف");
    setAdvFor(null);
    setAdv({ amount: "", reason: "" });
  }

  const totalNet = items.reduce((s, i) => s + i.net, 0);
  const paidNet = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.net, 0);

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
                    <Button variant="ghost" onClick={() => setAdvFor(e.id)}>
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
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat label="إجمالي الكشف" value={money(totalNet, cur)} />
        <Stat label="المدفوع" value={money(paidNet, cur)} tone="success" />
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
                {i.status !== "paid" && canEdit ? (
                  <Button variant="secondary" onClick={() => payItem(i.id)}>
                    دفع
                  </Button>
                ) : null}
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

      <Modal open={!!advFor} title="سلفة موظف" onClose={() => setAdvFor(null)}>
        <div className="space-y-3">
          <Field label="المبلغ">
            <Input value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} />
          </Field>
          <Field label="السبب">
            <Input value={adv.reason} onChange={(e) => setAdv({ ...adv, reason: e.target.value })} />
          </Field>
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

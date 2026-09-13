import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
}
function replaceOnce(source, from, to, label) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing expected block: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

edit('src/lib/session.tsx', (source) => {
  const oldEffect = `  useEffect(() => {\n    if (!userId) return;\n    const current = snapshot();\n    const activeUser = current?.users.find((item) => item.id === userId && item.is_active);\n    if (!activeUser) return;\n    try {\n      runMonthlyGeneration(undefined, { id: activeUser.id, name: activeUser.full_name });\n    } catch (error) {\n      console.error("تعذر تشغيل الدورة الشهرية التلقائية", error);\n    }\n  }, [userId]);`;
  const newEffect = `  useEffect(() => {\n    if (!userId) return;\n    const runCycle = () => {\n      const current = snapshot();\n      const activeUser = current?.users.find((item) => item.id === userId && item.is_active);\n      if (!activeUser) return;\n      try {\n        runMonthlyGeneration(undefined, { id: activeUser.id, name: activeUser.full_name });\n      } catch (error) {\n        console.error("تعذر تشغيل الدورة الشهرية التلقائية", error);\n      }\n    };\n    runCycle();\n    const interval = window.setInterval(runCycle, 60 * 60 * 1000);\n    const onVisibility = () => {\n      if (document.visibilityState === "visible") runCycle();\n    };\n    document.addEventListener("visibilitychange", onVisibility);\n    return () => {\n      window.clearInterval(interval);\n      document.removeEventListener("visibilitychange", onVisibility);\n    };\n  }, [userId]);`;
  return replaceOnce(source, oldEffect, newEffect, 'live monthly cycle effect');
});

edit('src/routes/employees.tsx', (source) => {
  source = replaceOnce(source,
    '  const [form, setForm] = useState({ full_name: "", kind: "teacher" as Employee["kind"], job_title: "", phone: "", salary: "", hired_at: today() });',
    '  const [form, setForm] = useState({ full_name: "", kind: "teacher" as Employee["kind"], job_title: "", phone: "", salary: "", hired_at: today(), ended_at: "", active: true });',
    'employee form shape');
  source = replaceOnce(source,
    '    if (base_salary < 0) return setError("الراتب الأساسي لا يمكن أن يكون سالبًا");\n    if (editId) {',
    `    if (base_salary < 0) return setError("الراتب الأساسي لا يمكن أن يكون سالبًا");\n    if (!form.hired_at) return setError("تاريخ بدء العمل إلزامي");\n    if (!form.active && !form.ended_at) return setError("تاريخ انتهاء العمل إلزامي عند إيقاف الموظف");\n    if (form.ended_at && form.ended_at < form.hired_at) return setError("تاريخ انتهاء العمل لا يمكن أن يسبق تاريخ البداية");\n    const endedAt = form.active ? null : form.ended_at;\n    if (editId) {`,
    'employee lifecycle validation');
  source = source.replace(
    'update("employees", editId, { full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, base_salary }, actor, `تعديل موظف ${form.full_name}`);',
    'update("employees", editId, { full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, hired_at: form.hired_at, ended_at: endedAt, base_salary, active: form.active }, actor, `تعديل موظف ${form.full_name}`);',
  );
  source = source.replace(
    '{ full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, hired_at: form.hired_at, base_salary, active: true },',
    '{ full_name: form.full_name.trim(), kind: form.kind, job_title: form.job_title, phone: form.phone, hired_at: form.hired_at, ended_at: null, base_salary, active: true },',
  );
  source = source.replace(
    'setForm({ full_name: "", kind: "teacher", job_title: "", phone: "", salary: "", hired_at: today() });',
    'setForm({ full_name: "", kind: "teacher", job_title: "", phone: "", salary: "", hired_at: today(), ended_at: "", active: true });',
  );
  source = source.replace(
    '<Table head={["الاسم", "النوع", "المسمى", "الهاتف", "الراتب", "الحالة", ""]}>',
    '<Table head={["الاسم", "النوع", "المسمى", "الهاتف", "الراتب", "بداية العمل", "نهاية العمل", "الحالة", ""]}>',
  );
  source = replaceOnce(source,
    '              <Td className="tabular-nums">{money(e.base_salary, cur)}</Td>\n              <Td>{e.active ? <Badge tone="success">نشط</Badge> : <Badge>موقوف</Badge>}</Td>',
    '              <Td className="tabular-nums">{money(e.base_salary, cur)}</Td>\n              <Td>{dateStr(e.hired_at)}</Td>\n              <Td>{e.ended_at ? dateStr(e.ended_at) : "—"}</Td>\n              <Td>{e.active ? <Badge tone="success">نشط</Badge> : <Badge>موقوف</Badge>}</Td>',
    'employee lifecycle columns');
  source = source.replace(
    'setForm({ full_name: e.full_name, kind: e.kind, job_title: e.job_title, phone: e.phone, salary: fromMinor(e.base_salary), hired_at: e.hired_at });',
    'setForm({ full_name: e.full_name, kind: e.kind, job_title: e.job_title, phone: e.phone, salary: fromMinor(e.base_salary), hired_at: e.hired_at, ended_at: e.ended_at ?? "", active: e.active });',
  );
  const quickToggle = `                    <Button variant="ghost" onClick={() => update("employees", e.id, { active: !e.active }, actor, "تغيير حالة موظف")}>\n                      {e.active ? "إيقاف" : "تفعيل"}\n                    </Button>\n`;
  source = source.replace(quickToggle, '');
  source = replaceOnce(source,
    '            <Field label="الراتب الأساسي">\n              <Input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />\n            </Field>\n          </div>',
    `            <Field label="الراتب الأساسي">\n              <Input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />\n            </Field>\n            <Field label="تاريخ بدء العمل">\n              <Input type="date" value={form.hired_at} onChange={(e) => setForm({ ...form, hired_at: e.target.value })} />\n            </Field>\n            <Field label="الحالة">\n              <Select value={form.active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, active: e.target.value === "active", ended_at: e.target.value === "active" ? "" : form.ended_at })}>\n                <option value="active">نشط</option><option value="inactive">منتهي / موقوف</option>\n              </Select>\n            </Field>\n            {!form.active ? (\n              <Field label="تاريخ انتهاء العمل">\n                <Input type="date" value={form.ended_at} onChange={(e) => setForm({ ...form, ended_at: e.target.value })} />\n              </Field>\n            ) : null}\n          </div>`,
    'employee lifecycle fields');
  return source;
});

edit('tests/monthly-financial-harness.ts', (source) => {
  source = replaceOnce(source,
    'const next2 = nextPeriod(next);\n',
    'const next2 = nextPeriod(next);\nconst next3 = nextPeriod(next2);\n',
    'third future period');
  const marker = 'assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next2).length, 1, "payroll catch-up must create missing month once");\n';
  const addition = `assert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next2).length, 1, "payroll catch-up must create missing month once");\n\nconst employeeAfterCatchup = current.employees.find((item) => item.id === "employee-monthly")!;\nemployeeAfterCatchup.active = false;\nemployeeAfterCatchup.ended_at = \`${'${'}next2}-15\`;\nreplaceDb(current);\nrunMonthlyGeneration(next3, actor);\ncurrent = snapshot()!;\nassert.equal(current.payroll_items.filter((item) => item.employee_id === "employee-monthly" && item.period === next3).length, 0, "ended employee must not receive future payroll");\n`;
  return replaceOnce(source, marker, addition, 'employee end period test');
});

console.log('Academy employee lifecycle + live monthly rollover transform complete');

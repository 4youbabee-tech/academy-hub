import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
}
function replaceOnce(source, from, to, label) {
  const idx = source.indexOf(from);
  if (idx < 0) throw new Error(`Missing expected block: ${label}`);
  return source.slice(0, idx) + to + source.slice(idx + from.length);
}

edit('src/routes/settings.tsx', (source) => {
  source = replaceOnce(source,
    'import { audit, transact } from "@/lib/db";\n',
    'import { audit, transact, uid } from "@/lib/db";\nimport { money, toMinor } from "@/lib/format";\n',
    'settings imports');
  source = replaceOnce(source,
    '  const [showAddCategory, setShowAddCategory] = useState(false);\n',
    '  const [showAddCategory, setShowAddCategory] = useState(false);\n  const [newDiscountTitle, setNewDiscountTitle] = useState("");\n  const [newDiscountAmount, setNewDiscountAmount] = useState("");\n',
    'settings discount state');
  source = replaceOnce(source,
    '  function removeCategory(index: number) {\n    setExpenseCategories(expenseCategories.filter((_, i) => i !== index));\n  }\n',
    `  function removeCategory(index: number) {\n    setExpenseCategories(expenseCategories.filter((_, i) => i !== index));\n  }\n\n  function addDiscountPreset() {\n    if (!settings) return;\n    const title = newDiscountTitle.trim();\n    const amount = toMinor(newDiscountAmount);\n    if (!title) return setError("عنوان الخصم إلزامي");\n    if (amount <= 0) return setError("قيمة الخصم يجب أن تكون أكبر من صفر");\n    if (settings.discount_presets.some((item) => item.active && item.title.trim().toLowerCase() === title.toLowerCase())) {\n      return setError("يوجد خصم فعّال بنفس العنوان");\n    }\n    setSettings({\n      ...settings,\n      discount_presets: [...settings.discount_presets, { id: uid(), title, amount, active: true }],\n    });\n    setNewDiscountTitle("");\n    setNewDiscountAmount("");\n    setError(null);\n  }\n\n  function toggleDiscountPreset(id: string) {\n    if (!settings) return;\n    setSettings({\n      ...settings,\n      discount_presets: settings.discount_presets.map((item) =>\n        item.id === id ? { ...item, active: !item.active } : item,\n      ),\n    });\n  }\n`,
    'settings discount functions');
  source = source.replace(/\n\s*<Field label="السنة الدراسية">[\s\S]*?<\/Field>/, '');
  const marker = '        {/* أنواع المصاريف */}';
  const sectionEnd = '        </div>\n      </div>\n\n      {/* ✅ قسم الشعار */}';
  const idx = source.indexOf(sectionEnd, source.indexOf(marker));
  if (idx < 0) throw new Error('Missing settings grid end');
  const discountSection = `        </div>\n\n        <div className="panel p-5">\n          <h2 className="mb-4 text-sm font-bold">🏷️ الخصومات الجاهزة</h2>\n          <div className="space-y-3">\n            {settings.discount_presets.length ? (\n              <Table head={["العنوان", "القيمة", "الحالة", ""]}>\n                {settings.discount_presets.map((item) => (\n                  <tr key={item.id} className={item.active ? "" : "opacity-60"}>\n                    <Td className="font-semibold">{item.title}</Td>\n                    <Td className="tabular-nums">{money(item.amount, settings.currency)}</Td>\n                    <Td><Badge tone={item.active ? "success" : "muted"}>{item.active ? "مفعّل" : "موقوف"}</Badge></Td>\n                    <Td>{canEdit ? <Button variant="ghost" onClick={() => toggleDiscountPreset(item.id)}>{item.active ? "تعطيل" : "تفعيل"}</Button> : null}</Td>\n                  </tr>\n                ))}\n              </Table>\n            ) : (\n              <p className="text-sm text-muted-foreground">لا توجد خصومات جاهزة بعد.</p>\n            )}\n            {canEdit ? (\n              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">\n                <Input value={newDiscountTitle} onChange={(e) => setNewDiscountTitle(e.target.value)} placeholder="مثال: خصم إخوة" />\n                <Input type="number" step="0.01" min="0" value={newDiscountAmount} onChange={(e) => setNewDiscountAmount(e.target.value)} placeholder="القيمة" />\n                <Button variant="secondary" onClick={addDiscountPreset}>+ إضافة</Button>\n              </div>\n            ) : null}\n            <p className="text-xs text-muted-foreground">تعطيل الخصم يمنع استخدامه في تسجيلات جديدة، لكنه يبقى محفوظاً حتى لا يتأثر التاريخ المالي للتسجيلات السابقة.</p>\n          </div>\n`;
  source = source.slice(0, idx) + discountSection + source.slice(idx + '        </div>\n'.length);
  return source;
});

edit('src/routes/courses.tsx', (source) => {
  const replacements = [
    ['الدورات — نظام إدارة المعهد', 'الأعوام الدراسية — نظام إدارة المعهد'],
    ['إدارة الدورات والمستويات والأسعار الافتراضية وعدد الساعات.', 'إدارة الأعوام الدراسية والقسط الشهري الافتراضي.'],
    ['الدورات والمستويات والأسعار وعدد الساعات.', 'الأعوام الدراسية والأقساط الشهرية الافتراضية.'],
    ['اسم الدورة إلزامي', 'اسم العام الدراسي إلزامي'],
    ['تعديل الدورة ${payload.name}', 'تعديل العام الدراسي ${payload.name}'],
    ['إضافة الدورة ${payload.name}', 'إضافة العام الدراسي ${payload.name}'],
    ['title="الدورات"', 'title="الأعوام الدراسية"'],
    ['subtitle={`${db.courses.length} دورة`}', 'subtitle={`${db.courses.length} عام دراسي`}'],
    ['+ دورة جديدة', '+ عام دراسي جديد'],
    ['["الدورة", "الرمز", "المستوى", "الساعات", "السعر الافتراضي", "الحالة", ""]', '["العام الدراسي", "الرمز", "القسط الشهري الافتراضي", "الحالة", ""]'],
    ['لم تُضف دورات بعد.', 'لم تُضف أعوام دراسية بعد.'],
    ['title={editing ? "تعديل دورة" : "دورة جديدة"}', 'title={editing ? "تعديل عام دراسي" : "عام دراسي جديد"}'],
    ['label="اسم الدورة"', 'label="اسم العام الدراسي"'],
    ['label={`السعر الافتراضي (${cur})`}', 'label={`القسط الشهري الافتراضي (${cur})`}'],
  ];
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  source = source.replace('              <Td>{c.level || "—"}</Td>\n              <Td className="tabular-nums">{c.hours}</Td>\n', '');
  source = source.replace(/\n\s*<Field label="المستوى">[\s\S]*?<\/Field>\n\s*<Field label="عدد الساعات">[\s\S]*?<\/Field>/, '');
  return source;
});

edit('src/components/AppShell.tsx', (source) => {
  source = source.replace('{ to: "/courses", label: "الدورات", perm: "courses.view" }', '{ to: "/courses", label: "الأعوام الدراسية", perm: "courses.view" }');
  source = source.replace('{ to: "/classes", label: "الصفوف والجداول", perm: "classes.view" }', '{ to: "/classes", label: "الصفوف والتسجيل", perm: "classes.view" }');
  source = source.replace('<p className="text-xs opacity-70">السنة الدراسية {db.settings.academic_year}</p>', '<p className="text-xs opacity-70">نظام إدارة المعهد</p>');
  return source;
});

edit('src/routes/classes.tsx', (source) => {
  source = replaceOnce(source,
    '  cancelEnrollmentWithInvoice,\n  createEnrollmentWithInvoice,\n  invoiceFinancials,\n  updateEnrollmentWithInvoice,\n',
    '  cancelEnrollmentWithInvoice,\n  createMonthlyEnrollmentWithInvoice,\n  createEnrollmentWithInvoice,\n  invoiceFinancials,\n  stopMonthlyEnrollment,\n  updateEnrollmentWithInvoice,\n',
    'classes finance imports');
  source = source.replace('import { dateStr, fromMinor, money, today, toMinor, WEEKDAYS } from "@/lib/format";', 'import { dateStr, fromMinor, localMonthKey, money, today, toMinor, WEEKDAYS } from "@/lib/format";');
  source = replaceOnce(source,
    '  registration_fee: "0",\n  reason: "",\n};',
    '  registration_fee: "0",\n  reason: "",\n  discount_preset_id: "",\n  start_period: localMonthKey(),\n};',
    'enroll form shape');
  source = replaceOnce(source,
    '  const [error, setError] = useState<string | null>(null);\n',
    '  const [error, setError] = useState<string | null>(null);\n  const [classQuery, setClassQuery] = useState("");\n  const [classStatus, setClassStatus] = useState("");\n',
    'class search state');
  source = replaceOnce(source,
    '  const classes = useMemo(() => (db ? db.classes.slice() : []), [db]);',
    `  const classes = useMemo(() => {\n    if (!db) return [];\n    const term = classQuery.trim().toLowerCase();\n    const courseById = new Map(db.courses.map((item) => [item.id, item.name.toLowerCase()]));\n    const teacherById = new Map(db.employees.map((item) => [item.id, item.full_name.toLowerCase()]));\n    const studentById = new Map(db.students.map((item) => [item.id, item.full_name.toLowerCase()]));\n    const studentNamesByClass = new Map<string, string[]>();\n    for (const enrollment of db.enrollments) {\n      if (enrollment.status === "cancelled") continue;\n      const name = studentById.get(enrollment.student_id);\n      if (!name) continue;\n      studentNamesByClass.set(enrollment.class_id, [...(studentNamesByClass.get(enrollment.class_id) ?? []), name]);\n    }\n    return db.classes.filter((klass) => {\n      if (classStatus && klass.status !== classStatus) return false;\n      if (!term) return true;\n      const values = [klass.name.toLowerCase(), courseById.get(klass.course_id) ?? "", klass.teacher_id ? teacherById.get(klass.teacher_id) ?? "" : "", ...(studentNamesByClass.get(klass.id) ?? [])];\n      return values.some((value) => value.includes(term));\n    });\n  }, [db, classQuery, classStatus]);`,
    'classes filtering');
  source = source.replace('if (!form.course_id) return setError("اختر الدورة");', 'if (!form.course_id) return setError("اختر العام الدراسي");');
  source = replaceOnce(source,
    '      registration_fee: "0",\n      reason: "",\n    });',
    '      registration_fee: "0",\n      reason: "",\n      discount_preset_id: "",\n      start_period: localMonthKey(),\n    });',
    'open enroll defaults');
  const oldSubmit = `    const { price, discount, installments } = buildInstallments(\n      enrollForm.price,\n      enrollForm.discount,\n    );\n    const registrationFee = toMinor(enrollForm.registration_fee);\n    const reasonText = enrollForm.reason.trim();\n    const feeNote = registrationFee > 0 ? \` (رسوم تسجيل \${money(registrationFee, cur)})\` : "";\n    const finalReason = reasonText ? \`\${reasonText}\${feeNote}\` : feeNote.trim() || "تسجيل جديد";\n\n    try {\n      createEnrollmentWithInvoice(\n        {\n          student_id: enrollForm.student_id,\n          class_id: enrollFor.id,\n          price,\n          discount,\n          registration_fee: registrationFee,\n          discount_reason: finalReason,\n          installments,\n        },`;
  const newSubmit = `    const price = toMinor(enrollForm.price);\n    const discount = toMinor(enrollForm.discount);\n    const registrationFee = toMinor(enrollForm.registration_fee);\n    const preset = currentDb.settings.discount_presets.find((item) => item.id === enrollForm.discount_preset_id && item.active);\n    const discountTitle = preset?.title ?? enrollForm.reason.trim();\n\n    try {\n      createMonthlyEnrollmentWithInvoice(\n        {\n          student_id: enrollForm.student_id,\n          class_id: enrollFor.id,\n          monthly_price: price,\n          discount,\n          discount_preset_id: preset?.id ?? null,\n          discount_title: discountTitle,\n          registration_fee: registrationFee,\n          start_period: enrollForm.start_period,\n        },`;
  source = replaceOnce(source, oldSubmit, newSubmit, 'monthly submit');
  source = replaceOnce(source,
    '      reason: enrollment.discount_reason || "",\n    });',
    '      reason: enrollment.discount_reason || "",\n      discount_preset_id: enrollment.discount_preset_id ?? "",\n      start_period: enrollment.billing_start_period ?? localMonthKey(),\n    });',
    'edit form extra fields');
  source = replaceOnce(source,
    '      cancelEnrollmentWithInvoice(cancelEnrollment.id, actor);',
    '      if (cancelEnrollment.billing_mode === "monthly") {\n        stopMonthlyEnrollment(cancelEnrollment.id, localMonthKey(), actor);\n      } else {\n        cancelEnrollmentWithInvoice(cancelEnrollment.id, actor);\n      }',
    'monthly stop');
  source = source.replace('title="الصفوف والجداول"', 'title="الصفوف والتسجيل"');
  source = source.replace('subtitle={`${currentDb.classes.length} صف`}', 'subtitle={`${classes.length} من ${currentDb.classes.length} صف`}');
  source = replaceOnce(source,
    '      />\n\n      {classes.length ? (',
    `      />\n\n      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">\n        <Input value={classQuery} onChange={(e) => setClassQuery(e.target.value)} placeholder="بحث بالصف أو العام الدراسي أو المدرّس أو اسم طالب" />\n        <Select value={classStatus} onChange={(e) => setClassStatus(e.target.value)}>\n          <option value="">كل الحالات</option><option value="planned">مخطط</option><option value="running">جارٍ</option><option value="finished">منتهٍ</option>\n        </Select>\n      </div>\n\n      {classes.length ? (`,
    'class filters UI');
  source = source.replace('["الصف", "الدورة", "المدرّس", "الفصل", "الفترة", "المسجّلون", "الحالة", ""]', '["الصف", "العام الدراسي", "المدرّس", "الفصل", "الفترة", "المسجّلون", "الحالة", ""]');
  source = source.replace('label="الدورة"', 'label="العام الدراسي"');
  source = source.replace('لا يمكن تغيير الدورة لأن الصف يحتوي على سجلات تسجيل.', 'لا يمكن تغيير العام الدراسي لأن الصف يحتوي على سجلات تسجيل.');
  source = replaceOnce(source,
    '        <div className="space-y-3">\n          <Field label="الطالب">',
    `        <div className="space-y-3">\n          <div className="rounded-xl border bg-muted/30 p-3 text-sm">\n            <p><b>العام الدراسي:</b> {enrollFor ? courseName(enrollFor.course_id) : "—"}</p>\n            <p><b>الصف:</b> {enrollFor?.name ?? "—"}</p>\n            <p><b>المدرّس:</b> {enrollFor ? teacherName(enrollFor.teacher_id) : "—"}</p>\n          </div>\n          <Field label="الطالب">`,
    'enroll summary');
  const oldFinanceFields = `          <div className="grid gap-3 sm:grid-cols-2">\n            <Field label={\`سعر الدورة (\${cur})\`}>\n              <Input value={enrollForm.price} onChange={(e) => setEnrollForm({ ...enrollForm, price: e.target.value })} />\n            </Field>\n            <Field label={\`الخصم (\${cur})\`}>\n              <Input value={enrollForm.discount} onChange={(e) => setEnrollForm({ ...enrollForm, discount: e.target.value })} />\n            </Field>\n          </div>`;
  const newFinanceFields = `          <div className="grid gap-3 sm:grid-cols-2">\n            <Field label={\`القسط الشهري الأساسي (\${cur})\`}>\n              <Input value={enrollForm.price} onChange={(e) => setEnrollForm({ ...enrollForm, price: e.target.value })} />\n            </Field>\n            <Field label="الخصم المحدد">\n              <Select value={enrollForm.discount_preset_id} onChange={(e) => {\n                const id = e.target.value;\n                const preset = currentDb.settings.discount_presets.find((item) => item.id === id && item.active);\n                setEnrollForm({ ...enrollForm, discount_preset_id: id, discount: preset ? fromMinor(preset.amount) : "0", reason: preset?.title ?? "" });\n              }}>\n                <option value="">بدون خصم جاهز</option>\n                {currentDb.settings.discount_presets.filter((item) => item.active).map((item) => (\n                  <option key={item.id} value={item.id}>{item.title} — {money(item.amount, cur)}</option>\n                ))}\n              </Select>\n            </Field>\n          </div>\n          <div className="grid gap-3 sm:grid-cols-2">\n            <Field label={\`قيمة الخصم (\${cur})\`}>\n              <Input value={enrollForm.discount} disabled={!!enrollForm.discount_preset_id} onChange={(e) => setEnrollForm({ ...enrollForm, discount: e.target.value })} />\n            </Field>\n            <Field label="بداية الاستحقاق الشهري">\n              <Input type="month" value={enrollForm.start_period} onChange={(e) => setEnrollForm({ ...enrollForm, start_period: e.target.value })} />\n            </Field>\n          </div>`;
  source = replaceOnce(source, oldFinanceFields, newFinanceFields, 'monthly finance fields');
  source = replaceOnce(source,
    `          <Field label="سبب الخصم / ملاحظة">\n            <Input value={enrollForm.reason} onChange={(e) => setEnrollForm({ ...enrollForm, reason: e.target.value })} />\n          </Field>\n          <p className="rounded-lg bg-muted p-3 text-sm">\n            إجمالي المستحق: <b>{money(Math.max(0, toMinor(enrollForm.price) - toMinor(enrollForm.discount) + toMinor(enrollForm.registration_fee)), cur)}</b>\n          </p>`,
    `          {!enrollForm.discount_preset_id ? (\n            <Field label="عنوان الخصم اليدوي / ملاحظة">\n              <Input value={enrollForm.reason} onChange={(e) => setEnrollForm({ ...enrollForm, reason: e.target.value })} />\n            </Field>\n          ) : null}\n          <div className="rounded-lg bg-muted p-3 text-sm">\n            <p>القسط الشهري بعد الخصم: <b>{money(Math.max(0, toMinor(enrollForm.price) - toMinor(enrollForm.discount)), cur)}</b></p>\n            <p className="mt-1 text-xs text-muted-foreground">رسوم التسجيل لمرة واحدة: {money(toMinor(enrollForm.registration_fee), cur)}</p>\n          </div>`,
    'monthly summary');
  source = source.replace('تسجيل وإصدار فاتورة', 'تسجيل وبدء الاستحقاق الشهري');
  source = source.replace(
    '<Button variant="ghost" onClick={() => openEnrollmentEdit(enrollment)}>\n                          تعديل التسجيل\n                        </Button>',
    '{enrollment.billing_mode !== "monthly" ? (\n                          <Button variant="ghost" onClick={() => openEnrollmentEdit(enrollment)}>\n                            تعديل التسجيل\n                          </Button>\n                        ) : null}');
  source = source.replace('                          إلغاء التسجيل\n', '                          {enrollment.billing_mode === "monthly" ? "إيقاف التسجيل" : "إلغاء التسجيل"}\n');
  source = source.replace('            هل تريد إلغاء تسجيل <b>{currentDb.students.find((s) => s.id === cancelEnrollment?.student_id)?.full_name || "الطالب"}</b>؟', '            {cancelEnrollment?.billing_mode === "monthly" ? "هل تريد إيقاف الاستحقاقات الشهرية للطالب " : "هل تريد إلغاء تسجيل "}<b>{currentDb.students.find((s) => s.id === cancelEnrollment?.student_id)?.full_name || "الطالب"}</b>؟');
  source = source.replace('            إذا كان على التسجيل سند قبض فعلي، سيمنع النظام الإلغاء إلى أن يتم إلغاء السند المالي أولًا.', '            {cancelEnrollment?.billing_mode === "monthly" ? "سيبقى كل الدين والتاريخ المالي السابق محفوظاً، وسيتوقف فقط توليد الأشهر المستقبلية بعد الشهر الحالي." : "إذا كان على التسجيل سند قبض فعلي، سيمنع النظام الإلغاء إلى أن يتم إلغاء السند المالي أولًا."}');
  source = source.replace('              تأكيد إلغاء التسجيل', '              {cancelEnrollment?.billing_mode === "monthly" ? "تأكيد إيقاف التسجيل" : "تأكيد إلغاء التسجيل"}');
  return source;
});

console.log('Academy monthly UI transform complete');

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { DataResetPanel } from "@/components/DataResetPanel";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from "@/components/ui-kit";
import { audit, transact, uid } from "@/lib/db";
import { money, toMinor } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إعدادات المركز التعليمي: الاسم، الشعار، العملة، أنواع المصاريف، الترقيم وإعدادات الإيصالات." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { db, actor, allowed } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for settings
  const [settings, setSettings] = useState(db?.settings || null);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newDiscountTitle, setNewDiscountTitle] = useState("");
  const [newDiscountAmount, setNewDiscountAmount] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(db?.settings?.logo_data_url || null);
  const [desktopInfo, setDesktopInfo] = useState<{ name: string; version: string; packaged: boolean } | null>(null);
  const [licenseCustomer, setLicenseCustomer] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    if (db) {
      setSettings(db.settings);
      setExpenseCategories(db.expense_categories || []);
      setLogoPreview(db.settings?.logo_data_url || null);
    }
  }, [db]);

  useEffect(() => {
    const api = window.academyDesktop;
    if (!api) return;
    void Promise.all([api.app.getInfo(), api.license.getStatus()]).then(([info, license]) => {
      setDesktopInfo(info);
      setLicenseCustomer(license.license?.customer ?? null);
    });
  }, []);

  if (!db) return null;
  if (!allowed("settings.view")) return <Denied />;
  const canEdit = allowed("settings.update");

  function saveSettings() {
    if (!settings) return;
    try {
      transact((d) => {
        d.settings = { ...settings };
        d.expense_categories = expenseCategories;
        audit(d, actor, "settings", null, "update", "تحديث إعدادات المركز التعليمي");
      });
      setSuccess("تم حفظ الإعدادات بنجاح!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function addCategory() {
    if (!newCategory.trim()) return;
    setExpenseCategories([...expenseCategories, newCategory.trim()]);
    setNewCategory("");
    setShowAddCategory(false);
  }

  function removeCategory(index: number) {
    setExpenseCategories(expenseCategories.filter((_, i) => i !== index));
  }

  function addDiscountPreset() {
    if (!settings) return;
    const title = newDiscountTitle.trim();
    const amount = toMinor(newDiscountAmount);
    if (!title) return setError("عنوان الخصم إلزامي");
    if (amount <= 0) return setError("قيمة الخصم يجب أن تكون أكبر من صفر");
    if (settings.discount_presets.some((item) => item.active && item.title.trim().toLowerCase() === title.toLowerCase())) {
      return setError("يوجد خصم فعّال بنفس العنوان");
    }
    setSettings({
      ...settings,
      discount_presets: [...settings.discount_presets, { id: uid(), title, amount, active: true }],
    });
    setNewDiscountTitle("");
    setNewDiscountAmount("");
    setError(null);
  }

  function toggleDiscountPreset(id: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      discount_presets: settings.discount_presets.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
      ),
    });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("الملف المختار ليس صورة صالحة");
    if (file.size > 2 * 1024 * 1024) return setError("حجم الشعار يجب ألا يتجاوز 2 MB");
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setSettings((prev) => (prev ? { ...prev, logo_data_url: dataUrl } : prev));
    };
    reader.readAsDataURL(file);
  }

  if (!settings) return <Empty text="جاري تحميل الإعدادات..." />;

  return (
    <div>
      <PageHeader
        title="الإعدادات"
        subtitle="إدارة إعدادات المركز التعليمي الأساسية"
        actions={canEdit ? <Button onClick={saveSettings}>💾 حفظ الإعدادات</Button> : null}
      />

      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-success/10 p-3 text-sm text-success">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* معلومات المركز التعليمي */}
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">🏢 معلومات المركز التعليمي</h2>
          <div className="space-y-3">
            <Field label="اسم المركز التعليمي">
              <Input
                value={settings.institute_name}
                onChange={(e) => setSettings({ ...settings, institute_name: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <Field label="اسم المدير">
              <Input
                value={settings.director_name}
                onChange={(e) => setSettings({ ...settings, director_name: e.target.value })}
                disabled={!canEdit}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الهاتف">
                <Input
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="العملة">
                <Input
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  disabled={!canEdit}
                  placeholder="ر.س / $ / د.إ"
                />
              </Field>
            </div>
            <Field label="العنوان">
              <Textarea
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                disabled={!canEdit}
                rows={2}
              />
            </Field>
          </div>
        </div>

        {/* الترقيم */}
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">🔢 الترقيم التلقائي</h2>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="بادئة رقم الطالب">
                <Input
                  value={settings.student_code_prefix}
                  onChange={(e) => setSettings({ ...settings, student_code_prefix: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="التالي للطالب">
                <Input
                  type="number"
                  value={settings.student_code_next}
                  onChange={(e) => setSettings({ ...settings, student_code_next: Number(e.target.value) || 1 })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="بادئة رقم الإيصال">
                <Input
                  value={settings.receipt_prefix}
                  onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="التالي للإيصال">
                <Input
                  type="number"
                  value={settings.receipt_next}
                  onChange={(e) => setSettings({ ...settings, receipt_next: Number(e.target.value) || 1 })}
                  disabled={!canEdit}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* أنواع المصاريف */}
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">💰 أنواع المصاريف</h2>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {expenseCategories.map((cat, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  {cat}
                  {canEdit && (
                    <button
                      onClick={() => removeCategory(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {showAddCategory ? (
                  <>
                    <Input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="نوع مصروف جديد..."
                      className="flex-1"
                    />
                    <Button onClick={addCategory}>إضافة</Button>
                    <Button variant="ghost" onClick={() => setShowAddCategory(false)}>
                      إلغاء
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setShowAddCategory(true)}>
                    + إضافة نوع
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">تُستخدم هذه الأنواع في شاشة المصاريف.</p>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">🏷️ الخصومات الجاهزة</h2>
          <div className="space-y-3">
            {settings.discount_presets.length ? (
              <Table head={["العنوان", "القيمة", "الحالة", ""]}>
                {settings.discount_presets.map((item) => (
                  <tr key={item.id} className={item.active ? "" : "opacity-60"}>
                    <Td className="font-semibold">{item.title}</Td>
                    <Td className="tabular-nums">{money(item.amount, settings.currency)}</Td>
                    <Td><Badge tone={item.active ? "success" : "muted"}>{item.active ? "مفعّل" : "موقوف"}</Badge></Td>
                    <Td>{canEdit ? <Button variant="ghost" onClick={() => toggleDiscountPreset(item.id)}>{item.active ? "تعطيل" : "تفعيل"}</Button> : null}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">لا توجد خصومات جاهزة بعد.</p>
            )}
            {canEdit ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                <Input value={newDiscountTitle} onChange={(e) => setNewDiscountTitle(e.target.value)} placeholder="مثال: خصم إخوة" />
                <Input type="number" step="0.01" min="0" value={newDiscountAmount} onChange={(e) => setNewDiscountAmount(e.target.value)} placeholder="القيمة" />
                <Button variant="secondary" onClick={addDiscountPreset}>+ إضافة</Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">تعطيل الخصم يمنع استخدامه في تسجيلات جديدة، لكنه يبقى محفوظاً حتى لا يتأثر التاريخ المالي للتسجيلات السابقة.</p>
          </div>
        </div>
      </div>

      {/* ✅ قسم الشعار */}
      <div className="mt-6 panel p-5">
        <h2 className="mb-4 text-sm font-bold">🖼️ شعار المركز التعليمي</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Field label="تحميل الشعار" className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={!canEdit}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
            />
          </Field>
          {logoPreview && (
            <div className="shrink-0">
              <img src={logoPreview} alt="شعار المركز التعليمي" className="max-h-24 w-auto rounded-lg border border-border" />
            </div>
          )}
        </div>
        {!logoPreview && <p className="mt-2 text-sm text-muted-foreground">لم يتم رفع شعار بعد.</p>}
      </div>

      {/* ✅ قسم إعدادات الإيصالات */}
      <div className="mt-6 panel p-5">
        <h2 className="mb-4 text-sm font-bold">🧾 إعدادات الإيصالات</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="حجم الورق">
            <Select
              value={settings.receipt_paper_size || "A5"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_paper_size: e.target.value as "A4" | "A5",
                })
              }
              disabled={!canEdit}
            >
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </Select>
          </Field>
          <Field label="نص التذييل">
            <Input
              value={settings.receipt_footer_text || "شكراً لثقتكم بنا"}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_footer_text: e.target.value,
                })
              }
              disabled={!canEdit}
            />
          </Field>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showLogo"
              checked={settings.receipt_show_logo !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_show_logo: e.target.checked,
                })
              }
              disabled={!canEdit}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="showLogo" className="text-sm font-medium text-foreground">
              إظهار الشعار في الإيصال
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showPaymentMethod"
              checked={settings.receipt_show_payment_method !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_show_payment_method: e.target.checked,
                })
              }
              disabled={!canEdit}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="showPaymentMethod" className="text-sm font-medium text-foreground">
              إظهار طريقة الدفع
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showGuardian"
              checked={settings.receipt_show_guardian !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_show_guardian: e.target.checked,
                })
              }
              disabled={!canEdit}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="showGuardian" className="text-sm font-medium text-foreground">
              إظهار اسم ولي الأمر
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showNotes"
              checked={settings.receipt_show_notes !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  receipt_show_notes: e.target.checked,
                })
              }
              disabled={!canEdit}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
            />
            <label htmlFor="showNotes" className="text-sm font-medium text-foreground">
              إظهار الملاحظات
            </label>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          هذه الإعدادات تؤثر على طباعة سندات القبض في شاشة الإيصالات والفواتير.
        </p>
      </div>

      {desktopInfo ? (
        <div className="mt-6 panel p-5">
          <h2 className="mb-4 text-sm font-bold">🖥️ نسخة Windows</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">إصدار البرنامج</p>
              <p className="mt-1 font-bold" dir="ltr">{desktopInfo.version}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">الترخيص</p>
              <p className="mt-1 font-bold">{licenseCustomer || "غير معروف"}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">حفظ البيانات</p>
              <p className="mt-1 font-semibold">SQLite محلي داخل مجلد بيانات مستخدم Windows</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={checkingUpdates}
              onClick={async () => {
                const api = window.academyDesktop;
                if (!api) return;
                setCheckingUpdates(true);
                try {
                  const result = await api.app.checkForUpdates();
                  setUpdateMessage(result.message);
                } catch (e) {
                  setUpdateMessage((e as Error).message || "تعذر فحص التحديثات.");
                } finally {
                  setCheckingUpdates(false);
                }
              }}
            >
              {checkingUpdates ? "جارٍ الفحص…" : "فحص التحديثات"}
            </Button>
            {updateMessage ? <p className="text-sm text-muted-foreground">{updateMessage}</p> : null}
          </div>
        </div>
      ) : null}

      <DataResetPanel />

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={saveSettings}>💾 حفظ الإعدادات</Button>
        </div>
      )}
    </div>
  );
}

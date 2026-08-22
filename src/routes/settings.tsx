import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Select, Table, Td, Textarea } from "@/components/ui-kit";
import { transact, update } from "@/lib/db";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — نظام إدارة المعهد" },
      { name: "description", content: "إعدادات المعهد: الاسم، الشعار، العملة، أنواع المصاريف، الترقيم وإعدادات الإيصالات." },
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
  const [logoPreview, setLogoPreview] = useState<string | null>(db?.settings?.logo_data_url || null);

  useEffect(() => {
    if (db) {
      setSettings(db.settings);
      setExpenseCategories(db.expense_categories || []);
      setLogoPreview(db.settings?.logo_data_url || null);
    }
  }, [db]);

  if (!db) return null;
  if (!allowed("settings.view")) return <Denied />;
  const canEdit = allowed("settings.update");

  const cur = db.settings.currency;

  function saveSettings() {
    if (!settings) return;
    try {
      transact((d) => {
        d.settings = { ...settings };
        d.expense_categories = expenseCategories;
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

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
        subtitle="إدارة إعدادات المعهد الأساسية"
        actions={canEdit ? <Button onClick={saveSettings}>💾 حفظ الإعدادات</Button> : null}
      />

      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-success/10 p-3 text-sm text-success">{success}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* معلومات المعهد */}
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">🏢 معلومات المعهد</h2>
          <div className="space-y-3">
            <Field label="اسم المعهد">
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
            <Field label="السنة الدراسية">
              <Input
                value={settings.academic_year}
                onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })}
                disabled={!canEdit}
                placeholder="2025-2026"
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
      </div>

      {/* ✅ قسم الشعار */}
      <div className="mt-6 panel p-5">
        <h2 className="mb-4 text-sm font-bold">🖼️ شعار المعهد</h2>
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
              <img src={logoPreview} alt="شعار المعهد" className="max-h-24 w-auto rounded-lg border border-border" />
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

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={saveSettings}>💾 حفظ الإعدادات</Button>
        </div>
      )}
    </div>
  );
}

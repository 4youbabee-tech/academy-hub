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
      { name: "description", content: "إعدادات المعهد: الاسم، الشعار، العملة، أوزان التقييم، أنواع المصاريف، الترقيم." },
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

  useEffect(() => {
    if (db) {
      setSettings(db.settings);
      setExpenseCategories(db.expense_categories || []);
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

        {/* أوزان التقييم */}
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-bold">📊 أوزان التقييم</h2>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نهائي %">
                <Input
                  type="number"
                  value={settings.grading.weights.final}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      grading: {
                        ...settings.grading,
                        weights: { ...settings.grading.weights, final: Number(e.target.value) || 0 },
                      },
                    })
                  }
                  disabled={!canEdit}
                />
              </Field>
              <Field label="نصفي %">
                <Input
                  type="number"
                  value={settings.grading.weights.midterm}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      grading: {
                        ...settings.grading,
                        weights: { ...settings.grading.weights, midterm: Number(e.target.value) || 0 },
                      },
                    })
                  }
                  disabled={!canEdit}
                />
              </Field>
              <Field label="اختبارات قصيرة %">
                <Input
                  type="number"
                  value={settings.grading.weights.quiz}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      grading: {
                        ...settings.grading,
                        weights: { ...settings.grading.weights, quiz: Number(e.target.value) || 0 },
                      },
                    })
                  }
                  disabled={!canEdit}
                />
              </Field>
              <Field label="الحضور %">
                <Input
                  type="number"
                  value={settings.grading.weights.attendance}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      grading: {
                        ...settings.grading,
                        weights: { ...settings.grading.weights, attendance: Number(e.target.value) || 0 },
                      },
                    })
                  }
                  disabled={!canEdit}
                />
              </Field>
            </div>
            <Field label="نسبة النجاح %">
              <Input
                type="number"
                value={settings.grading.pass_mark}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    grading: { ...settings.grading, pass_mark: Number(e.target.value) || 0 },
                  })
                }
                disabled={!canEdit}
              />
            </Field>
            <p className="text-xs text-muted-foreground">المجموع يجب أن يكون 100% لضمان دقة النتائج.</p>
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
              <Field label="بادئة رقم الشهادة">
                <Input
                  value={settings.certificate_prefix}
                  onChange={(e) => setSettings({ ...settings, certificate_prefix: e.target.value })}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="التالي للشهادة">
                <Input
                  type="number"
                  value={settings.certificate_next}
                  onChange={(e) => setSettings({ ...settings, certificate_next: Number(e.target.value) || 1 })}
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

      {canEdit && (
        <div className="mt-6 flex justify-end">
          <Button onClick={saveSettings}>💾 حفظ الإعدادات</Button>
        </div>
      )}
    </div>
  );
}

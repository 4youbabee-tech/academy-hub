import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { Denied } from "@/components/AppShell";
import { Button, PageHeader, Panel } from "@/components/ui-kit";
import { audit, flushDb, replaceDb, transact } from "@/lib/db";
import { useApp } from "@/lib/session";
import type { DB } from "@/lib/types";
import { assertActiveOwnerExists } from "@/lib/domain-guards";
import { localFileTimestamp } from "@/lib/format";

export const Route = createFileRoute("/backup")({
  head: () => ({
    meta: [
      { title: "النسخ الاحتياطي — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إنشاء نسخة احتياطية محلية واستعادة بيانات النظام." },
    ],
  }),
  component: BackupPage,
});

function isDbBackup(value: unknown): value is DB {
  if (!value || typeof value !== "object") return false;
  const db = value as Partial<DB>;

  return (
    typeof db.schema_version === "number" &&
    !!db.settings &&
    typeof db.settings === "object" &&
    Array.isArray(db.users) &&
    Array.isArray(db.students) &&
    Array.isArray(db.courses) &&
    Array.isArray(db.classes) &&
    Array.isArray(db.enrollments) &&
    Array.isArray(db.invoices) &&
    Array.isArray(db.installments) &&
    Array.isArray(db.payments) &&
    Array.isArray(db.employees) &&
    Array.isArray(db.payroll_items) &&
    Array.isArray(db.advances) &&
    Array.isArray(db.expenses) &&
    Array.isArray(db.incomes) &&
    Array.isArray(db.audit_log)
  );
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "academy-hub";
}

function BackupPage() {
  const { db, actor, allowed } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const desktopApi = typeof window === "undefined" ? undefined : window.academyDesktop;

  if (!db) return null;
  if (!allowed("backup.view")) return <Denied />;
  const currentDb = db;

  const canExport = allowed("backup.create");
  const canRestore = allowed("backup.restore");

  async function exportBackup() {
    try {
      await flushDb();
      if (desktopApi) {
        const result = await desktopApi.backup.create();
        if (result.cancelled) return;
        transact((draft) =>
          audit(draft, actor, "backup", null, "create", "إنشاء نسخة احتياطية SQLite لقاعدة البيانات"),
        );
        setError(null);
        setMessage(`تم إنشاء النسخة الاحتياطية بنجاح${result.path ? `: ${result.path}` : "."}`);
        return;
      }

      const payload = JSON.stringify(currentDb, null, 2);
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = localFileTimestamp();
      a.href = url;
      a.download = `${safeFilePart(currentDb.settings.institute_name)}-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      transact((draft) =>
        audit(draft, actor, "backup", null, "create", "إنشاء نسخة احتياطية من قاعدة البيانات المحلية"),
      );
      setError(null);
      setMessage("تم إنشاء النسخة الاحتياطية وتنزيلها على جهازك.");
    } catch (e) {
      setMessage(null);
      setError((e as Error).message || "تعذر إنشاء النسخة الاحتياطية.");
    }
  }

  async function restoreDesktopBackup() {
    if (!desktopApi) return;
    if (!confirm("استعادة النسخة ستستبدل البيانات الحالية بالكامل ثم تعيد تشغيل البرنامج. هل تريد المتابعة؟")) {
      return;
    }
    setRestoring(true);
    setMessage(null);
    setError(null);
    try {
      const result = await desktopApi.backup.restore();
      if (result.cancelled) {
        setRestoring(false);
        return;
      }
      setMessage("تمت الاستعادة. جارٍ إعادة تشغيل البرنامج…");
    } catch (e) {
      setRestoring(false);
      setError((e as Error).message || "تعذر استعادة النسخة الاحتياطية.");
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!confirm("استعادة النسخة ستستبدل البيانات المحلية الحالية بالكامل. هل تريد المتابعة؟")) return;

    setRestoring(true);
    setMessage(null);
    setError(null);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);

      if (!isDbBackup(parsed)) {
        throw new Error("الملف المختار ليس نسخة احتياطية صالحة لـ Academy Hub.");
      }

      if (parsed.schema_version > currentDb.schema_version) {
        throw new Error(
          `نسخة الاحتياط أحدث من إصدار قاعدة البيانات الحالي (v${parsed.schema_version}). حدّث البرنامج أولاً ثم أعد المحاولة.`,
        );
      }

      assertActiveOwnerExists(parsed);

      replaceDb(parsed);
      transact((draft) =>
        audit(draft, actor, "backup", null, "restore", `استعادة نسخة احتياطية من الملف ${file.name}`),
      );
      await flushDb();

      setMessage("تمت استعادة النسخة الاحتياطية بنجاح.");
    } catch (e) {
      setError((e as Error).message || "تعذر استعادة النسخة الاحتياطية.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="النسخ الاحتياطي"
        subtitle="احفظ نسخة من بيانات المركز التعليمي محلياً أو استعد نسخة سابقة عند الحاجة."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-bold">إنشاء نسخة احتياطية</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {desktopApi
              ? "يتم حفظ نسخة SQLite كاملة تشمل الطلاب والتسجيلات والفواتير والإيصالات والموظفين والمستخدمين والإعدادات وسجل التدقيق."
              : "يتم تنزيل ملف JSON يحتوي على الطلاب والأعوام الدراسية والتسجيلات والفواتير والإيصالات والمستخدمين والإعدادات وسجل التدقيق الحالي."}
          </p>
          <div className="mt-5">
            <Button onClick={exportBackup} disabled={!canExport}>
              تنزيل نسخة احتياطية
            </Button>
          </div>
          {!canExport ? (
            <p className="mt-3 text-xs text-muted-foreground">لا تملك صلاحية إنشاء نسخة احتياطية.</p>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="text-lg font-bold">استعادة نسخة احتياطية</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            اختر ملف نسخة احتياطية صادر من Academy Hub. الاستعادة تستبدل البيانات المحلية الحالية، ويُنشئ إصدار
            Windows نسخة أمان تلقائية قبل الاستبدال.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={restoreBackup}
          />
          <div className="mt-5">
            <Button
              variant="secondary"
              onClick={() => {
                if (desktopApi) void restoreDesktopBackup();
                else inputRef.current?.click();
              }}
              disabled={!canRestore || restoring}
            >
              {restoring ? "جارٍ الاستعادة..." : "اختيار ملف واستعادة"}
            </Button>
          </div>
          {!canRestore ? (
            <p className="mt-3 text-xs text-muted-foreground">لا تملك صلاحية استعادة نسخة احتياطية.</p>
          ) : null}
        </Panel>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm font-semibold text-success">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {error}
        </div>
      ) : null}

      <Panel className="mt-4">
        <h2 className="text-sm font-bold">مهم</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {desktopApi
            ? "نسخة Windows تحفظ البيانات في SQLite داخل مجلد بيانات المستخدم، وليس داخل مجلد التثبيت. التحديثات لا تمسح البيانات أو الترخيص، ويُنشئ البرنامج نسخة تلقائية يومية مع الاحتفاظ بآخر 30 نسخة."
            : "البيانات في نسخة الويب محفوظة داخل المتصفح عبر IndexedDB، لذلك النسخة الاحتياطية الخارجية مهمة قبل تغيير الجهاز أو مسح بيانات المتصفح."}
        </p>
      </Panel>
    </div>
  );
}

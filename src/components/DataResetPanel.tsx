import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui-kit";
import { flushDb } from "@/lib/db";
import { DATA_RESET_CONFIRMATION, resetOperationalData } from "@/lib/data-reset";
import { localFileTimestamp } from "@/lib/format";
import { useApp } from "@/lib/session";

function downloadBrowserSafetyBackup(payload: string, instituteName: string): void {
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = instituteName.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-") || "academy-hub";
  anchor.href = url;
  anchor.download = `${safeName}-before-data-reset-${localFileTimestamp()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DataResetPanel() {
  const { db, user, allowed } = useApp();
  const [stage, setStage] = useState<"closed" | "warning" | "typed">("closed");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!db || !user || !allowed("system.reset")) return null;
  const currentDb = db;
  const currentUser = user;

  async function executeReset() {
    if (confirmation.trim() !== DATA_RESET_CONFIRMATION) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await flushDb();
      const desktopApi = window.academyDesktop;
      if (desktopApi) {
        await desktopApi.backup.createResetSafety();
      } else {
        downloadBrowserSafetyBackup(JSON.stringify(currentDb, null, 2), currentDb.settings.institute_name);
      }

      await resetOperationalData(currentUser.id);
      setStage("closed");
      setConfirmation("");
      setSuccess("تم إنشاء نسخة أمان ومسح بيانات التشغيل بنجاح. بقي المستخدمون والإعدادات وسجل التدقيق محفوظين.");
    } catch (e) {
      setError((e as Error).message || "تعذر مسح بيانات التشغيل.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-6 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-base font-bold text-destructive">⚠️ مسح بيانات التشغيل</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              يستخدم هذا الخيار عند الانتهاء من بيانات التجربة أو عند بدء تشغيل نظيف. سيتم مسح الطلاب والصفوف والتسجيلات والفواتير والسندات والموظفين والرواتب والسلف والمصاريف والمداخيل.
            </p>
            <p className="mt-2 text-sm font-semibold">
              لن يتم مسح حسابات المستخدمين أو صلاحياتهم أو إعدادات المركز أو الشعار أو أنواع المصاريف أو سجل التدقيق أو ترخيص Windows.
            </p>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              قبل المسح ينشئ البرنامج نسخة أمان تلقائيًا. في Windows تُحفظ نسخة محمية محليًا، وفي نسخة الويب يتم تنزيل ملف JSON قبل تنفيذ المسح.
            </p>
          </div>
          <Button variant="danger" onClick={() => { setError(null); setSuccess(null); setStage("warning"); }}>
            مسح بيانات التشغيل
          </Button>
        </div>
        {success ? <div className="mt-4 rounded-lg bg-success/10 p-3 text-sm font-semibold text-success">{success}</div> : null}
        {error ? <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</div> : null}
      </div>

      <Modal open={stage === "warning"} title="تأكيد أول — عملية خطيرة" onClose={() => !busy && setStage("closed")}>
        <div className="space-y-4">
          <p className="text-sm leading-7">
            أنت على وشك مسح جميع بيانات التشغيل والتجارب. العملية لا يمكن التراجع عنها من داخل النظام إلا باستعادة نسخة احتياطية.
          </p>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
            تأكد أنك تريد فعلًا بدء قاعدة تشغيل نظيفة قبل المتابعة.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStage("closed")}>إلغاء</Button>
            <Button variant="danger" onClick={() => setStage("typed")}>نعم، انتقل للتأكيد النهائي</Button>
          </div>
        </div>
      </Modal>

      <Modal open={stage === "typed"} title="التأكيد النهائي بالكتابة" onClose={() => !busy && setStage("closed")}>
        <div className="space-y-4">
          <p className="text-sm leading-7">
            للتأكيد النهائي اكتب العبارة التالية حرفيًا:
          </p>
          <div className="rounded-lg bg-muted p-3 text-center text-base font-bold">{DATA_RESET_CONFIRMATION}</div>
          <Input
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={DATA_RESET_CONFIRMATION}
            disabled={busy}
          />
          <p className="text-xs leading-6 text-muted-foreground">
            عند التنفيذ سيُنشئ البرنامج نسخة أمان أولًا، ثم يمسح بيانات التشغيل، ثم يحفظ قاعدة البيانات الجديدة فورًا.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setStage("closed"); setConfirmation(""); }} disabled={busy}>إلغاء</Button>
            <Button
              variant="danger"
              disabled={busy || confirmation.trim() !== DATA_RESET_CONFIRMATION}
              onClick={() => void executeReset()}
            >
              {busy ? "جارٍ إنشاء نسخة الأمان والمسح…" : "مسح البيانات نهائيًا"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

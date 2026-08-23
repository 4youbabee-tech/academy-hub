import { useEffect, useState, type ReactNode } from "react";
import { Button, Panel } from "@/components/ui-kit";

type Status = Awaited<ReturnType<NonNullable<Window["academyDesktop"]>["license"]["getStatus"]>>;

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      جارٍ تجهيز Academy Hub…
    </div>
  );
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const api = window.academyDesktop;
    if (!api) {
      setChecked(true);
      return () => {
        active = false;
      };
    }

    void api.license
      .getStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error: unknown) => {
        if (active) setMessage((error as Error).message || "تعذر فحص الترخيص.");
      })
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!checked) return <LoadingScreen />;
  const api = typeof window === "undefined" ? undefined : window.academyDesktop;
  if (!api) return children;
  if (status?.valid) return children;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <Panel className="w-full max-w-xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold">تفعيل Academy Hub</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            هذا البرنامج مرخّص لكل جهاز على حدة ويعمل بدون إنترنت بعد التفعيل.
          </p>
        </div>

        <div className="mt-6 rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground">رقم الجهاز (Machine ID)</p>
          <p className="mt-2 break-all font-mono text-base font-bold" dir="ltr">
            {status?.machineId || "جارٍ القراءة…"}
          </p>
        </div>

        <ol className="mt-5 list-decimal space-y-2 pr-5 text-sm leading-7 text-muted-foreground">
          <li>انسخ رقم الجهاز وأرسله إلى صاحب البرنامج.</li>
          <li>ستستلم ملفًا اسمه academy.license.</li>
          <li>اضغط «استيراد ملف الترخيص» واختر الملف.</li>
        </ol>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            disabled={!status?.machineId || busy}
            onClick={async () => {
              await api.license.copyMachineId();
              setMessage("تم نسخ رقم الجهاز.");
            }}
          >
            نسخ رقم الجهاز
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              try {
                const result = await api.license.importFile();
                setStatus(result.status);
                if (!result.cancelled && result.status.valid) setMessage("تم التفعيل بنجاح.");
              } catch (error) {
                setMessage((error as Error).message || "تعذر استيراد الترخيص.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "جارٍ التحقق…" : "استيراد ملف الترخيص"}
          </Button>
          <Button variant="ghost" onClick={() => void api.app.quit()}>
            إغلاق
          </Button>
        </div>

        <p className={`mt-5 text-center text-sm font-semibold ${status?.valid ? "text-success" : "text-destructive"}`}>
          {message || status?.message || "البرنامج غير مفعّل."}
        </p>
      </Panel>
    </div>
  );
}


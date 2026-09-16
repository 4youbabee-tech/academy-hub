import { useState } from "react";
import { Button, Field, Input, Panel } from "@/components/ui-kit";
import { initializeOwner } from "@/lib/db";

export function FirstRunOwnerSetup() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) return setError("تأكيد كلمة المرور غير مطابق");
    setBusy(true);
    try {
      await initializeOwner({ full_name: fullName, username, password });
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Panel className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-bold">إعداد المدير الرئيسي لـ Academy Hub</h1>
          <p className="mt-2 text-sm text-muted-foreground">هذه الخطوة تظهر مرة واحدة عند أول تشغيل. المدير الرئيسي يملك جميع الصلاحيات ولا توجد كلمة مرور افتراضية.</p>
        </div>
        <form className="mt-6 space-y-3" onSubmit={submit}>
          <Field label="اسم المدير الرئيسي"><Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="الاسم الكامل" /></Field>
          <Field label="اسم المستخدم"><Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="مثال: manager" /></Field>
          <Field label="كلمة المرور"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="10 أحرف على الأقل، أحرف وأرقام" /></Field>
          <Field label="تأكيد كلمة المرور"><Input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">احتفظ بكلمة المرور بمكان آمن. النظام لا ينشئ كلمة مرور جاهزة ولا يعرض كلمة المرور المخزنة.</p>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={busy || !fullName.trim() || !username.trim() || !password || !confirm}>{busy ? "جارٍ إنشاء الحساب..." : "إنشاء حساب المدير الرئيسي"}</Button>
        </form>
      </Panel>
    </div>
  );
}

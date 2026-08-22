import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/session";
import { Button, Input, Panel } from "@/components/ui-kit";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "الرئيسية",
    items: [{ to: "/", label: "لوحة المعلومات", perm: "students.view" }],
  },
  {
    group: "الأكاديمي",
    items: [
      { to: "/students", label: "الطلاب", perm: "students.view" },
      { to: "/courses", label: "الدورات", perm: "courses.view" },
      { to: "/classes", label: "الصفوف والجداول", perm: "classes.view" },
    ],
  },
  {
    group: "المالية",
    items: [
      { to: "/finance", label: "الفواتير والدفعات", perm: "finance.view" },
      { to: "/receipts", label: "الإيصالات", perm: "finance.view" },
      { to: "/expenses", label: "المصاريف والمداخيل", perm: "expenses.view" },
      { to: "/employees", label: "الموظفون والرواتب", perm: "payroll.view" },
      { to: "/reports", label: "التقارير", perm: "reports.view" },
    ],
  },
  {
    group: "النظام",
    items: [
      { to: "/settings", label: "الإعدادات", perm: "settings.view" },
      { to: "/users", label: "المستخدمون", perm: "users.view" },
      { to: "/audit", label: "سجل التدقيق", perm: "audit.view" },
      { to: "/backup", label: "النسخ الاحتياطي", perm: "backup.view" },
    ],
  },
] as const;

function LoginScreen() {
  const { login } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Panel className="w-full max-w-sm">
        <h1 className="text-xl font-bold">نظام إدارة المعهد</h1>
        <p className="mt-1 text-sm text-muted-foreground">سجّل الدخول للمتابعة</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const err = await login(username, password);
            setBusy(false);
            setError(err);
          }}
        >
          <Input placeholder="اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={busy}>
            {busy ? "..." : "دخول"}
          </Button>
        </form>
        <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          الحساب الافتراضي عند أول تشغيل: <b>owner</b> / <b>owner123</b> — غيّر كلمة المرور من شاشة المستخدمين.
        </p>
      </Panel>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { db, user, logout, allowed } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  if (!db) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        جارٍ تحميل قاعدة البيانات المحلية…
      </div>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-64 shrink-0 overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground transition-transform lg:static lg:translate-x-0 no-print",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-2 pb-4">
          <p className="text-base font-bold">{db.settings.institute_name}</p>
          <p className="text-xs opacity-70">السنة الدراسية {db.settings.academic_year}</p>
        </div>
        <nav className="space-y-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => allowed(i.perm));
            if (!items.length) return null;
            return (
              <div key={group.group}>
                <p className="px-2 pb-1 text-[11px] font-bold uppercase opacity-55">{group.group}</p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent",
                        pathname === item.to && "bg-sidebar-accent font-bold",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur no-print">
          <button className="rounded-lg px-2 py-1 lg:hidden" onClick={() => setOpen((v) => !v)}>
            ☰
          </button>
          <div className="flex-1" />
          <div className="text-left">
            <p className="text-sm font-semibold">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button variant="ghost" onClick={logout}>
            خروج
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function Denied() {
  return (
    <Panel className="text-center">
      <p className="text-sm font-semibold text-destructive">لا تملك صلاحية الوصول إلى هذه الشاشة.</p>
    </Panel>
  );
}

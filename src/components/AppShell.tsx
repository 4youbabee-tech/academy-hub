import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/lib/session";
import { Badge, Button, Input, Modal, Panel, Table, Td } from "@/components/ui-kit";
import { HelpGuide } from "@/components/HelpGuide";
import { ROLE_LABELS, can } from "@/lib/permissions";
import { studentMonthlyLedger } from "@/lib/finance";
import { localMonthKey, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "الرئيسية",
    theme: {
      panel: "border-sky-400/20 bg-sky-500/5",
      title: "text-sky-200",
      hover: "hover:bg-sky-500/10",
      active: "bg-sky-500/20 text-white ring-1 ring-inset ring-sky-300/20",
    },
    items: [{ to: "/", label: "لوحة المعلومات", perm: "students.view" }],
  },
  {
    group: "الأكاديمي",
    theme: {
      panel: "border-cyan-400/20 bg-cyan-500/5",
      title: "text-cyan-200",
      hover: "hover:bg-cyan-500/10",
      active: "bg-cyan-500/20 text-white ring-1 ring-inset ring-cyan-300/20",
    },
    items: [
      { to: "/students", label: "الطلاب والتسجيل", perm: "students.view" },
      { to: "/courses", label: "العام الدراسي", perm: "courses.view" },
      { to: "/classes", label: "الصفوف", perm: "classes.view" },
    ],
  },
  {
    group: "المالية",
    theme: {
      panel: "border-emerald-400/20 bg-emerald-500/5",
      title: "text-emerald-200",
      hover: "hover:bg-emerald-500/10",
      active: "bg-emerald-500/20 text-white ring-1 ring-inset ring-emerald-300/20",
    },
    items: [
      { to: "/receipts", label: "الفواتير والتحصيل", perm: "finance.view" },
      { to: "/expenses", label: "المصاريف والمداخيل", perm: "expenses.view" },
      { to: "/employees", label: "الموظفون والرواتب", perm: "payroll.view" },
      { to: "/reports", label: "التقارير", perm: "reports.view" },
    ],
  },
  {
    group: "النظام",
    theme: {
      panel: "border-violet-400/20 bg-violet-500/5",
      title: "text-violet-200",
      hover: "hover:bg-violet-500/10",
      active: "bg-violet-500/20 text-white ring-1 ring-inset ring-violet-300/20",
    },
    items: [
      { to: "/settings", label: "الإعدادات", perm: "settings.view" },
      { to: "/users", label: "المستخدمون", perm: "users.view" },
      { to: "/audit", label: "سجل التدقيق", perm: "audit.view" },
      { to: "/backup", label: "النسخ الاحتياطي", perm: "backup.view" },
    ],
  },
] as const;

function LoginScreen() {
  const { db, login } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Panel className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center text-center">
          {db?.settings.logo_data_url ? (
            <img
              src={db.settings.logo_data_url}
              alt={db.settings.institute_name || "شعار المركز التعليمي"}
              className="mb-3 h-20 w-20 rounded-xl object-contain"
            />
          ) : null}
          <h1 className="text-xl font-bold">{db?.settings.institute_name || "نظام إدارة المركز التعليمي"}</h1>
        </div>
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const arrears = useMemo(() => {
    if (!db || !can(user?.role, "finance.view")) return [];
    const currentMonth = localMonthKey();
    return db.students.flatMap((student) => {
      const overdue = studentMonthlyLedger(db, student.id).filter((row) => row.period < currentMonth && row.due > 0);
      if (!overdue.length) return [];
      const total = overdue.reduce((sum, row) => sum + row.due, 0);
      return [{ student, total, overdue }];
    }).sort((a, b) => b.total - a.total || a.student.full_name.localeCompare(b.student.full_name, "ar"));
  }, [db, user?.role]);

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
          <div className="flex items-center gap-3">
            {db.settings.logo_data_url ? (
              <img
                src={db.settings.logo_data_url}
                alt={db.settings.institute_name || "شعار المركز التعليمي"}
                className="h-12 w-12 shrink-0 rounded-lg bg-white/90 object-contain p-1"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{db.settings.institute_name}</p>
              <p className="text-xs opacity-70">نظام إدارة المركز التعليمي</p>
            </div>
          </div>
        </div>
        <nav className="space-y-4">
          {NAV.map((group) => {
            const items = group.items.filter((i) => allowed(i.perm) && (i.to !== "/audit" || user.role === "owner"));
            if (!items.length) return null;
            return (
              <div key={group.group} className={cn("rounded-xl border p-1.5", group.theme.panel)}>
                <p className={cn("px-2 pb-1 pt-1 text-[11px] font-bold uppercase", group.theme.title)}>{group.group}</p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        group.theme.hover,
                        pathname === item.to && group.theme.active,
                        pathname === item.to && "font-bold",
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

        <div className="mt-6 border-t border-sidebar-border/40 pt-4">
          <button
            type="button"
            onClick={() => {
              setHelpOpen(true);
              setOpen(false);
            }}
            className="w-full rounded-lg px-3 py-2 text-right text-sm font-semibold transition-colors hover:bg-sidebar-accent"
          >
            ❓ كيفية العمل على البرنامج
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur no-print">
          <button className="rounded-lg px-2 py-1 lg:hidden" onClick={() => setOpen((v) => !v)}>
            ☰
          </button>
          <div className="flex-1" />
          {can(user.role, "finance.view") ? (
            <Button variant="ghost" onClick={() => setNotificationsOpen(true)} className="relative">
              🔔
              {arrears.length ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{arrears.length}</span> : null}
            </Button>
          ) : null}
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

      <Modal open={notificationsOpen} title="تنبيهات المتأخرات" onClose={() => setNotificationsOpen(false)} extraWide>
        {arrears.length ? (
          <Table head={["الطالب", "إجمالي المتأخر", "التفصيل", ""]}>
            {arrears.map(({ student, total, overdue }) => (
              <tr key={student.id}>
                <Td className="font-semibold">{student.full_name}</Td>
                <Td className="tabular-nums text-destructive">{money(total, db.settings.currency)}</Td>
                <Td className="text-xs">{overdue.map((row) => { const [year, month] = row.period.split("-"); return `${Number(month)} / ${year}: ${money(row.due, db.settings.currency)}`; }).join("، ")}</Td>
                <Td><Link to="/students/$id" params={{ id: student.id }} onClick={() => setNotificationsOpen(false)} className="font-semibold text-primary hover:underline">فتح البطاقة</Link></Td>
              </tr>
            ))}
          </Table>
        ) : (
          <div className="rounded-xl border bg-muted/20 p-5 text-sm text-muted-foreground">لا توجد متأخرات من أشهر سابقة.</div>
        )}
      </Modal>

      <Modal open={helpOpen} title="كيفية العمل على البرنامج" onClose={() => setHelpOpen(false)} extraWide>\n        <HelpGuide />\n      </Modal>
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

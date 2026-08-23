import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/session";
import { Button, Input, Modal, Panel } from "@/components/ui-kit";
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
      { to: "/receipts", label: "الإيصالات والفواتير", perm: "finance.view" },
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
              alt={db.settings.institute_name || "شعار المعهد"}
              className="mb-3 h-20 w-20 rounded-xl object-contain"
            />
          ) : null}
          <h1 className="text-xl font-bold">{db?.settings.institute_name || "نظام إدارة المعهد"}</h1>
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
                alt={db.settings.institute_name || "شعار المعهد"}
                className="h-12 w-12 shrink-0 rounded-lg bg-white/90 object-contain p-1"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{db.settings.institute_name}</p>
              <p className="text-xs opacity-70">السنة الدراسية {db.settings.academic_year}</p>
            </div>
          </div>
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

      <Modal open={helpOpen} title="كيفية العمل على البرنامج" onClose={() => setHelpOpen(false)} wide>
        <div className="space-y-6 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="font-bold">الفكرة العامة</p>
            <p className="mt-1 leading-6 text-muted-foreground">
              البرنامج مقسّم إلى أربعة أقسام رئيسية: الأكاديمي، المالية، الموظفون والرواتب، والإدارة. كل قسم له وظيفة واضحة حتى يعرف العامل أين يبدأ وأين يجد النتيجة.
            </p>
          </div>

          <section className="space-y-3">
            <div>
              <p className="text-base font-bold">🎓 أولًا: القسم الأكاديمي</p>
              <p className="mt-1 text-muted-foreground">يُستخدم لإضافة الطلاب والدورات والصفوف ثم تسجيل الطلاب داخل الصفوف.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["الطلاب", "أضف طالبًا جديدًا واحفظ بياناته. من ملف الطالب تستطيع لاحقًا متابعة تسجيلاته وحسابه المالي وسنداته."],
                ["الدورات", "أضف اسم الدورة ومستواها وسعرها الافتراضي. الدورة هي الأساس الذي يُبنى عليه الصف."],
                ["الصفوف والجداول", "أنشئ صفًا واربطه بالدورة والمدرّس والموعد. من داخل الصف يتم تسجيل الطلاب."],
                ["تسجيل الطالب", "من الصف اضغط تسجيل طالب، اختر الطالب وحدد السعر والخصم ورسوم التسجيل. بعد الحفظ يظهر التسجيل ضمن المسجلين وتُنشأ الفاتورة تلقائيًا."],
                ["المسجّلون", "من كل صف افتح المسجلين لمراجعة الطلاب المسجلين، المستحق، المقبوض والمتبقي، مع إمكانية تعديل أو إلغاء التسجيل حسب الحالة المالية."],
                ["ملف الطالب", "يعرض بيانات الطالب، التسجيلات، الفواتير، المقبوضات والمتبقي وسندات القبض، مع إمكانية طباعة السند من نفس الملف."],
                ["أرشفة الطالب", "الأرشفة لا تحذف شيئًا ويمكن استرجاع الطالب لاحقًا. إذا كان لديه تسجيل نشط، أنهِ أو ألغِ التسجيل أولًا ثم نفّذ الأرشفة."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="font-bold">{title}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-base font-bold">💰 ثانيًا: القسم المالي</p>
              <p className="mt-1 text-muted-foreground">كل ما يتعلق بالمستحقات، القبض، المصاريف، المداخيل والتقارير المالية.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["الإيصالات والفواتير", "هذا هو مركز القبض. اختر فاتورة الطالب، أدخل المبلغ، طريقة الدفع، واكتب البيان مثل: رسوم تسجيل أو قسط أول، ثم احفظ السند واطبعه A5."],
                ["المستحق / المقبوض / المتبقي", "المستحق هو إجمالي ما على الطالب، المقبوض هو ما تم تحصيله فعليًا من سندات القبض، والمتبقي هو الفرق بينهما."],
                ["المصاريف", "تُستخدم لتسجيل المصاريف التشغيلية مثل الكهرباء والإيجار والصيانة. المصروف الملغى يبقى بالسجل لكنه لا يدخل في الإجمالي."],
                ["المداخيل", "تُستخدم لعرض أو إضافة المداخيل الجانبية غير المتعلقة بسندات الطلاب. لا تُدخل دفعة الطالب هنا حتى لا تُحتسب مرتين."],
                ["لوحة المعلومات", "تعرض المقبوضات، إجمالي المتبقي على الطلاب، المصاريف التشغيلية، الرواتب المدفوعة، إجمالي مصروفات الشركة وصافي الشهر."],
                ["التقارير", "تُستخدم لمراجعة الربح والخسارة وأرصدة الطلاب وتصدير البيانات عند الحاجة."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="font-bold">{title}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-base font-bold">👥 ثالثًا: الموظفون والرواتب</p>
              <p className="mt-1 text-muted-foreground">لإدارة الموظفين والسلف والرواتب وسندات الدفع.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["إضافة موظف", "أضف الموظف وحدد وظيفته وراتبه الأساسي وحالته."],
                ["السلف", "إذا أخذ الموظف سلفة تُسجل عليه وتُسوّى لاحقًا ضمن الراتب بدون أن تُحسب مرتين كمصروف."],
                ["دفع الراتب", "بعد تجهيز كشف الراتب وتأكيد الدفع يتحول إلى مدفوع ويُحتسب ضمن مصروفات الشركة."],
                ["سند الراتب", "بعد الدفع يمكن طباعة سند راتب يحتوي تفاصيل الأساسي، الإضافات، الحسميات، السلف والصافي المدفوع."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="font-bold">{title}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-base font-bold">⚙️ رابعًا: الإدارة والنظام</p>
              <p className="mt-1 text-muted-foreground">لإدارة إعدادات المعهد والمستخدمين ومراجعة العمليات وحفظ نسخة احتياطية.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["الإعدادات", "عدّل اسم المعهد، الشعار، العملة، أرقام الإيصالات، إعدادات الطباعة وأنواع المصاريف."],
                ["المستخدمون", "أنشئ المستخدمين وحدد دور كل مستخدم حتى تظهر له فقط الشاشات المسموح بها. حسابات المالك يديرها مالك فقط، ولا يمكن تعطيل أو حذف آخر مالك."],
                ["سجل التدقيق", "يعرض سجل العمليات المهمة لمعرفة من أضاف أو عدّل أو ألغى حركة داخل النظام."],
                ["النسخ الاحتياطي", "نزّل نسخة احتياطية دورية من البيانات، ويمكن استعادتها عند الحاجة."],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border p-4">
                  <p className="font-bold">{title}</p>
                  <p className="mt-2 leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="font-bold">مسار العمل الأساسي</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-lg bg-card px-3 py-2">إضافة طالب</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">إضافة دورة</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">إنشاء صف</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">تسجيل الطالب</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">الفاتورة</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">سند قبض</span>
              <span>←</span>
              <span className="rounded-lg bg-card px-3 py-2">تحديث المقبوض والمتبقي</span>
            </div>
          </div>

          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
            <p className="font-bold">ملاحظات مهمة</p>
            <div className="mt-2 space-y-1 leading-6 text-muted-foreground">
              <p>• قبض الطلاب يتم من الإيصالات والفواتير فقط.</p>
              <p>• لا تدخل سند الطالب مرة ثانية في المداخيل.</p>
              <p>• الرواتب تدخل تلقائيًا ضمن إجمالي مصروفات الشركة ولا تُسجل مرة ثانية كمصروف يدوي.</p>
              <p>• عند إلغاء أي حركة مالية، استخدم الإلغاء بدل الحذف حتى يبقى سجل العملية محفوظًا.</p>
              <p>• راجع تفاصيل الموظف والشهر والصافي في نافذة التأكيد قبل دفع الراتب.</p>
              <p>• خذ نسخة احتياطية دورية، خصوصًا قبل استعادة ملف أو تغيير جهاز العمل.</p>
            </div>
          </div>
        </div>
      </Modal>
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

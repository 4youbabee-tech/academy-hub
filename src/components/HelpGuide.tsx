import { useState } from "react";
import { cn } from "@/lib/utils";

type GuideTab = "start" | "academic" | "finance" | "payroll" | "reports" | "admin";

type GuideStep = {
  title: string;
  text: string;
  action?: string;
  result?: string;
};

type GuideSection = {
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  caption: string;
  steps: GuideStep[];
  reminders: string[];
};

const TABS: { id: GuideTab; label: string; icon: string }[] = [
  { id: "start", label: "ابدأ من هنا", icon: "🚀" },
  { id: "academic", label: "الطلاب", icon: "🎓" },
  { id: "finance", label: "الفواتير والتحصيل", icon: "💰" },
  { id: "payroll", label: "الموظفون والرواتب", icon: "👥" },
  { id: "reports", label: "التقارير والطباعة", icon: "🖨️" },
  { id: "admin", label: "الإدارة والحماية", icon: "⚙️" },
];

const GUIDE: Record<GuideTab, GuideSection> = {
  start: {
    title: "تشغيل البرنامج لأول مرة",
    intro: "لا يوجد حساب افتراضي أو كلمة مرور جاهزة. عند قاعدة بيانات جديدة ينشئ المالك حسابه بنفسه أولاً.",
    image: "/help/01-first-start.svg",
    imageAlt: "صورة توضيحية لإعداد البرنامج لأول مرة",
    caption: "أول تشغيل: إنشاء المالك ← إعداد المركز ← المستخدمون ← نسخة احتياطية.",
    steps: [
      { title: "أنشئ حساب المالك", text: "عند أول تشغيل أدخل اسم المالك واسم المستخدم وكلمة مرور قوية. لا توجد كلمة مرور owner123 في النسخة الحالية.", action: "إنشاء حساب المالك", result: "تُنشأ أول هوية إدارية آمنة للنظام." },
      { title: "أدخل بيانات المركز", text: "افتح الإعدادات وحدد الاسم، العملة، الهاتف، العنوان والشعار.", action: "الإعدادات ← حفظ", result: "تظهر بيانات المركز على الشاشات والمطبوعات." },
      { title: "أنشئ المستخدمين", text: "أعطِ كل موظف حسابًا مستقلًا ودورًا مناسبًا ولا تشارك حساب المالك.", action: "المستخدمون ← مستخدم جديد", result: "كل مستخدم يرى فقط الصلاحيات المسموح بها." },
      { title: "جرّب دورة عمل كاملة", text: "أنشئ عامًا/مجموعة وصفًا وطالبًا، سجّل الطالب، ولّد مستحقًا ثم نفّذ قبضًا تجريبيًا.", action: "العام الدراسي ← الصفوف ← الطلاب ← الفواتير والتحصيل", result: "تتأكد أن المستحق والمقبوض والمتبقي متطابقة." },
      { title: "أنشئ أول Backup", text: "بعد التأكد من البيانات، أنشئ نسخة احتياطية. في Windows اختر كلمة حماية قوية واحفظها خارج الكمبيوتر.", action: "النسخ الاحتياطي ← إنشاء نسخة", result: "تصبح لديك نقطة استعادة آمنة قبل بدء العمل الحقيقي." },
    ],
    reminders: [
      "لا يوجد حساب افتراضي بكلمة مرور ثابتة.",
      "اختبر دورة مالية كاملة ببيانات تجريبية قبل إدخال بيانات حقيقية.",
      "احتفظ بالنسخة الاحتياطية وكلمة حمايتها في مكانين منفصلين وآمنين.",
    ],
  },
  academic: {
    title: "إضافة طالب وفتح بطاقته",
    intro: "بطاقة الطالب هي المكان الذي يجمع بياناته الأكاديمية والمالية والأشهر والفواتير والسندات.",
    image: "/help/02-academic-flow.svg",
    imageAlt: "صورة توضيحية لتدفق الطالب والتسجيل والفاتورة",
    caption: "طالب ← تسجيل في صف ← استحقاقات شهرية ← بطاقة الطالب.",
    steps: [
      { title: "أضف الطالب", text: "أدخل الاسم والاتصال والمستوى والمدرسة. الرمز يُنشأ تلقائيًا.", action: "الطلاب والتسجيل ← طالب جديد", result: "يظهر الطالب في القائمة." },
      { title: "افتح بطاقة الطالب", text: "اضغط اسم الطالب أو زر «فتح بطاقة الطالب». تفتح البطاقة مباشرة داخل نافذة العمل.", action: "📋 فتح بطاقة الطالب", result: "تظهر بياناته وأرصدته وتسجيلاته وفواتيره وسنداته." },
      { title: "سجّل الطالب", text: "اختر الصف والقسط والخصم ورسوم التسجيل إن وجدت. التسجيل هو الذي ينشئ المستحقات.", action: "تسجيل", result: "يبدأ الحساب المالي المرتبط بالتسجيل." },
      { title: "راجع بطاقة الأشهر", text: "راجع كل شهر: المستحق، المدفوع، المتبقي والحالة. الأشهر المستقبلية تبقى متوقعة فقط.", action: "بطاقة الطالب المالية", result: "ترى القديم والجديد بدون خلط الأشهر ببعضها." },
      { title: "اطبع كشف الطالب", text: "من البطاقة اطبع كشفًا يوضح الحساب الحالي والتاريخ المالي.", action: "🖨️ طباعة كشف الطالب", result: "تفتح معاينة الطباعة قبل إرسالها للطابعة أو PDF." },
    ],
    reminders: [
      "المبلغ القديم يبقى مرتبطًا بشهره ولا يتحول إلى جزء من قيمة الشهر الجديد.",
      "أرشفة الطالب لا تحذف سجلاته المالية أو الأكاديمية.",
      "السندات الملغاة تبقى تاريخية للتدقيق ولا تدخل في المقبوض الفعلي.",
    ],
  },
  finance: {
    title: "الفواتير والتحصيل من شاشة واحدة",
    intro: "كل أعمال الفاتورة تتم من نفس الصف: قبض، طباعة الفاتورة، آخر سند وكل السندات.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية للقبض وطباعة السند",
    caption: "الفاتورة تبقى أمامك، والدفعة الجزئية لا تخفي زر القبض حتى يصبح المتبقي صفرًا.",
    steps: [
      { title: "راجع الفاتورة", text: "ابحث باسم الطالب وراجع الإجمالي والمقبوض والمتبقي.", action: "الفواتير والتحصيل", result: "تعرف الرصيد قبل تسجيل أي دفعة." },
      { title: "اختر توزيع الدفعة", text: "إذا على الطالب مبلغ قديم ومبلغ جديد، اختر الأشهر وعدّل مبلغ كل شهر يدويًا أو استخدم الأقدم أولًا.", action: "قبض ← الأقدم أولًا / مبالغ يدوية", result: "كل جزء من الدفعة يرتبط بشهره الحقيقي." },
      { title: "راجع التوزيع", text: "مثال: 150$ يمكن أن تكون 50$ متأخر شهر سابق + 100$ من الشهر الحالي. لا يسمح النظام بتجاوز المتبقي لأي بند.", action: "معاينة التوزيع", result: "لا تختلط الحسابات أو الأشهر." },
      { title: "اطبع السند", text: "السند الواحد يوضح إجمالي الدفعة وتوزيعها على الأشهر ويمكن إعادة طباعته لاحقًا.", action: "🖨️ آخر سند / كل السندات", result: "يبقى تاريخ القبض واضحًا." },
      { title: "اطبع الفاتورة قبل الدفع", text: "طباعة الفاتورة لا تعتمد على وجود سند قبض.", action: "🖨️ طباعة الفاتورة", result: "تظهر قيمة المستحق والمقبوض والمتبقي." },
    ],
    reminders: [
      "دفعة الطالب هي مبلغ على الطالب للمركز.",
      "لا تسجل سند قبض الطالب مرة ثانية في المداخيل حتى لا يتكرر الإيراد.",
      "إلغاء السند يعيد كل جزء إلى شهره الأصلي ويحفظ أثر الإلغاء.",
    ],
  },
  payroll: {
    title: "بطاقة الموظف ودفع المستحقات القديمة والجديدة",
    intro: "إذا بقي راتب غير مدفوع فهو حق للموظف على المركز. كل شهر يبقى مستقلًا محاسبيًا.",
    image: "/help/04-payroll-flow.svg",
    imageAlt: "صورة توضيحية لدفع الرواتب والسلف",
    caption: "الموظف له رصيد على المركز؛ المتأخر القديم يظهر منفصلًا عن راتب الشهر الحالي.",
    steps: [
      { title: "افتح بطاقة الموظف", text: "من صف الموظف افتح البطاقة لرؤية الراتب الأساسي، السلف، المدفوع والمتبقي له عبر الأشهر.", action: "📋 بطاقة الموظف", result: "تظهر صورة مالية كاملة للموظف." },
      { title: "راجع المتأخرات", text: "إذا بقي له 50$ من شهر سابق ثم تولد راتب 400$، يظهر 50$ متأخر + 400$ حالي وليس راتبًا واحدًا 450$.", action: "بطاقة الموظف", result: "كل شهر يحافظ على صافي راتبه الأصلي." },
      { title: "وزّع دفعة الراتب", text: "حدد الأشهر والمبالغ يدويًا أو استخدم الأقدم أولًا. مثال: دفع 150$ = 50$ للقديم + 100$ للحالي.", action: "دفع / تسوية", result: "السداد يذهب إلى الأشهر المختارة فقط." },
      { title: "راجع سند الصرف", text: "السند يوضح إجمالي الدفعة وتوزيعها على الأشهر، ويمكن إعادة طباعته أو إلغاؤه تاريخيًا.", action: "آخر سند / كل السندات", result: "حقوق الموظف تبقى قابلة للتدقيق." },
      { title: "راجع السلف والحسميات", text: "السلف والحسميات تبقى مكونات مستقلة من كشف الراتب ولا تُسجل كمصروف مكرر.", action: "بطاقة الموظف", result: "لا تتكرر تكلفة الراتب." },
    ],
    reminders: [
      "رصيد الموظف المتبقي هو حق له على المركز، بعكس الطالب.",
      "لا تغيّر قيمة راتب الشهر الجديد لإضافة متأخر شهر قديم؛ اعرضهما منفصلين.",
      "إلغاء دفعة موزعة يعيد كل جزء إلى كشف الشهر الذي خُصم منه.",
    ],
  },
  reports: {
    title: "التقارير والطباعة على الويب والموبايل",
    intro: "الطباعة في Web/Lovable تستخدم معاينة ثابتة أولاً بدل إرسال صفحة مخفية مباشرة إلى خدمة الطباعة.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية لمسار المستند المالي إلى الطباعة",
    caption: "اضغط طباعة ← راجع المعاينة ← اضغط «طباعة / حفظ PDF» داخل المعاينة.",
    steps: [
      { title: "جهّز التقرير", text: "اختر نوع التقرير والفترة والفلاتر وتأكد أن البيانات ظاهرة.", action: "التقارير", result: "يصبح التقرير جاهزًا للطباعة." },
      { title: "افتح المعاينة", text: "اضغط الطباعة. تفتح نافذة تحتوي المستند نفسه بدل صفحة بيضاء.", action: "🖨️ طباعة", result: "ترى محتوى التقرير قبل الطباعة." },
      { title: "اطبع أو احفظ PDF", text: "من أعلى المعاينة اضغط «طباعة / حفظ PDF». على Android اختر Save as PDF أو طابعة متاحة.", action: "طباعة / حفظ PDF", result: "يفتح حوار الطباعة الخاص بالنظام." },
      { title: "إذا منع المتصفح النافذة", text: "اسمح بالنوافذ المنبثقة لموقع Lovable ثم أعد المحاولة.", action: "السماح بالنوافذ المنبثقة", result: "تفتح المعاينة بصورة مستقرة." },
    ],
    reminders: [
      "ظهور المعاينة بالمحتوى الصحيح هو أول فحص قبل اختيار الطابعة.",
      "Save as PDF يعتمد على خدمة الطباعة في الهاتف.",
      "إذا كان التقرير بلا بيانات تظهر رسالة واضحة بدل صفحة فارغة غير مفهومة.",
    ],
  },
  admin: {
    title: "المستخدمون والتدقيق والنسخ الاحتياطي المحمي",
    intro: "الحماية تعتمد على صلاحيات صحيحة، سجل تدقيق، كلمات مرور قوية ونسخ احتياطية قابلة للاستعادة حتى على جهاز جديد.",
    image: "/help/05-admin-backup.svg",
    imageAlt: "صورة توضيحية للمستخدمين وسجل التدقيق والنسخ الاحتياطي المحمي",
    caption: "Windows: النسخة اليدوية .ahbackup محمولة بكلمة حماية، والنسخة اليومية مشفرة تلقائيًا للاستعادة المحلية على نفس الجهاز.",
    steps: [
      { title: "استخدم حسابًا لكل شخص", text: "لا تشارك حساب المالك. أعطِ المحاسب والسكرتير والمدير الحساب والدور المناسب.", action: "المستخدمون", result: "يمكن معرفة من نفذ كل عملية." },
      { title: "راجع سجل التدقيق", text: "عند أي فرق أو إلغاء راجع سجل التدقيق لمعرفة العملية والمستخدم والوقت.", action: "سجل التدقيق", result: "تستطيع تتبع العمليات الحساسة." },
      { title: "أنشئ نسخة Windows مشفرة", text: "أدخل كلمة حماية من 10 أحرف على الأقل وأكدها. البرنامج ينشئ ملف .ahbackup مشفرًا بـAES-256-GCM ومفتاح مشتق من كلمة الحماية.", action: "النسخ الاحتياطي ← تنزيل نسخة", result: "الملف لا يحتوي قاعدة SQLite قابلة للقراءة مباشرة." },
      { title: "انقل النسخة بأمان", text: "يمكن نسخ ملف .ahbackup إلى USB أو جهاز جديد. لا تحتاج الجهاز القديم، لكن تحتاج كلمة الحماية نفسها.", action: "حفظ خارجي", result: "تبقى النسخة Portable وقابلة للاستعادة بعد تعطل الجهاز." },
      { title: "استعد النسخة", text: "للنسخة اليدوية أدخل كلمة الحماية واختر ملف .ahbackup. وللنسخة اليومية المحلية استخدم «استعادة آخر نسخة تلقائية محلية» بدون معرفة المفتاح الداخلي.", action: "اختيار ملف واستعادة / آخر نسخة تلقائية", result: "تعود البيانات بعد اجتياز فحوص السلامة." },
      { title: "النسخ القديمة", text: "نسخ .sqlite و.db القديمة تبقى قابلة للاستعادة للتوافق، لكن النسخ اليدوية الجديدة يجب أن تكون .ahbackup المشفرة.", action: "استعادة نسخة قديمة عند الحاجة", result: "لا تفقد تاريخ النسخ السابقة أثناء الانتقال للنظام المحمي." },
    ],
    reminders: [
      "لا يمكن تعطيل آخر مالك في النظام.",
      "لا يوجد زر لاسترجاع كلمة حماية .ahbackup: إذا ضاعت الكلمة لا يمكن فك النسخة المشفرة.",
      "قاعدة SQLite الحية داخل Desktop ما زالت تحتاج تشفير at-rest حقيقي قبل إصدار EXE النهائي؛ النسخ اليدوية واليومية أصبحت مشفرة، واليومية تُستعاد من نفس جهاز Windows، لكن ملف قاعدة العمل الحي نفسه ليس SQLCipher بعد.",
      "تحديث دليل الاستخدام وصوره جزء إلزامي من Checklist كل باتش كبير.",
    ],
  },
};

function StepCard({ step, index }: { step: GuideStep; index: number }) {
  return (
    <li className="relative rounded-xl border bg-card p-4 pr-14">
      <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
      <p className="font-bold">{step.title}</p>
      <p className="mt-1.5 leading-6 text-muted-foreground">{step.text}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {step.action ? <span className="rounded-md bg-primary/10 px-2.5 py-1 font-bold text-primary">اضغط: {step.action}</span> : null}
        {step.result ? <span className="rounded-md bg-success/10 px-2.5 py-1 font-semibold text-success">النتيجة: {step.result}</span> : null}
      </div>
    </li>
  );
}

export function HelpGuide() {
  const [active, setActive] = useState<GuideTab>("start");
  const section = GUIDE[active];

  return (
    <div className="space-y-5 text-sm" dir="rtl">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-bold text-primary">دليل مصوّر للعمل على Academy Hub</p>
          <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">آخر تحديث: 15 / 9 / 2026</span>
        </div>
        <p className="mt-1 max-w-4xl leading-6 text-muted-foreground">كل قسم يشرح المسار الصحيح خطوة بخطوة ومعه صورة توضيحية. أي تعديل تشغيلي كبير يجب أن يحدّث هذا الدليل والصورة المرتبطة به قبل إغلاق الباتش.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border bg-muted/30 p-2" role="tablist" aria-label="أقسام دليل الاستخدام">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors md:text-sm", active === tab.id ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary")}>
            <span className="ml-1">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      <section role="tabpanel" className="space-y-5">
        <div><h3 className="text-xl font-bold">{section.title}</h3><p className="mt-1 leading-6 text-muted-foreground">{section.intro}</p></div>
        <figure className="overflow-hidden rounded-2xl border bg-white">
          <img src={section.image} alt={section.imageAlt} className="block h-auto w-full" loading="lazy" />
          <figcaption className="border-t bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">{section.caption}</figcaption>
        </figure>
        <ol className="grid gap-3 md:grid-cols-2">{section.steps.map((step, index) => <StepCard key={step.title} step={step} index={index} />)}</ol>
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="font-bold">⚠️ انتبه قبل المتابعة</p>
          <ul className="mt-2 space-y-2 text-muted-foreground">{section.reminders.map((reminder) => <li key={reminder} className="flex gap-2 leading-6"><span className="font-bold text-warning">●</span><span>{reminder}</span></li>)}</ul>
        </div>
      </section>

      <div className="rounded-xl border bg-muted/30 p-4 text-center text-xs leading-6 text-muted-foreground">عند الشك لا تكرر العملية المالية. افتح بطاقة الطالب أو الموظف وسجل التدقيق أولًا، ثم قرر الإجراء الصحيح.</div>
    </div>
  );
}

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
      { title: "أنشئ نسخة احتياطية", text: "بعد التأكد من الإعدادات والبيانات التجريبية أنشئ أول نسخة احتياطية.", action: "النسخ الاحتياطي ← إنشاء نسخة", result: "تصبح لديك نقطة استعادة قبل بدء العمل الحقيقي." },
    ],
    reminders: [
      "لا يوجد حساب افتراضي بكلمة مرور ثابتة.",
      "اختبر دورة مالية كاملة ببيانات تجريبية قبل إدخال بيانات حقيقية.",
      "احتفظ بنسخة احتياطية خارج الجهاز أيضًا.",
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
      { title: "افتح بطاقة الطالب", text: "اضغط اسم الطالب أو زر «فتح بطاقة الطالب». تفتح البطاقة مباشرة بدون مغادرة شاشة العمل إلى صفحة فارغة.", action: "📋 فتح بطاقة الطالب", result: "تظهر بياناته وأرصدته وتسجيلاته وفواتيره وسنداته." },
      { title: "سجّل الطالب", text: "اختر الصف والقسط والخصم ورسوم التسجيل إن وجدت. التسجيل هو الذي ينشئ المستحقات.", action: "تسجيل", result: "يبدأ الحساب المالي المرتبط بالتسجيل." },
      { title: "راجع بطاقة الأشهر", text: "داخل بطاقة الطالب راجع كل شهر: المستحق، المدفوع، المتبقي والحالة. الأشهر المستقبلية تبقى متوقعة فقط.", action: "بطاقة الطالب المالية", result: "ترى القديم والجديد بدون خلط الأشهر ببعضها." },
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
    intro: "كل أعمال الفاتورة تتم من نفس الصف: قبض، طباعة الفاتورة، آخر سند وكل السندات. لا توجد شاشة منفصلة اسمها سجل القبض.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية للقبض وطباعة السند",
    caption: "الفاتورة تبقى أمامك، والدفعة الجزئية لا تخفي زر القبض حتى يصبح المتبقي صفرًا.",
    steps: [
      { title: "راجع الفاتورة", text: "ابحث باسم الطالب وراجع الإجمالي والمقبوض والمتبقي.", action: "الفواتير والتحصيل", result: "تعرف الرصيد قبل تسجيل أي دفعة." },
      { title: "اختر توزيع الدفعة", text: "إذا على الطالب مبلغ قديم ومبلغ جديد، تستطيع اختيار الأشهر وتعديل مبلغ كل شهر يدويًا أو استخدام التوزيع بالأقدم أولًا.", action: "قبض ← الأقدم أولًا / مبالغ يدوية", result: "كل جزء من الدفعة يرتبط بشهره الحقيقي." },
      { title: "راجع التوزيع قبل الحفظ", text: "مثال: دفعة 150$ يمكن أن تكون 50$ متأخر شهر سابق + 100$ من الشهر الحالي. لا يسمح النظام بتجاوز المتبقي لأي بند.", action: "معاينة التوزيع", result: "لا تختلط الحسابات أو الأشهر." },
      { title: "اطبع السند", text: "السند الواحد يوضح إجمالي الدفعة وتوزيعها على الأشهر. ويمكن إعادة طباعته لاحقًا.", action: "🖨️ آخر سند / كل السندات", result: "يبقى تاريخ القبض واضحًا للطالب والمحاسبة." },
      { title: "اطبع الفاتورة حتى قبل الدفع", text: "طباعة الفاتورة لا تعتمد على وجود سند قبض؛ تستطيع طباعة المستحق قبل أي دفعة.", action: "🖨️ طباعة الفاتورة", result: "تحصل على فاتورة توضح المستحق والمقبوض والمتبقي." },
    ],
    reminders: [
      "دفعة الطالب هي مبلغ على الطالب للمركز، وليست مصروفًا أو راتبًا.",
      "لا تسجل سند قبض الطالب مرة ثانية في المداخيل حتى لا يتكرر الإيراد.",
      "إلغاء السند يعيد كل جزء إلى شهره الأصلي ويحفظ أثر الإلغاء.",
    ],
  },
  payroll: {
    title: "بطاقة الموظف ودفع المستحقات القديمة والجديدة",
    intro: "الرصيد هنا بالعكس: إذا بقي راتب غير مدفوع فهو حق للموظف على المركز. كل شهر يبقى مستقلًا محاسبيًا.",
    image: "/help/04-payroll-flow.svg",
    imageAlt: "صورة توضيحية لدفع الرواتب والسلف",
    caption: "الموظف له رصيد على المركز؛ المتأخر القديم يظهر منفصلًا عن راتب الشهر الحالي.",
    steps: [
      { title: "افتح بطاقة الموظف", text: "من صف الموظف افتح البطاقة لرؤية الراتب الأساسي، السلف، المدفوع والمتبقي له عبر الأشهر.", action: "📋 بطاقة الموظف", result: "تظهر صورة مالية كاملة للموظف." },
      { title: "راجع المتأخرات", text: "إذا بقي للموظف 50$ من شهر سابق ثم تولد راتب جديد 400$، يظهر 50$ متأخر + 400$ حالي، وليس راتبًا جديدًا بقيمة 450$.", action: "بطاقة الموظف", result: "كل شهر يحافظ على صافي راتبه الأصلي." },
      { title: "وزّع دفعة الراتب", text: "عند دفع 150$ مثلًا يمكن توزيع 50$ على الشهر السابق و100$ على الشهر الحالي، يدويًا أو بالأقدم أولًا.", action: "دفع مستحقات", result: "سند واحد وتوزيعات شهرية دقيقة." },
      { title: "راجع السند", text: "سند الصرف يوضح الأشهر التي شملتها الدفعة ومبلغ كل شهر، ويمكن إعادة طباعته أو إلغاؤه مع سبب.", action: "🖨️ طباعة السند", result: "يبقى حق الموظف وتاريخ الدفع قابلين للتدقيق." },
      { title: "تعامل مع السلفة منفصلة", text: "السلفة تُسجل كسلفة وتسوّى في الراتب حسب قواعد النظام؛ لا تسجل الراتب مرة ثانية كمصروف يدوي.", action: "سلفة", result: "لا تتكرر تكلفة الرواتب في الحسابات." },
    ],
    reminders: [
      "المتبقي في الرواتب هو مبلغ للموظف على المركز.",
      "إلغاء سند موزع يعيد مبالغ كل شهر إلى رصيده الأصلي.",
      "الأشهر المستقبلية في البطاقة متوقعة فقط وليست دينًا فعليًا حتى يتولد كشفها.",
    ],
  },
  reports: {
    title: "التقارير والطباعة على الويب والموبايل",
    intro: "الطباعة في Web/Lovable تستخدم معاينة ثابتة أولاً. لا يتم إرسال صفحة مخفية مباشرة إلى خدمة طباعة الهاتف.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية لمسار المستند المالي إلى الطباعة",
    caption: "اضغط طباعة في البرنامج ← راجع المعاينة ← اضغط «طباعة / حفظ PDF» داخل المعاينة.",
    steps: [
      { title: "جهّز التقرير", text: "اختر نوع التقرير والفترة والفلاتر وتأكد أن البيانات ظاهرة على الشاشة.", action: "التقارير", result: "يصبح التقرير جاهزًا للطباعة." },
      { title: "افتح معاينة الطباعة", text: "اضغط زر الطباعة. تفتح نافذة تحتوي المستند نفسه بدل صفحة بيضاء أو iframe مخفي.", action: "🖨️ طباعة", result: "ترى محتوى التقرير قبل إرسال أي أمر للطابعة." },
      { title: "اطبع أو احفظ PDF", text: "من أعلى المعاينة اضغط «طباعة / حفظ PDF». على Android اختر Save as PDF إذا أردت ملفًا، أو اختر طابعة متاحة.", action: "طباعة / حفظ PDF", result: "يفتح حوار الطباعة الخاص بالنظام من ضغطة مباشرة." },
      { title: "إذا منع المتصفح النافذة", text: "اسمح بالنوافذ المنبثقة لموقع Lovable ثم أعد الضغط على الطباعة. البرنامج يعرض رسالة واضحة إذا تم منع المعاينة.", action: "السماح بالنوافذ المنبثقة", result: "تفتح المعاينة بصورة مستقرة." },
    ],
    reminders: [
      "ظهور المعاينة بالمحتوى الصحيح هو أول فحص قبل اختيار الطابعة.",
      "Save as PDF يعتمد على خدمة الطباعة في الهاتف، لذلك اختره من حوار النظام بعد فتح المعاينة.",
      "إذا كان التقرير بلا بيانات ستظهر رسالة «لا توجد بيانات مطابقة» بدل صفحة فارغة غير مفهومة.",
    ],
  },
  admin: {
    title: "المستخدمون والتدقيق والنسخ الاحتياطي",
    intro: "الحماية تعتمد على صلاحيات صحيحة، سجل تدقيق، كلمة مرور قوية ونسخ احتياطية منتظمة.",
    image: "/help/05-admin-backup.svg",
    imageAlt: "صورة توضيحية للمستخدمين وسجل التدقيق والنسخ الاحتياطي",
    caption: "صلاحيات + سجل تدقيق + Backup منتظم = حماية تشغيلية أفضل.",
    steps: [
      { title: "استخدم حسابًا لكل شخص", text: "لا تشارك حساب المالك. أعطِ المحاسب والسكرتير والمدير الحساب والدور المناسب.", action: "المستخدمون", result: "يمكن معرفة من نفذ كل عملية." },
      { title: "راجع سجل التدقيق", text: "عند أي فرق أو إلغاء راجع سجل التدقيق لمعرفة العملية والمستخدم والوقت.", action: "سجل التدقيق", result: "تستطيع تتبع العمليات الحساسة." },
      { title: "أنشئ نسخًا احتياطية", text: "احتفظ بنسخة يومية/دورية ونسخة أخرى خارج الجهاز.", action: "النسخ الاحتياطي", result: "يمكن استعادة البيانات عند مشكلة بالجهاز." },
      { title: "اختبر الاستعادة", text: "اختبر الاستعادة على بيانات تجريبية قبل التسليم النهائي، وتأكد من الطلاب والفواتير والسندات والرواتب.", action: "استعادة نسخة", result: "تتأكد أن النسخة صالحة فعليًا." },
      { title: "لا تعتمد على دليل قديم", text: "هذا الدليل جزء من الإصدار. أي تغيير كبير يجب أن يتبعه تحديث للشرح والصورة المتعلقة به قبل اعتبار العمل مكتملًا.", action: "❓ كيفية العمل على البرنامج", result: "يبقى المستخدم قادرًا على تنفيذ الميزات الجديدة بدون تخمين." },
    ],
    reminders: [
      "لا يمكن تعطيل آخر مالك في النظام.",
      "قاعدة SQLite في نسخة Desktop ستحتاج تشفير at-rest حقيقي قبل الإصدار النهائي للـEXE.",
      "تحديث دليل الاستخدام وصوره أصبح جزءًا من Checklist كل باتش كبير.",
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
        <p className="mt-1 max-w-4xl leading-6 text-muted-foreground">كل قسم يشرح المسار الصحيح خطوة بخطوة ومعه صورة توضيحية. من الآن أي تعديل تشغيلي كبير يجب أن يحدّث هذا الدليل والصورة المرتبطة به قبل إغلاق الباتش.</p>
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

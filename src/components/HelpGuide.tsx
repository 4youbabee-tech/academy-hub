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
    intro: "عند قاعدة بيانات جديدة ينشئ المدير الرئيسي حسابه بنفسه، وبعدها يضيف العمال ويحدد صلاحيات كل واحد منهم.",
    image: "/help/01-first-start.svg",
    imageAlt: "صورة توضيحية لإعداد البرنامج لأول مرة",
    caption: "إنشاء المدير الرئيسي ← إعداد المركز ← إضافة العمال والصلاحيات ← نسخة احتياطية.",
    steps: [
      { title: "أنشئ المدير الرئيسي", text: "أدخل الاسم واسم المستخدم وكلمة مرور قوية. المدير الرئيسي يملك كل الصلاحيات تلقائيًا.", action: "إنشاء حساب المدير الرئيسي", result: "يصبح لديك حساب الإدارة الكامل." },
      { title: "أدخل بيانات المركز", text: "اضبط اسم المركز والعملـة والهاتف والعنوان والشعار.", action: "الإعدادات ← حفظ", result: "تستخدم البيانات في الشاشات والمطبوعات." },
      { title: "أضف العمال", text: "أنشئ حسابًا مستقلاً لكل عامل ثم فعّل فقط الصلاحيات التي يحتاجها.", action: "المستخدمون والصلاحيات", result: "كل عامل يرى الصفحات والأزرار المسموح بها فقط." },
      { title: "اختبر دورة عمل", text: "أضف طالبًا، سجله، ولّد استحقاقًا، وسجل دفعة تجريبية قبل بدء العمل الحقيقي.", action: "الطلاب ← التسجيل ← الفواتير والتحصيل", result: "تتأكد أن الحسابات والمطبوعات صحيحة." },
      { title: "أنشئ Backup", text: "أنشئ نسخة احتياطية بعد ضبط الإعدادات وقبل إدخال البيانات الحقيقية.", action: "النسخ الاحتياطي", result: "يصبح لديك مسار استعادة آمن." },
    ],
    reminders: [
      "لا يوجد حساب افتراضي بكلمة مرور ثابتة.",
      "المدير الرئيسي يملك جميع الصلاحيات، والعامل يأخذ فقط ما يحدده المدير.",
      "صلاحيات مثل التقارير ومسح البيانات وإدارة المستخدمين تبقى حساسة ولا تعطى إلا عند الحاجة.",
    ],
  },
  academic: {
    title: "تسجيل الطالب والاستحقاق الشهري",
    intro: "التسجيل الشهري يعتمد على قيمة القسط والخصم وشهر بداية الاستحقاق. لا يوجد حقل رسوم تسجيل لمرة واحدة في التسجيل الجديد.",
    image: "/help/02-academic-flow.svg",
    imageAlt: "صورة توضيحية لتدفق الطالب والتسجيل والفاتورة",
    caption: "طالب ← صف ← قيمة القسط والخصم ← شهر البداية ← استحقاق شهري.",
    steps: [
      { title: "أضف الطالب", text: "أدخل بيانات الطالب الأساسية واحفظه.", action: "الطلاب والتسجيل ← طالب جديد", result: "يظهر الطالب في القائمة." },
      { title: "اختر الصف", text: "من تسجيل الطالب اختر العام الدراسي والصف الجاري.", action: "تسجيل الطالب", result: "يرتبط الطالب بالصف الصحيح." },
      { title: "حدد القسط", text: "أدخل القسط الشهري الأساسي ثم اختر خصمًا جاهزًا أو أدخل خصمًا يدويًا عند الحاجة.", action: "القسط الشهري + الخصم", result: "يظهر القسط الشهري بعد الخصم بوضوح." },
      { title: "حدد شهر البداية", text: "اختر الشهر والسنة التي يبدأ منها توليد الاستحقاق الشهري.", action: "الشهر / السنة", result: "لا تتحول الأشهر المستقبلية إلى دين فعلي قبل دخولها وتوليدها." },
      { title: "راجع بطاقة الطالب", text: "تابع المستحق والمدفوع والمتبقي لكل شهر من بطاقة الطالب.", action: "فتح بطاقة الطالب", result: "يبقى كل شهر مستقلًا ماليًا." },
    ],
    reminders: [
      "لا يوجد رسوم تسجيل لمرة واحدة في التسجيل الشهري الجديد.",
      "الخصم الجاهز أو اليدوي يطبق على القسط الشهري.",
      "الأشهر القديمة والجديدة لا تدمج في رقم واحد؛ كل شهر يحافظ على رصيده.",
    ],
  },
  finance: {
    title: "قبض الطالب حسب الأشهر",
    intro: "واجهة القبض موحدة وبسيطة: Checkbox ومبلغ قابل للتعديل في نفس سطر كل شهر، بدون زر توزيع بالأقدم أولًا.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية لقبض الطالب حسب الأشهر",
    caption: "علّم الشهر ← يتعبأ كامل المتبقي تلقائيًا ← عدّل نفس المبلغ إذا كانت الدفعة جزئية.",
    steps: [
      { title: "افتح الفاتورة", text: "من الفواتير والتحصيل اضغط قبض على الفاتورة المطلوبة.", action: "قبض", result: "تظهر الأشهر التي عليها رصيد." },
      { title: "اختر الشهر", text: "ضع علامة ✓ بجانب الشهر المطلوب. النظام يضع كامل المتبقي لذلك الشهر تلقائيًا في خانة المبلغ الموجودة بنفس السطر.", action: "✓ الشهر", result: "يصبح المبلغ جاهزًا للتسجيل." },
      { title: "عدّل الدفعة الجزئية", text: "إذا كنت تريد دفع جزء فقط، غيّر مبلغ نفس السطر إلى القيمة المطلوبة. لا توجد خانة مبلغ ثانية ولا توزيع تلقائي منفصل.", action: "تعديل المبلغ في نفس السطر", result: "يبقى باقي المبلغ على نفس الشهر." },
      { title: "اختر أكثر من شهر", text: "يمكن تحديد أكثر من شهر، ويظهر إجمالي الدفعة والمتبقي المتوقع قبل الحفظ.", action: "✓ أكثر من شهر", result: "كل جزء من الدفعة يبقى مربوطًا بشهره." },
      { title: "اطبع السند", text: "بعد تسجيل القبض يمكنك طباعة السند أو إعادة طباعته لاحقًا من سجل السندات.", action: "🖨️ طباعة السند", result: "يبقى تاريخ القبض واضحًا وقابلًا للتدقيق." },
    ],
    reminders: [
      "لا يوجد زر «توزيع بالأقدم أولًا» في واجهة القبض الجديدة.",
      "لا يمكن أن يتجاوز مبلغ الشهر الرصيد المتبقي لذلك الشهر.",
      "إلغاء السند يعيد المبالغ إلى الأشهر الأصلية المرتبطة بها.",
    ],
  },
  payroll: {
    title: "دفع مستحقات الموظف حسب الأشهر",
    intro: "نفس فكرة قبض الطلاب: Checkbox ومبلغ يدوي في نفس سطر الشهر، بدون خانة دفعة منفصلة وبدون توزيع بالأقدم.",
    image: "/help/04-payroll-flow.svg",
    imageAlt: "صورة توضيحية لدفع الرواتب حسب الأشهر",
    caption: "✓ الشهر + مبلغ نفس السطر. علّم الشهر للدفع الكامل أو عدّل المبلغ للدفع الجزئي.",
    steps: [
      { title: "افتح بطاقة الموظف", text: "راجع الراتب والمدفوع والمتبقي لكل شهر قبل تسجيل الدفعة.", action: "📋 بطاقة الموظف", result: "تظهر المتأخرات كل شهر على حدة." },
      { title: "اختر شهر الراتب", text: "ضع علامة ✓ بجانب الشهر. النظام يضع كامل المتبقي في خانة المبلغ داخل نفس السطر.", action: "✓ الشهر", result: "تجهز دفعة كامل المتبقي." },
      { title: "سجل دفعة جزئية", text: "عدّل مبلغ نفس السطر إلى القيمة التي تريد دفعها. لا توجد خانة يدوية ثانية منفصلة.", action: "تعديل المبلغ", result: "يبقى باقي الراتب محفوظًا على نفس الشهر." },
      { title: "ادفع عدة أشهر", text: "يمكن اختيار أكثر من شهر وتحديد مبلغ مختلف لكل واحد منها قبل التسجيل.", action: "✓ عدة أشهر", result: "كل مبلغ يرتبط بكشف شهره الصحيح." },
      { title: "راجع سند الصرف", text: "بعد الحفظ اطبع السند أو أعد طباعته لاحقًا، وإلغاء السند يعيد كل مبلغ إلى شهره الأصلي.", action: "🖨️ سند الصرف", result: "تبقى حسابات الموظف قابلة للتدقيق." },
    ],
    reminders: [
      "رصيد الموظف المتبقي هو حق له على المركز.",
      "الـ Checkbox والمبلغ اليدوي موجودان معًا في نفس السطر.",
      "لا تغيّر قيمة راتب شهر جديد لإضافة متأخر شهر سابق؛ اترك كل شهر مستقلًا.",
    ],
  },
  reports: {
    title: "التقارير والطباعة",
    intro: "الطباعة في Web/Lovable تعرض معاينة واضحة أولًا، ثم يضغط المستخدم طباعة أو حفظ PDF من داخل المعاينة.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية لمسار المستند المالي إلى الطباعة",
    caption: "جهّز البيانات ← افتح المعاينة ← طباعة / حفظ PDF.",
    steps: [
      { title: "حدد التقرير", text: "اختر الفترة والفلاتر المطلوبة وتأكد أن البيانات ظاهرة.", action: "التقارير", result: "يصبح التقرير جاهزًا." },
      { title: "افتح المعاينة", text: "اضغط زر الطباعة لرؤية المستند قبل إرساله للطابعة.", action: "🖨️ طباعة", result: "تظهر معاينة ثابتة بالمحتوى." },
      { title: "اطبع أو احفظ PDF", text: "من المعاينة اضغط «طباعة / حفظ PDF» واختر الطابعة أو Save as PDF من النظام.", action: "طباعة / حفظ PDF", result: "يتم التسليم لنظام الطباعة على الجهاز." },
    ],
    reminders: [
      "العامل لا يرى التقارير إذا لم يمنحه المدير صلاحية التقارير.",
      "على الهاتف قد تحتاج للسماح بالنوافذ المنبثقة لموقع البرنامج.",
    ],
  },
  admin: {
    title: "الإعدادات والصلاحيات والحماية",
    intro: "المدير الرئيسي يملك كل الصلاحيات. العمال يحصلون على صلاحيات محددة، والإعدادات الحساسة تبقى تحت سيطرة الإدارة.",
    image: "/help/06-user-permissions.svg",
    imageAlt: "صورة توضيحية للمدير الرئيسي وصلاحيات العامل",
    caption: "مدير كامل الصلاحيات + عامل بصلاحيات مختارة + عمليات حساسة محمية.",
    steps: [
      { title: "حدد صلاحيات العامل", text: "من شاشة المستخدمين فعّل فقط الصفحات والعمليات التي يحتاجها كل عامل.", action: "المستخدمون والصلاحيات", result: "تختفي عنه الصفحات غير المسموحة." },
      { title: "احذف الخصومات الجاهزة", text: "في الإعدادات يوجد زر حذف بدل تفعيل/تعطيل. عند الضغط يظهر سؤال تأكيد قبل إزالة الخصم من الاختيارات الجديدة.", action: "الإعدادات ← الخصومات الجاهزة ← حذف", result: "لا يظهر الخصم المحذوف في التسجيلات الجديدة، بينما تبقى بيانات التسجيلات السابقة محفوظة." },
      { title: "مسح بيانات التشغيل", text: "المدير يملك الصلاحية دائمًا ويمكن تفويض عامل محدد بها. العملية محمية بتأكيدين ونسخة أمان قبل التنفيذ.", action: "الإعدادات ← مسح بيانات التشغيل", result: "تمسح بيانات التشغيل وتبقى الحسابات والإعدادات وسجل التدقيق." },
      { title: "راجع سجل التدقيق", text: "استخدم سجل التدقيق لمعرفة المستخدم الذي نفذ العملية ووقتها، خصوصًا للعمليات المالية والحساسة.", action: "سجل التدقيق", result: "يمكن تتبع التغييرات المهمة." },
      { title: "استخدم النسخ الاحتياطية", text: "أنشئ نسخًا دورية قبل التعديلات الكبيرة وقبل مسح بيانات التشغيل.", action: "النسخ الاحتياطي", result: "يمكن الرجوع إلى نسخة سابقة عند الحاجة." },
    ],
    reminders: [
      "حذف الخصم الجاهز لا يمسح الخصم التاريخي المحفوظ على تسجيل سابق.",
      "لا تمنح صلاحية مسح البيانات أو الاستعادة إلا لمستخدم موثوق.",
      "قاعدة SQLite الحية في Desktop ما زالت غير مشفرة بـ SQLCipher؛ النسخ الاحتياطية المحمية لا تعني أن ملف قاعدة العمل الحي مشفر at-rest.",
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
          <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">آخر تحديث: 17 / 9 / 2026</span>
        </div>
        <p className="mt-1 max-w-4xl leading-6 text-muted-foreground">كل قسم يشرح المسار الحالي خطوة بخطوة ومعه صورة توضيحية محدثة.</p>
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

      <div className="rounded-xl border bg-muted/30 p-4 text-center text-xs leading-6 text-muted-foreground">عند الشك لا تكرر العملية المالية. افتح بطاقة الطالب أو الموظف وسجل التدقيق أولًا، ثم نفّذ الإجراء الصحيح.</div>
    </div>
  );
}

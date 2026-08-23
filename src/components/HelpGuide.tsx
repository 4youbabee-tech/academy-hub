import { useState } from "react";
import { cn } from "@/lib/utils";

type GuideTab = "start" | "academic" | "finance" | "payroll" | "admin";

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
  { id: "academic", label: "الأكاديمي", icon: "🎓" },
  { id: "finance", label: "المالية", icon: "💰" },
  { id: "payroll", label: "الموظفون والرواتب", icon: "👥" },
  { id: "admin", label: "الإدارة والحماية", icon: "⚙️" },
];

const GUIDE: Record<GuideTab, GuideSection> = {
  start: {
    title: "تشغيل البرنامج لأول مرة",
    intro: "اتبع هذه الخطوات بالترتيب مرة واحدة قبل بدء العمل الحقيقي في المعهد.",
    image: "/help/01-first-start.svg",
    imageAlt: "صورة توضيحية لإعداد البرنامج أول مرة",
    caption: "المسار الأول: تسجيل الدخول ← إعدادات المعهد ← المستخدمون ← نسخة احتياطية.",
    steps: [
      {
        title: "سجّل الدخول بالحساب الأول",
        text: "عند أول تشغيل استخدم owner و owner123، ثم غيّر كلمة المرور مباشرة من شاشة المستخدمين.",
        action: "دخول",
        result: "تفتح لوحة المعلومات ويظهر اسم المستخدم في الأعلى.",
      },
      {
        title: "أدخل بيانات المعهد",
        text: "افتح الإعدادات وأدخل اسم المعهد، السنة الدراسية، العملة، الهاتف والعنوان، ثم ارفع الشعار.",
        action: "الإعدادات ← حفظ",
        result: "يظهر الاسم والشعار في البرنامج وعلى السندات المطبوعة.",
      },
      {
        title: "أنشئ حسابات العاملين",
        text: "أنشئ حسابًا مستقلًا لكل موظف وحدد دوره. لا تجعل الجميع يستخدم حساب المالك.",
        action: "المستخدمون ← مستخدم جديد",
        result: "كل موظف يرى فقط الشاشات المسموح بها لدوره.",
      },
      {
        title: "جرّب عملية كاملة ببيانات تجريبية",
        text: "أضف دورة وصفًا وطالبًا، سجّل الطالب، ثم أنشئ سند قبض صغيرًا وراجعه في لوحة المعلومات.",
        action: "الدورات ← الصفوف ← الطلاب ← الإيصالات",
        result: "تتأكد أن المستحق والمقبوض والمتبقي متطابقة في كل الشاشات.",
      },
      {
        title: "أنشئ أول نسخة احتياطية",
        text: "بعد التأكد من الإعدادات افتح النسخ الاحتياطي وأنشئ نسخة يدوية واحفظها في مكان آمن.",
        action: "النسخ الاحتياطي ← إنشاء نسخة",
        result: "تصبح لديك نقطة استعادة قبل إدخال بيانات الزبون الحقيقية.",
      },
    ],
    reminders: [
      "غيّر كلمة مرور owner123 قبل التسليم للزبون.",
      "لا تبدأ بإدخال البيانات الحقيقية قبل التأكد من اسم المعهد والعملة والشعار.",
      "احتفظ بنسخة احتياطية خارج الكمبيوتر أيضًا، مثل قرص USB مخصص.",
    ],
  },
  academic: {
    title: "إضافة طالب وتسجيله بطريقة صحيحة",
    intro: "الترتيب الصحيح مهم: دورة، ثم صف، ثم طالب، ثم تسجيل. الفاتورة تُنشأ من التسجيل.",
    image: "/help/02-academic-flow.svg",
    imageAlt: "صورة توضيحية لتدفق الدورة والصف والطالب والتسجيل والفاتورة",
    caption: "لا تُنشئ الفاتورة يدويًا: تسجيل الطالب في الصف هو الذي ينشئ مستحقه.",
    steps: [
      {
        title: "أضف الدورة وسعرها",
        text: "اكتب اسم الدورة والمستوى والسعر الافتراضي. يمكن استخدام السعر لاحقًا عند تسجيل الطالب.",
        action: "الدورات ← دورة جديدة",
        result: "تصبح الدورة جاهزة لربطها بصف.",
      },
      {
        title: "أنشئ صفًا مرتبطًا بالدورة",
        text: "حدد الدورة، اسم الصف، المدرّس، الموعد وتاريخ البداية. بعد وجود تسجيلات لا تغيّر دورة الصف.",
        action: "الصفوف والجداول ← صف جديد",
        result: "يظهر الصف ضمن الدورة ويمكن استقبال الطلاب.",
      },
      {
        title: "أضف الطالب",
        text: "أدخل اسم الطالب وبيانات الاتصال والمستوى. لا حاجة لإضافة حساب مالي يدوي له.",
        action: "الطلاب ← طالب جديد",
        result: "يظهر الطالب في جدول الطلاب ويمكن اختياره عند التسجيل.",
      },
      {
        title: "سجّل الطالب داخل الصف",
        text: "افتح الصف ثم المسجلين، اختر الطالب وحدد السعر والخصم ورسوم التسجيل إن وجدت.",
        action: "الصف ← المسجلون ← تسجيل طالب",
        result: "يُنشأ التسجيل والفاتورة ويظهر المستحق تلقائيًا.",
      },
      {
        title: "راجع ملف الطالب",
        text: "افتح اسم الطالب وتأكد من ظهور التسجيل والفاتورة والمستحق والمقبوض والمتبقي.",
        action: "الطلاب ← اسم الطالب",
        result: "تجد كل تاريخ الطالب الأكاديمي والمالي في مكان واحد.",
      },
    ],
    reminders: [
      "أرشفة الطالب لا تحذف تسجيلاته أو فواتيره أو سنداته.",
      "لا يمكن أرشفة طالب لديه تسجيل نشط؛ أنهِ أو ألغِ التسجيل أولًا.",
      "إذا وُجد سند قبض على التسجيل، يمنع البرنامج التعديل أو الإلغاء الذي يفسد السجل المالي.",
    ],
  },
  finance: {
    title: "قبض دفعة من طالب وطباعتها",
    intro: "شاشة الإيصالات والفواتير هي المركز المالي للطلاب. لا تسجل دفعة الطالب في المداخيل مرة ثانية.",
    image: "/help/03-receipt-flow.svg",
    imageAlt: "صورة توضيحية لإنشاء سند قبض ومراجعة المتبقي",
    caption: "اختر الفاتورة، اكتب مبلغ هذه الدفعة والبيان، ثم احفظ واطبع السند A5.",
    steps: [
      {
        title: "ابحث عن فاتورة الطالب",
        text: "افتح الإيصالات والفواتير وابحث باسم الطالب، ثم راجع المستحق والمقبوض والمتبقي.",
        action: "الإيصالات والفواتير",
        result: "تعرف الرصيد الحقيقي قبل تسجيل أي مبلغ.",
      },
      {
        title: "أنشئ سند قبض",
        text: "اختر الفاتورة وأدخل مبلغ الدفعة وطريقة الدفع وبيانًا واضحًا مثل: دفعة أولى أو رسوم تسجيل.",
        action: "سند قبض جديد",
        result: "يُسجل المبلغ مرة واحدة ويُخصم من المتبقي.",
      },
      {
        title: "راجع الأرقام قبل الحفظ",
        text: "لا يمكن أن يكون المبلغ أكبر من المتبقي. تأكد من مبلغ هذا السند قبل الضغط على الحفظ.",
        action: "حفظ السند",
        result: "تتحدث الفاتورة وملف الطالب ولوحة المعلومات والتقارير تلقائيًا.",
      },
      {
        title: "اطبع سند A5",
        text: "بعد الحفظ افتح السند واضغط طباعة. يظهر مبلغ السند والمقبوض حتى تاريخه والمتبقي بعده.",
        action: "طباعة السند",
        result: "يحصل الطالب على سند واضح يحمل الشعار ورقم الإيصال.",
      },
      {
        title: "عند الخطأ ألغِ السند ولا تحذفه",
        text: "الإلغاء يعيد الرصيد ويحفظ السند كملغى للتدقيق، لكنه لا يدخل في المقبوضات أو التقارير.",
        action: "إلغاء السند",
        result: "يبقى التاريخ محفوظًا بدون إعطاء أرقام مالية خاطئة.",
      },
    ],
    reminders: [
      "دفعات الطلاب لا تُسجل في شاشة المداخيل؛ سند القبض هو المصدر الحقيقي.",
      "الفاتورة أو السند الملغى لا يدخل في الإجماليات.",
      "المصروف اليدوي يُلغى من شاشة المصاريف بعد التأكيد ولا يُحذف.",
    ],
  },
  payroll: {
    title: "إدارة الموظف والسلفة ودفع الراتب",
    intro: "أضف الموظف وراتبه الأساسي أولًا، ثم سجل السلف، وبعدها ادفع راتب الشهر مع التأكيد.",
    image: "/help/04-payroll-flow.svg",
    imageAlt: "صورة توضيحية لإضافة موظف ودفع الراتب وطباعة السند",
    caption: "السلفة تقلل ما يُدفع آخر الشهر، لكنها لا تقلل تكلفة الراتب الحقيقية على المعهد.",
    steps: [
      {
        title: "أضف الموظف",
        text: "أدخل الاسم والوظيفة والراتب الأساسي وتاريخ التعيين، ثم اجعل حالته نشطًا.",
        action: "الموظفون والرواتب ← موظف جديد",
        result: "يصبح الموظف جاهزًا للسلف وكشوف الرواتب.",
      },
      {
        title: "سجل السلفة عند دفعها",
        text: "أدخل مبلغًا موجبًا ومنطقيًا. يمنع البرنامج السلفة التي تنتج صافي راتب سالبًا.",
        action: "سلفة جديدة",
        result: "تظهر السلفة ضمن حساب الموظف وتسوى عند الراتب.",
      },
      {
        title: "راجع نافذة تأكيد الراتب",
        text: "اختر الشهر وراجع الموظف والأساسي والإضافات والخصومات والسلفة والصافي قبل الدفع.",
        action: "دفع الراتب ← تأكيد",
        result: "يُعتمد الراتب مرة واحدة ويظهر ضمن تكلفة الرواتب.",
      },
      {
        title: "اطبع سند الراتب",
        text: "اطبع السند A5 ليوقّعه الموظف والإدارة، ثم احتفظ به ضمن مستندات الشهر.",
        action: "طباعة سند الراتب",
        result: "يظهر الأساسي والسلفة والخصومات والصافي وتاريخ الدفع بوضوح.",
      },
    ],
    reminders: [
      "راتب 500 وسلفة 100 وصافي مدفوع 400 يعني أن تكلفة الراتب هي 500.",
      "لا تسجل الراتب مرة ثانية كمصروف يدوي حتى لا يتكرر الحساب.",
      "إجمالي مصروفات الشركة = المصاريف التشغيلية + تكلفة الرواتب.",
    ],
  },
  admin: {
    title: "المستخدمون والتدقيق والنسخ الاحتياطي",
    intro: "هذا القسم يحمي بيانات الزبون. استخدم حسابًا لكل شخص وأنشئ نسخًا احتياطية منتظمة.",
    image: "/help/05-admin-backup.svg",
    imageAlt: "صورة توضيحية للمستخدمين وسجل التدقيق والنسخ الاحتياطي",
    caption: "أفضل حماية: صلاحيات صحيحة + سجل تدقيق + نسخة احتياطية خارج الجهاز.",
    steps: [
      {
        title: "اختر الدور المناسب لكل مستخدم",
        text: "المالك يدير كل النظام. المدير يدير العمل لكن لا يستطيع إنشاء مالك. المحاسب للمالية، والسكرتير للعمل اليومي.",
        action: "المستخدمون ← الدور",
        result: "تقل احتمالات التعديل أو الإلغاء غير المصرح به.",
      },
      {
        title: "راجع سجل التدقيق عند الحاجة",
        text: "استخدم البحث والتاريخ لمعرفة من أضاف أو عدّل أو ألغى عملية مهمة.",
        action: "سجل التدقيق",
        result: "يمكن تتبع الإلغاءات وتغييرات المستخدمين والعمليات الإدارية.",
      },
      {
        title: "أنشئ نسخة احتياطية دورية",
        text: "أنشئ نسخة بعد كل يوم عمل مهم، واحفظ نسخة أسبوعية على USB أو قرص آخر.",
        action: "النسخ الاحتياطي ← إنشاء نسخة",
        result: "يمكن استعادة البيانات إذا تعطل الجهاز أو حُذفت ملفات بالخطأ.",
      },
      {
        title: "اختبر الاستعادة قبل التسليم",
        text: "على بيانات تجريبية فقط، أنشئ نسخة ثم استعدها وتأكد من رجوع الطلاب والسندات والإعدادات.",
        action: "استعادة نسخة احتياطية",
        result: "تتأكد أن خطة الحماية تعمل فعلًا قبل إدخال بيانات حقيقية.",
      },
    ],
    reminders: [
      "لا يمكن تعطيل أو حذف آخر مالك في النظام.",
      "لا ترسل ملف الترخيص الخاص بالزبون إلى شخص آخر.",
      "قاعدة البيانات والترخيص يبقيان محفوظين عند تثبيت تحديث جديد فوق النسخة الحالية.",
    ],
  },
};

function StepCard({ step, index }: { step: GuideStep; index: number }) {
  return (
    <li className="relative rounded-xl border bg-card p-4 pr-14">
      <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {index + 1}
      </span>
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
        <p className="text-base font-bold text-primary">دليل مصوّر للعامل الجديد</p>
        <p className="mt-1 max-w-3xl leading-6 text-muted-foreground">
          اختر القسم الذي تريد تعلمه، ثم نفّذ الخطوات بالترتيب. الصور توضح مكان العملية، والنص أسفلها يشرح ما يجب أن يحدث بعد كل خطوة.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border bg-muted/30 p-2" role="tablist" aria-label="أقسام دليل الاستخدام">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-colors md:text-sm",
              active === tab.id ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary",
            )}
          >
            <span className="ml-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <section role="tabpanel" className="space-y-5">
        <div>
          <h3 className="text-xl font-bold">{section.title}</h3>
          <p className="mt-1 leading-6 text-muted-foreground">{section.intro}</p>
        </div>

        <figure className="overflow-hidden rounded-2xl border bg-white">
          <img src={section.image} alt={section.imageAlt} className="block h-auto w-full" loading="lazy" />
          <figcaption className="border-t bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
            {section.caption}
          </figcaption>
        </figure>

        <ol className="grid gap-3 md:grid-cols-2">
          {section.steps.map((step, index) => <StepCard key={step.title} step={step} index={index} />)}
        </ol>

        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="font-bold">⚠️ انتبه قبل المتابعة</p>
          <ul className="mt-2 space-y-2 text-muted-foreground">
            {section.reminders.map((reminder) => (
              <li key={reminder} className="flex gap-2 leading-6">
                <span className="font-bold text-warning">●</span>
                <span>{reminder}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="rounded-xl border bg-muted/30 p-4 text-center text-xs leading-6 text-muted-foreground">
        عند الشك لا تكرر العملية. راجع ملف الطالب أو سجل التدقيق أولًا، ثم اطلب مساعدة المسؤول.
      </div>
    </div>
  );
}

# نظام إدارة معهد — التصميم المقترح (قبل البرمجة)

## ملاحظة أساسية أولًا
هذه المنصة تبني **تطبيقات ويب** (React + TanStack Start). لا يمكنني هنا إنتاج ملف `.exe` أو مشروع Electron جاهز للتوقيع والتوزيع.
الطريق العملي:
1. نبني هنا **التطبيق الكامل كواجهة ويب** بنفس البنية والقواعد أدناه.
2. التطبيق يعمل **Offline-first** عبر قاعدة بيانات محلية في المتصفح (SQLite/WASM أو IndexedDB) — يعمل بدون إنترنت.
3. لاحقًا يُغلَّف نفس الكود داخل **Electron/Tauri** خارج المنصة للحصول على EXE حقيقي + Licensing + Device Fingerprint. البنية أدناه مصممة لهذا التغليف دون إعادة بناء.
إن كان EXE اليوم شرطًا لا يقبل التأجيل، فالأصح تنفيذ المشروع خارج هذه المنصة.

## 1. Architecture
طبقات مفصولة بالكامل:

```text
UI (React + RTL)  →  Application Services (use-cases)  →  Repositories (interfaces)
                                                            ├── LocalRepo (SQLite/WASM)
                                                            └── CloudRepo (مستقبلًا)
Cross-cutting: Auth/RBAC، AuditLogger، SettingsProvider، Backup، Licensing
```
- كل منطق مالي/أكاديمي داخل Services وليس داخل مكونات الواجهة.
- كل جدول يحمل `id (uuid)`، `created_at`، `updated_at`، `branch_id`، `sync_status` منذ اليوم الأول → يجعل المزامنة والفروع المتعددة إضافة لاحقة بلا كسر.
- Money = أعداد صحيحة (قروش/سنت) لا floats.

## 2. Database Schema (مختصر)
- **settings** (institute_name, logo, director, phone, address, currency, academic_year, receipt/certificate prefixes, grading_scheme_json)
- **branches**، **academic_years**، **terms**
- **users** (username, password_hash, is_active) / **roles** / **permissions** / **user_roles** / **role_permissions**
- **students** (code, full_name, birth_date, gender, phone, guardian_*, status, notes)
- **student_documents**
- **courses** (name, code, default_price, hours, active) / **subjects** / **levels**
- **classes** (course_id, level_id, term_id, teacher_id, capacity, start/end) / **class_subjects**
- **schedules** (class_id, weekday, start_time, end_time, room)
- **enrollments** (student_id, class_id, enrolled_at, **price_snapshot**, discount_snapshot, status: active/completed/withdrawn/cancelled) ← سجل مستقل لكل تسجيل، لا يُحذف أبدًا
- **attendance** (enrollment_id, date, status: present/absent/late/excused, note, recorded_by)
- **exams** (class_id, subject_id, type: final/midterm/quiz/other, max_score, **weight_snapshot**, date)
- **grades** (exam_id, enrollment_id, score, entered_by) + **grade_revisions** (القيمة القديمة/الجديدة/السبب)
- **invoices** (enrollment_id, number, total, status) / **installments** (invoice_id, due_date, amount, status)
- **payments** (invoice_id, installment_id, receipt_no فريد, amount, method, paid_at, is_void, void_reason)
- **discounts** (نوع، قيمة، سبب، معتمِد)
- **employees** (نوع: teacher/staff، بيانات تعاقد) / **employee_contracts** (base_salary + تاريخ سريان → التاريخ محفوظ)
- **payroll_runs** / **payroll_items** (راتب، مكافآت، حسميات، سلف مستقطعة — كلها snapshots)
- **advances** (سلف) / **deductions** / **bonuses**
- **expense_categories** / **expenses** / **incomes** / **cash_accounts** / **cash_transactions**
- **certificates** (student_id, enrollment_id, type: success/completion/attendance, **serial فريد**, issued_at, verification_token للـQR)
- **audit_log** (user_id, entity, entity_id, action, before_json, after_json, at)
- **backups** (path, size, checksum, at)
- **license** (license_id, institute_name, device_fingerprint, status, activated_at, signature)

قواعد: أسعار/رواتب/أوزان الامتحانات تُنسخ (snapshot) داخل السجل لحظة الإنشاء، فتغيير الإعدادات لاحقًا لا يمسّ الماضي.

## 3. قائمة الشاشات
Dashboard · الطلاب (قائمة/ملف الطالب: بيانات، تسجيلات، حضور، علامات، حساب مالي، شهادات، مستندات) · التسجيلات · الدورات · المواد · المستويات · الصفوف والمجموعات · الجداول · المدرسون · الحضور (تسجيل يومي + تقارير) · الامتحانات · إدخال العلامات · التقييم النهائي · الفواتير والأقساط · الدفعات والإيصالات · الخصومات · المتأخرات · كشف حساب طالب · الموظفون · العقود · الرواتب · السلف/الحسميات/المكافآت · المصاريف · المداخيل · الصندوق · الربح والخسارة · الشهادات (إصدار/طباعة) · التقارير · الإعدادات · المستخدمون والصلاحيات · سجل التدقيق · النسخ الاحتياطي · الترخيص.

## 4. Roles & Permissions
صلاحيات ذرّية `entity.action` (مثال: `payments.create`, `grades.update`, `payroll.view`).
- **Owner**: كل شيء + الترخيص + المستخدمون + حذف/إلغاء.
- **Director**: كل شيء تشغيليًا، بلا إدارة ترخيص وبلا حذف نهائي.
- **Accountant**: المالية كاملة + تقاريرها، قراءة الطلاب فقط.
- **Secretary**: الطلاب، التسجيلات، الحضور، الجداول، قبض الدفعات (بلا إلغاء).
- **Teacher**: صفوفه فقط — الحضور والعلامات، بلا أي مالية.
التحقق يتم في طبقة Services لا في الواجهة فقط.

## 5. Financial Flow
```text
Enrollment → Invoice (بسعر منسوخ) → Installments (جدول استحقاق)
Payment → Receipt رقم متسلسل فريد → Cash Transaction (وارد)
Expense / Salary → Cash Transaction (صادر)
P&L = (Payments + Incomes) − (Expenses + Payroll)
```
- كل عملية داخل **Transaction** واحدة: الدفعة + حالة القسط + حركة الصندوق + قيد التدقيق معًا أو لا شيء.
- لا حذف مالي إطلاقًا: **Void/Cancel** بسبب إلزامي + قيد تدقيق، والسجل يبقى ظاهرًا كملغى.
- المتأخر = قسط تجاوز تاريخه ولم يُسدَّد بالكامل.

## 6. Backup / Restore
- نسخة كاملة مشفّرة (ملف واحد) + checksum + رقم إصدار المخطط.
- تلقائي يومي + عند كل إغلاق + يدوي قبل أي استرجاع.
- الاسترجاع: تحقق من التوقيع والإصدار → نسخة أمان تلقائية → استبدال → قيد تدقيق.
- حقول `sync_status` تسمح لاحقًا بـCloud Backup دون تعديل المخطط.

## 7. Licensing (عند التغليف كـEXE)
- Fingerprint مركّب: لوحة أم + قرص + CPU + معرّف تثبيت مخزّن — لا MAC وحده، ويقبل تطابقًا جزئيًا (3 من 4) لتفادي الرفض عند تغيير قطعة.
- ملف ترخيص موقّع بمفتاح خاص (RSA/Ed25519)؛ البرنامج يحمل المفتاح العام فقط. لا أسرار عند العميل.
- التخزين محلي مشفّر ومربوط بالجهاز.
- أداة مالك منفصلة: إصدار ترخيص، **Deactivate جهاز قديم → Activate جهاز جديد** عبر ملف نقل/كود إلغاء.
- العميل يستلم Installer فقط؛ الكود مبني ومُصغَّر.

## 8. مراحل التنفيذ
1. الأساس: تصميم النظام (RTL)، قاعدة البيانات، الإعدادات، المستخدمون والصلاحيات، سجل التدقيق.
2. الأكاديمي: الطلاب، الدورات/المستويات/الصفوف، التسجيلات، المدرسون، الجداول.
3. الحضور وتقاريره.
4. المالية: الفواتير، الأقساط، الدفعات، الخصومات، المتأخرات، كشف الحساب، الصندوق.
5. الامتحانات والعلامات والتقييم النهائي.
6. الموظفون والرواتب والسلف والمكافآت.
7. المصاريف/المداخيل والربح والخسارة.
8. الشهادات والطباعة PDF.
9. Dashboard والتقارير الشاملة (PDF/Excel).
10. النسخ الاحتياطي والاسترجاع.
11. التغليف Desktop + Licensing (خارج المنصة).

## قرار مطلوب منك
هل نبدأ التنفيذ هنا كتطبيق يعمل Offline قابل للتغليف لاحقًا كـEXE؟ وإن نعم، نبدأ بالمرحلة 1.

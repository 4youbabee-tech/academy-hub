# Academy Hub

أريد تطوير برنامج Desktop حديث لإدارة معهد صغير، يعمل Offline بالكامل ويدعم العربية RTL، ويكون قابلًا للتطوير مستقبلًا.

المطلوب أن يشمل النظام:

- إدارة الطلاب وملف كامل لكل طالب مع التاريخ الأكاديمي والمالي.

- تسجيل الطالب في Courses / Levels / Classes عبر Enrollments مستقلة، مع الاحتفاظ بكل التسجيلات القديمة.

- إدارة الدورات، المواد، الصفوف، المجموعات، المدرسين والجداول.

- حضور وغياب الطلاب وتقاريره.

- الأقساط والدفعات والخصومات والمتأخرات والإيصالات وكشف حساب الطالب.

- الموظفين والمدرسين والرواتب والسلف والحسميات والمكافآت.

- المصاريف، المداخيل، الصندوق، وحساب الربح والخسارة.

- الامتحانات والعلامات والتقييمات، مع إمكانية تحديد نسب Final / Midterm / Quiz / Attendance وغيرها من الإعدادات.

- شهادات نجاح/إتمام/حضور مع رقم شهادة فريد وطباعة PDF وإمكانية QR Verification مستقبلًا.

- Dashboard حديثة تعرض أهم الأرقام والتنبيهات والتقارير.

- تقارير شاملة قابلة للطباعة وPDF وExcel.

- Settings أتحكم منها باسم المعهد، الشعار، اسم المدير، الهاتف، العنوان، العملة، السنة الدراسية، أرقام الإيصالات والشهادات، أنواع المصاريف، نظام العلامات وغيرها.

- Users / Roles / Permissions مثل Owner, Director, Accountant, Secretary, Teacher.

- Audit Log لكل العمليات الحساسة خصوصًا المالية وتعديل العلامات والصلاحيات.

- Backup & Restore محلي آمن مع إمكانية Cloud Backup مستقبلًا.

- Search وFilters سريعة في جميع الأقسام.

قواعد مهمة في التصميم

لا أريد وضع كل بيانات الطالب داخل جدول واحد. يجب تصميم Database صحيحة بجداول منفصلة مثل Students, Enrollments, Courses, Attendance, Exams, Grades, Payments, Employees, Payroll, Expenses, Certificates وغيرها.

يجب الحفاظ على Historical Data، أي تغيير سعر دورة أو راتب أو إعداد مستقبلي لا يغيّر السجلات القديمة.

العمليات المالية يجب أن تكون Transactional، ولا يتم حذف السجلات المالية الحساسة بدون Audit/Cancel/Void واضح.

البرنامج يجب أن يعمل كـ Desktop EXE حقيقي بدون الاعتماد على الإنترنت.

حماية البرنامج

أريد نظام Licensing يمنع نسخ EXE وتشغيله على كمبيوتر آخر.

يكون لكل نسخة:

License ID + Institute Name + Device Fingerprint + Activation Status.

لا يعتمد فقط على MAC Address، ويكون التخزين المحلي للترخيص آمنًا.

وأريد كمالك البرنامج إمكانية:

Deactivate Old Device → Activate New Device

إذا تعطل جهاز العميل أو تم تغييره.

العميل يحصل على Installer/EXE فقط ولا يحصل على Source Code أو Secrets.

قابلية التطوير

صمم Architecture تسمح مستقبلًا بإضافة:

Web/Cloud، مزامنة عدة أجهزة، Student/Parent Portal، WhatsApp، Online Registration، QR Certificate Verification وMultiple Branches، بدون الحاجة لإعادة بناء البرنامج من الصفر.

قبل البرمجة

قبل كتابة أي كود أريد منك أولًا إرسال:

1. Architecture المقترحة.

2. Database Schema.

3. قائمة الشاشات.

4. Roles & Permissions.

5. Financial Flow.

6. Backup/Restore Strategy.

7. Licensing Strategy.

8. مراحل تنفيذ المشروع.

لا تبدأ البرمجة قبل الاتفاق على هذه النقاط.

الأولوية: برنامج بسيط للمستخدم، قوي داخليًا، آمن للبيانات المالية والأكاديمية، وقابل للتوسع مستقبلًا.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1f373902-df3f-4b84-a2e0-c52b773ea5da).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

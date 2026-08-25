# Academy Hub — نقطة تسليم Desktop

التاريخ: 2026-08-23  
الإصدار: 1.0.1

## الحالة الحالية

تم الحفاظ على واجهة React المثبّتة، وإضافة بنية Windows/Desktop بدون ربط React مباشرة بملف قاعدة البيانات:

React → Electron Preload/IPC → Storage Adapter → SQLite.

نسخة الويب بقيت متاحة للتطوير وتستخدم IndexedDB، أما النسخة المثبتة فتستخدم SQLite تلقائيًا.

## ما تم تنفيذه لنسخة Windows

- Electron 43 مع `contextIsolation` وSandbox و`nodeIntegration: false`.
- خادم محلي Loopback فقط لتشغيل TanStack Start داخل التطبيق المثبت.
- SQLite من `node:sqlite` بدون Native Addon خارجي أو إعادة بناء node-gyp.
- قاعدة البيانات والترخيص والنسخ الاحتياطية داخل Windows userData، خارج مجلد التثبيت.
- Schema versioning وMigration table وIndexes على الطلاب والتسجيلات والفواتير والسندات والموظفين والتواريخ.
- نسخة احتياطية تلقائية كل 24 ساعة والاحتفاظ بآخر 30 نسخة.
- نسخة أمان قبل Migration وقبل Restore.
- Restore يتحقق من ملف SQLite ثم يعيد تشغيل البرنامج، ويحتفظ بنسخة ما قبل الاستعادة.
- ترخيص Offline موقّع Ed25519 مرتبط ببصمة جهاز مركّبة.
- Machine ID يُحسب مرة عند Startup فقط.
- المفتاح العام فقط داخل Academy Hub؛ المفتاح الخاص موجود في حزمة البائع المنفصلة.
- NSIS Installer بإعداد per-user، مع عدم حذف App Data عند الإزالة أو التحديث.
- GitHub Actions لبناء Installer على `windows-latest` وإرفاقه كـArtifact أو Release.
- واجهة جاهزة لفحص التحديثات عند Startup، مع إبقائها معطلة حتى يتوفر رابط Releases عام آمن.

## الفحوص المنفذة

- TypeScript: ناجح.
- Desktop/TanStack Node-server production build: ناجح.
- سيناريو المجال المالي والرواتب والصلاحيات: ناجح.
- SQLite save/load وPagination index path: ناجح.
- SQLite manual backup وrestore: ناجح.
- Machine ID وLicense signature والتحقق من التلاعب: ناجح.
- إصدار License حقيقي من حزمة البائع والتحقق منه بالمفتاح العام داخل التطبيق: ناجح.

تشغيل نافذة Electron الكاملة غير ممكن داخل Sandbox الفحص الحالي بسبب منع النظام لإنشاء Socket الخاص بعملية Chromium، لذلك يبنى Installer Windows النهائي عبر GitHub Actions أو جهاز Windows.

## ملفات التسليم

- مصدر Desktop: مشروع Academy Hub الحالي.
- أداة البائع: `Academy-Hub-License-Vendor-Kit` — لا تُرسل إلى الزبون ولا تُرفع إلى GitHub.
- تعليمات Windows: `DESKTOP_RELEASE_GUIDE_AR.md`.

## قبل تسليم أول زبون

1. ابنِ Installer من GitHub Actions.
2. ثبّته على جهاز Windows تجريبي نظيف.
3. أرسل Machine ID إلى أداة البائع وأنشئ `academy.license`.
4. فعّل البرنامج، غيّر كلمة مرور Owner، ونفّذ السيناريو المالي القصير مرة واحدة.
5. جرّب Backup ثم Restore.
6. سلّم الزبون الـInstaller وملف ترخيص جهازه فقط.

import { readFile, writeFile } from "node:fs/promises";

async function replace(path, oldText, newText) {
  const text = await readFile(path, "utf8");
  if (!text.includes(oldText)) throw new Error(`Missing expected block in ${path}`);
  await writeFile(path, text.replace(oldText, newText), "utf8");
}

await replace(
  "src/routes/settings.tsx",
  'import { Denied } from "@/components/AppShell";\n',
  'import { Denied } from "@/components/AppShell";\nimport { DataResetPanel } from "@/components/DataResetPanel";\n',
);
await replace(
  "src/routes/settings.tsx",
  '      {canEdit && (\n        <div className="mt-6 flex justify-end">',
  '      <DataResetPanel />\n\n      {canEdit && (\n        <div className="mt-6 flex justify-end">',
);

await replace(
  "desktop/main.mjs",
  '  handle("academy:backup:restore-latest-automatic", async () => {',
  '  handle("academy:backup:create-reset-safety", async () => {\n    requireDatabaseAccess();\n    const path = await protectedBackup.createResetSafety();\n    return { path };\n  });\n\n  handle("academy:backup:restore-latest-automatic", async () => {',
);

await replace(
  "tests/security-harness.ts",
  'console.log("security-harness: OK");',
  'await import("./data-reset-harness.ts");\n\nconsole.log("security-harness: OK");',
);

await replace(
  "tests/protected-backup-harness.mjs",
  '  database.saveSnapshot({ ...snapshot, students: [] });\n  const automaticRestore = await service.restoreLatestAutomatic();\n  assert.equal(automaticRestore.source, automatic);\n  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "automatic backup must restore on same device secret");\n\n  console.log("protected-backup-harness: OK");',
  '  database.saveSnapshot({ ...snapshot, students: [] });\n  const automaticRestore = await service.restoreLatestAutomatic();\n  assert.equal(automaticRestore.source, automatic);\n  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "automatic backup must restore on same device secret");\n\n  const resetSafety = await service.createResetSafety();\n  assert.ok(resetSafety.endsWith(".ahbackup"), "reset safety backup must be encrypted");\n  const resetSafetyBytes = await readFile(resetSafety);\n  assert.equal(resetSafetyBytes.subarray(0, 5).toString("ascii"), "AHBK2");\n  assert.equal(resetSafetyBytes.includes(Buffer.from("SQLite format 3\\0")), false, "reset safety backup must hide SQLite header");\n\n  console.log("protected-backup-harness: OK");',
);

await replace(
  "src/components/HelpGuide.tsx",
  '      { title: "أنشئ أول Backup", text: "بعد التأكد من البيانات، أنشئ نسخة احتياطية. في Windows اختر كلمة حماية قوية واحفظها خارج الكمبيوتر.", action: "النسخ الاحتياطي ← إنشاء نسخة", result: "تصبح لديك نقطة استعادة آمنة قبل بدء العمل الحقيقي." },',
  '      { title: "أنشئ أول Backup", text: "بعد التأكد من البيانات، أنشئ نسخة احتياطية. في Windows اختر كلمة حماية قوية واحفظها خارج الكمبيوتر.", action: "النسخ الاحتياطي ← إنشاء نسخة", result: "تصبح لديك نقطة استعادة آمنة قبل بدء العمل الحقيقي." },\n      { title: "امسح بيانات التجربة عند الحاجة", text: "إذا انتهيت من الاختبار وتريد بدء تشغيل نظيف، افتح الإعدادات واضغط «مسح بيانات التشغيل». يطلب النظام تأكيدًا أولًا ثم كتابة «مسح البيانات نهائياً»، وينشئ نسخة أمان قبل التنفيذ.", action: "الإعدادات ← مسح بيانات التشغيل", result: "تُمسح بيانات التشغيل فقط وتبقى الحسابات والإعدادات والشعار والصلاحيات وسجل التدقيق محفوظة." },',
);
await replace(
  "src/components/HelpGuide.tsx",
  '      "اختبر دورة مالية كاملة ببيانات تجريبية قبل إدخال بيانات حقيقية.",',
  '      "اختبر دورة مالية كاملة ببيانات تجريبية قبل إدخال بيانات حقيقية.",\n      "مسح بيانات التشغيل متاح للمالك فقط ويحتاج تأكيدين، ويُنشئ نسخة أمان قبل المسح.",',
);

await replace(
  "public/help/01-first-start.svg",
  '<desc id="desc">تسجيل الدخول ثم إعدادات المعهد والمستخدمون والنسخ الاحتياطي</desc>',
  '<desc id="desc">تسجيل الدخول ثم الإعدادات والمستخدمون والنسخ الاحتياطي ومسح بيانات التجربة الآمن</desc>',
);
await replace(
  "public/help/01-first-start.svg",
  '<text x="750" y="307" text-anchor="middle" font-size="15" fill="#e5f2f1">النسخ الاحتياطي</text>',
  '<text x="750" y="307" text-anchor="middle" font-size="15" fill="#e5f2f1">النسخ / مسح التجربة</text>',
);

console.log("settings reset integration patch applied");

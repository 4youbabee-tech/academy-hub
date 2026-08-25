# Academy Hub Desktop print fix — v1.0.1

## المشكلة

كان سند الطالب وسند الراتب يعتمدان على `window.open()` ثم `window.print()`.
نافذة Electron الرئيسية تمنع النوافذ المنبثقة للحماية، لذلك كان الضغط على زر الطباعة لا يفعل شيئًا.

تمت تجربة حل أول يسمح لنافذة `about:blank` داخل Electron. هذا الأسلوب موجود في حزمة
`1.0.0` المرسلة للفحص، لكنه لم يُعتمد في الإصدار النهائي.

## الحل النهائي

```text
React → Preload/IPC → Electron main → webContents.print() → Windows printer
```

- لا توجد نافذة Popup للطباعة في نسخة Desktop.
- يتم إنشاء نافذة طباعة داخلية ومعزولة ثم استدعاء نافذة طابعة Windows الأصلية.
- تبقى جميع النوافذ المنبثقة من الواجهة الرئيسية ممنوعة.
- تبقى طريقة الطباعة القديمة كخيار احتياطي لنسخة الويب فقط.
- لم تتغير قاعدة البيانات أو الـSchema أو الترخيص أو الحسابات المالية.

## الملفات الوظيفية المعدلة

- `desktop/main.mjs`
- `desktop/preload.cjs`
- `src/desktop.d.ts`
- `src/lib/print-document.ts`
- `src/lib/receipt-print.ts`
- `src/routes/employees.tsx`

تم رفع رقم النسخة إلى `1.0.1` حتى لا تختلط مع حزمة `1.0.0` السابقة.

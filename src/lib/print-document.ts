export type PrintPageSize = "A4" | "A5";

function showPrintError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Academy Hub printing failed", error);
  window.alert(`تعذرت الطباعة: ${message}`);
}

function buildWebPreview(html: string): string {
  const toolbarStyle = `
<style id="academy-print-preview-style">
  #academy-print-preview-toolbar {
    position: sticky;
    top: 0;
    z-index: 2147483647;
    display: flex;
    direction: rtl;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px;
    margin: 0 0 12px;
    background: #0f172a;
    color: #fff;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,.18);
  }
  #academy-print-preview-toolbar button {
    border: 0;
    border-radius: 9px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  #academy-print-preview-toolbar .primary { background: #0f766e; color: #fff; }
  #academy-print-preview-toolbar .secondary { background: #e2e8f0; color: #0f172a; }
  #academy-print-preview-toolbar .hint { width: 100%; text-align: center; font-size: 12px; opacity: .85; }
  @media print {
    #academy-print-preview-toolbar { display: none !important; }
  }
</style>`;

  const toolbar = `
<div id="academy-print-preview-toolbar">
  <button class="primary" type="button" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
  <button class="secondary" type="button" onclick="window.close()">إغلاق المعاينة</button>
  <div class="hint">راجع المستند أولاً، ثم اضغط «طباعة / حفظ PDF». على الهاتف يمكنك اختيار Save as PDF من نافذة النظام.</div>
</div>`;

  let result = html;
  if (/<\/head>/i.test(result)) result = result.replace(/<\/head>/i, `${toolbarStyle}</head>`);
  else result = `${toolbarStyle}${result}`;

  if (/<body[^>]*>/i.test(result)) result = result.replace(/<body([^>]*)>/i, `<body$1>${toolbar}`);
  else result = `${toolbar}${result}`;

  return result;
}

function openWebPrintPreview(html: string): void {
  const preview = window.open("", "_blank");
  if (!preview) {
    showPrintError(new Error("المتصفح منع نافذة معاينة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة."));
    return;
  }

  try {
    preview.document.open();
    preview.document.write(buildWebPreview(html));
    preview.document.close();
    preview.focus();
  } catch (error) {
    try {
      preview.close();
    } catch {
      // Ignore cleanup failures.
    }
    showPrintError(error);
  }
}

/**
 * Print a complete HTML document.
 * Desktop uses Electron IPC/webContents.print.
 * Web/mobile opens a persistent print preview. The user then presses
 * "طباعة / حفظ PDF" from inside that preview so the browser keeps the print
 * action inside a direct user gesture. This is more reliable on Android/iOS
 * than auto-printing hidden iframes or delayed popups.
 */
export function printHtmlDocument(html: string, pageSize: PrintPageSize): void {
  if (!html.trim()) {
    showPrintError(new Error("محتوى الطباعة فارغ."));
    return;
  }

  const desktopPrint = window.academyDesktop?.print?.html;
  if (desktopPrint) {
    void desktopPrint({ html, pageSize }).catch(showPrintError);
    return;
  }

  openWebPrintPreview(html);
}

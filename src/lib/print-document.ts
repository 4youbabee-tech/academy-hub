export type PrintPageSize = "A4" | "A5";

function showPrintError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Academy Hub printing failed", error);
  window.alert(`تعذرت الطباعة: ${message}`);
}

/**
 * Print a complete HTML document. Desktop uses Electron IPC/webContents.print;
 * the normal web build keeps the browser window.print fallback.
 */
export function printHtmlDocument(html: string, pageSize: PrintPageSize): void {
  const desktopPrint = window.academyDesktop?.print?.html;
  if (desktopPrint) {
    void desktopPrint({ html, pageSize }).catch(showPrintError);
    return;
  }

  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("تعذرت الطباعة لأن نافذة الطباعة لم تُفتح.");
    return;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  window.setTimeout(() => {
    try {
      popup.focus();
      popup.print();
    } catch (error) {
      showPrintError(error);
    }
  }, 400);
}

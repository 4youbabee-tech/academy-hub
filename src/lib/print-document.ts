export type PrintPageSize = "A4" | "A5";

function showPrintError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Academy Hub printing failed", error);
  window.alert(`تعذرت الطباعة: ${message}`);
}

async function waitForPrintableDocument(document: Document): Promise<void> {
  try {
    if ("fonts" in document) await document.fonts.ready;
  } catch {
    // Printing must continue even when a browser cannot expose FontFaceSet readiness.
  }

  const images = Array.from(document.images);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
      window.setTimeout(done, 1500);
    });
  }));
}

function printInWebFrame(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Academy Hub print document";
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.style.border = "0";

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frame.remove();
  };
  const cleanupTimer = window.setTimeout(cleanup, 60_000);

  frame.addEventListener("load", () => {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) {
      window.clearTimeout(cleanupTimer);
      cleanup();
      showPrintError(new Error("تعذر تجهيز مستند الطباعة."));
      return;
    }

    void waitForPrintableDocument(frameDocument)
      .then(() => {
        frameWindow.addEventListener("afterprint", () => {
          window.clearTimeout(cleanupTimer);
          cleanup();
        }, { once: true });
        frameWindow.focus();
        frameWindow.print();
      })
      .catch((error: unknown) => {
        window.clearTimeout(cleanupTimer);
        cleanup();
        showPrintError(error);
      });
  }, { once: true });

  document.body.appendChild(frame);
  frame.srcdoc = html;
}

/**
 * Print a complete HTML document. Desktop uses Electron IPC/webContents.print.
 * Web/mobile uses a dedicated same-origin iframe instead of a transient popup,
 * preventing blank pages and popup/printer failures seen in mobile previews.
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

  try {
    printInWebFrame(html);
  } catch (error) {
    showPrintError(error);
  }
}

import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
}
function replaceOnce(source, from, to, label) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing expected block: ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

edit('desktop/main.mjs', (source) => {
  source = replaceOnce(source,
    'let restoring = false;\nlet logFile = null;\n',
    'let restoring = false;\nlet logFile = null;\nlet closeReady = false;\nlet closeRequested = false;\nlet closeTimer = null;\n',
    'close state');
  const afterRequire = `function requireDatabaseAccess() {\n  if (restoring) throw new Error("تجري استعادة قاعدة البيانات الآن.");\n  licenseManager.assertValid();\n}\n`;
  const closeHelpers = `function requireDatabaseAccess() {\n  if (restoring) throw new Error("تجري استعادة قاعدة البيانات الآن.");\n  licenseManager.assertValid();\n}\n\nfunction clearCloseTimer() {\n  if (closeTimer) clearTimeout(closeTimer);\n  closeTimer = null;\n}\n\nfunction cancelCloseRequest(detail) {\n  clearCloseTimer();\n  closeRequested = false;\n  log("Close flush failed", detail);\n  if (mainWindow && !mainWindow.isDestroyed()) {\n    void dialog.showMessageBox(mainWindow, {\n      type: "error",\n      title: "Academy Hub",\n      message: "لم يتم إغلاق البرنامج لأن حفظ البيانات لم يكتمل.",\n      detail: detail || "حاول مرة أخرى بعد لحظات.",\n    });\n  }\n}\n\nfunction requestRendererClose() {\n  if (closeReady || restoring) {\n    app.quit();\n    return;\n  }\n  if (!mainWindow || mainWindow.isDestroyed()) {\n    closeReady = true;\n    app.quit();\n    return;\n  }\n  if (closeRequested) return;\n  closeRequested = true;\n  mainWindow.webContents.send("academy:app:prepare-close");\n  clearCloseTimer();\n  closeTimer = setTimeout(() => cancelCloseRequest("انتهت مهلة انتظار حفظ قاعدة البيانات."), 10_000);\n}\n`;
  source = replaceOnce(source, afterRequire, closeHelpers, 'close helpers');
  source = replaceOnce(source,
    '  handle("academy:app:check-updates", () => updateService.check());\n  handle("academy:app:quit", () => {\n    app.quit();\n    return { quitting: true };\n  });\n',
    `  handle("academy:app:check-updates", () => updateService.check());\n  handle("academy:app:close-ready", (payload) => {\n    if (!closeRequested) return { accepted: false };\n    if (payload?.ok !== true) {\n      const detail = typeof payload?.error === "string" ? payload.error.slice(0, 500) : "تعذر حفظ آخر التعديلات.";\n      cancelCloseRequest(detail);\n      return { accepted: false };\n    }\n    clearCloseTimer();\n    closeRequested = false;\n    closeReady = true;\n    app.quit();\n    return { accepted: true };\n  });\n  handle("academy:app:quit", () => {\n    requestRendererClose();\n    return { quitting: true };\n  });\n`,
    'app close IPC');
  source = replaceOnce(source,
    '  window.once("ready-to-show", () => window.show());\n  await window.loadURL(url);\n',
    `  window.once("ready-to-show", () => window.show());\n  window.on("close", (event) => {\n    if (closeReady || restoring) return;\n    event.preventDefault();\n    requestRendererClose();\n  });\n  await window.loadURL(url);\n`,
    'window close interception');
  const oldBeforeQuit = `app.on("before-quit", () => {\n  app.isQuitting = true;\n  stopWebServer();\n  if (database) {\n    try {\n      database.close();\n    } catch (error) {\n      log("Database close failed", error);\n    }\n    database = null;\n  }\n});`;
  const newBeforeQuit = `app.on("before-quit", (event) => {\n  if (!restoring && mainWindow && !mainWindow.isDestroyed() && !closeReady) {\n    event.preventDefault();\n    requestRendererClose();\n    return;\n  }\n  app.isQuitting = true;\n  clearCloseTimer();\n  stopWebServer();\n  if (database) {\n    try {\n      database.close();\n    } catch (error) {\n      log("Database close failed", error);\n    }\n    database = null;\n  }\n});`;
  return replaceOnce(source, oldBeforeQuit, newBeforeQuit, 'before quit handshake');
});

edit('desktop/preload.cjs', (source) => replaceOnce(
  source,
  '    checkForUpdates: () => invoke("academy:app:check-updates"),\n    quit: () => invoke("academy:app:quit"),\n',
  `    checkForUpdates: () => invoke("academy:app:check-updates"),\n    onPrepareClose: (callback) => {\n      if (typeof callback !== "function") return () => {};\n      const listener = () => callback();\n      ipcRenderer.on("academy:app:prepare-close", listener);\n      return () => ipcRenderer.removeListener("academy:app:prepare-close", listener);\n    },\n    confirmClose: (result) => invoke("academy:app:close-ready", result),\n    quit: () => invoke("academy:app:quit"),\n`,
  'preload close API',
));

edit('src/desktop.d.ts', (source) => replaceOnce(
  source,
  '    checkForUpdates(): Promise<{\n      configured: boolean;\n      available: boolean;\n      currentVersion: string;\n      latestVersion?: string;\n      message: string;\n    }>;\n    quit(): Promise<{ quitting: boolean }>;\n',
  `    checkForUpdates(): Promise<{\n      configured: boolean;\n      available: boolean;\n      currentVersion: string;\n      latestVersion?: string;\n      message: string;\n    }>;\n    onPrepareClose(callback: () => void): () => void;\n    confirmClose(result: { ok: boolean; error?: string }): Promise<{ accepted: boolean }>;\n    quit(): Promise<{ quitting: boolean }>;\n`,
  'desktop close types',
));

edit('src/lib/session.tsx', (source) => {
  source = source.replace(
    'import { hashPassword, isLegacyPasswordHash, loadDb, snapshot, subscribe, transact, audit, verifyPassword, type Actor } from "./db";',
    'import { flushDb, hashPassword, isLegacyPasswordHash, loadDb, snapshot, subscribe, transact, audit, verifyPassword, type Actor } from "./db";',
  );
  const marker = '  const user = useMemo(\n';
  const closeEffect = `  useEffect(() => {\n    const desktopApp = window.academyDesktop?.app;\n    if (!desktopApp) return;\n    return desktopApp.onPrepareClose(() => {\n      void flushDb()\n        .then(() => desktopApp.confirmClose({ ok: true }))\n        .catch((error: unknown) => desktopApp.confirmClose({\n          ok: false,\n          error: error instanceof Error ? error.message : String(error),\n        }));\n    });\n  }, []);\n\n`;
  return replaceOnce(source, marker, closeEffect + marker, 'renderer flush close effect');
});

edit('package.json', (source) => source.replace(
  '"test:desktop": "node tests/desktop-harness.mjs"',
  '"test:desktop": "node --check desktop/main.mjs && node --check desktop/preload.cjs && node tests/desktop-harness.mjs"',
));

console.log('Academy safe close flush handshake transform complete');

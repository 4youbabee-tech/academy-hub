import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
} from "electron";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

import { AcademyDatabase, ACADEMY_COLLECTIONS } from "./database.mjs";
import { LicenseManager } from "./licensing.mjs";
import { ProtectedBackupService } from "./protected-backup.mjs";
import { UpdateService } from "./update-service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = !app.isPackaged;
const devServerUrl = process.env.ACADEMY_DEV_SERVER_URL || "http://127.0.0.1:8080";

let mainWindow = null;
let webServer = null;
let allowedOrigin = null;
let database = null;
let protectedBackup = null;
let licenseManager = null;
let updateService = null;
let restoring = false;
let logFile = null;
let closeReady = false;
let closeRequested = false;
let closeTimer = null;

function log(message, error) {
  const suffix = error instanceof Error ? `\n${error.stack ?? error.message}` : error ? `\n${String(error)}` : "";
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;
  console.log(line.trimEnd());
  if (logFile) {
    try {
      appendFileSync(logFile, line, "utf8");
    } catch {
      // Logging must never prevent the application from starting.
    }
  }
}

async function loadOrCreateAutomaticBackupPassphrase(userData) {
  const securityDirectory = path.join(userData, "security");
  const keyPath = path.join(securityDirectory, "backup-passphrase.bin");
  await mkdir(securityDirectory, { recursive: true });

  if (!safeStorage.isEncryptionAvailable()) {
    if (app.isPackaged) throw new Error("Windows Secure Storage غير متاح؛ لا يمكن حماية النسخ التلقائية بأمان.");
    return null;
  }

  try {
    const protectedValue = await readFile(keyPath);
    const value = safeStorage.decryptString(protectedValue);
    if (value.length < 20) throw new Error("مفتاح حماية النسخ التلقائية غير صالح.");
    return value;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const value = randomBytes(32).toString("base64url");
  await writeFile(keyPath, safeStorage.encryptString(value), { mode: 0o600 });
  return value;
}

function validateSnapshotPayload(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("صيغة قاعدة البيانات غير صالحة.");
  }
  if (!Number.isInteger(snapshot.schema_version) || snapshot.schema_version < 1 || snapshot.schema_version > 4) {
    throw new Error("إصدار قاعدة البيانات غير صالح.");
  }
  if (!snapshot.settings || typeof snapshot.settings !== "object" || Array.isArray(snapshot.settings)) {
    throw new Error("إعدادات قاعدة البيانات غير صالحة.");
  }
  for (const collection of ACADEMY_COLLECTIONS) {
    if (!Array.isArray(snapshot[collection])) {
      throw new Error(`مجموعة قاعدة البيانات غير صالحة: ${collection}`);
    }
  }
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error || !port ? reject(error ?? new Error("No port")) : resolve(port)));
    });
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (webServer?.exitCode != null) throw new Error("The bundled web server stopped unexpectedly.");
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out while starting the bundled Academy Hub server.");
}

async function startPackagedWebServer() {
  const port = await reserveLoopbackPort();
  const serverEntry = path.join(process.resourcesPath, "web", "server", "index.mjs");
  const url = `http://127.0.0.1:${port}`;
  webServer = spawn(process.execPath, [serverEntry], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(port),
      NODE_ENV: "production",
    },
  });
  webServer.stdout?.on("data", (chunk) => log(`[web] ${String(chunk).trimEnd()}`));
  webServer.stderr?.on("data", (chunk) => log(`[web:error] ${String(chunk).trimEnd()}`));
  webServer.once("exit", (code, signal) => {
    if (!app.isQuitting) log(`Bundled web server exited (${signal ?? code ?? "unknown"}).`);
  });
  await waitForHttp(url);
  return url;
}

function stopWebServer() {
  if (webServer && webServer.exitCode === null) webServer.kill();
  webServer = null;
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url ?? "";
  if (!allowedOrigin || (!senderUrl.startsWith(`${allowedOrigin}/`) && senderUrl !== allowedOrigin)) {
    throw new Error("Untrusted IPC sender.");
  }
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event);
    return callback(payload, event);
  });
}

function requireDatabaseAccess() {
  if (restoring) throw new Error("تجري استعادة قاعدة البيانات الآن.");
  licenseManager.assertValid();
}

function assertBackupPassphrase(payload) {
  const passphrase = typeof payload?.passphrase === "string" ? payload.passphrase.normalize("NFKC") : "";
  if (passphrase.length < 10) throw new Error("كلمة حماية النسخة الاحتياطية يجب أن تكون 10 أحرف على الأقل.");
  if (Buffer.byteLength(passphrase, "utf8") > 1024) throw new Error("كلمة حماية النسخة الاحتياطية طويلة جدًا.");
  return passphrase;
}

function clearCloseTimer() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

function cancelCloseRequest(detail) {
  clearCloseTimer();
  closeRequested = false;
  log("Close flush failed", detail);
  if (mainWindow && !mainWindow.isDestroyed()) {
    void dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Academy Hub",
      message: "لم يتم إغلاق البرنامج لأن حفظ البيانات لم يكتمل.",
      detail: detail || "حاول مرة أخرى بعد لحظات.",
    });
  }
}

function requestRendererClose() {
  if (closeReady || restoring) {
    app.quit();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    closeReady = true;
    app.quit();
    return;
  }
  if (closeRequested) return;
  closeRequested = true;
  mainWindow.webContents.send("academy:app:prepare-close");
  clearCloseTimer();
  closeTimer = setTimeout(() => cancelCloseRequest("انتهت مهلة انتظار حفظ قاعدة البيانات."), 10_000);
}

async function printHtmlDocument({ html, pageSize = "A5" } = {}) {
  if (typeof html !== "string" || html.trim().length === 0) {
    throw new Error("محتوى الطباعة فارغ.");
  }

  const htmlBytes = Buffer.byteLength(html, "utf8");
  if (htmlBytes > 8 * 1024 * 1024) {
    throw new Error("محتوى الطباعة أكبر من الحد المسموح.");
  }

  const normalizedPageSize = pageSize === "A4" ? "A4" : "A5";
  const temporaryPath = path.join(app.getPath("temp"), `academy-hub-print-${randomUUID()}.html`);
  const printWindow = new BrowserWindow({
    width: normalizedPageSize === "A4" ? 900 : 650,
    height: 900,
    show: false,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    },
  });

  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await writeFile(temporaryPath, html, "utf8");
    await printWindow.loadFile(temporaryPath);
    printWindow.webContents.on("will-navigate", (event) => event.preventDefault());
    await new Promise((resolve) => setTimeout(resolve, 200));

    printWindow.show();
    printWindow.focus();

    return await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          color: true,
          pageSize: normalizedPageSize,
        },
        (success, failureReason) => {
          if (!printWindow.isDestroyed()) printWindow.close();
          if (success) {
            resolve({ printed: true, cancelled: false });
            return;
          }

          const reason = failureReason || "تعذر تنفيذ الطباعة.";
          if (/cancel/i.test(reason)) {
            resolve({ printed: false, cancelled: true, failureReason: reason });
            return;
          }
          reject(new Error(reason));
        },
      );
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
    await unlink(temporaryPath).catch(() => {});
  }
}

function installIpcHandlers() {
  handle("academy:license:get-status", () => licenseManager.getStatus());
  handle("academy:license:copy-machine-id", () => {
    clipboard.writeText(licenseManager.getStatus().machineId);
    return { copied: true };
  });
  handle("academy:license:import", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "استيراد ترخيص Academy Hub",
      properties: ["openFile"],
      filters: [{ name: "Academy Hub License", extensions: ["license"] }],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { cancelled: true, status: licenseManager.getStatus() };
    }
    const status = await licenseManager.importFrom(result.filePaths[0]);
    return { cancelled: false, status };
  });

  handle("academy:database:load", () => {
    requireDatabaseAccess();
    return database.loadSnapshot();
  });
  handle("academy:database:save", (snapshot) => {
    requireDatabaseAccess();
    validateSnapshotPayload(snapshot);
    const payloadSize = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    if (payloadSize > 64 * 1024 * 1024) throw new Error("حجم قاعدة البيانات غير منطقي.");
    database.saveSnapshot(snapshot);
    return { saved: true };
  });
  handle("academy:database:get-page", ({ collection, request } = {}) => {
    requireDatabaseAccess();
    return database.getPage(collection, request);
  });

  handle("academy:backup:create", async (payload) => {
    requireDatabaseAccess();
    const passphrase = assertBackupPassphrase(payload);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "حفظ نسخة احتياطية مشفرة",
      defaultPath: path.join(app.getPath("documents"), `Academy-Hub-Backup-${stamp}.ahbackup`),
      filters: [{ name: "Academy Hub Encrypted Backup", extensions: ["ahbackup"] }],
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    await protectedBackup.create(result.filePath, passphrase);
    return { cancelled: false, path: result.filePath };
  });

  handle("academy:backup:restore", async (payload) => {
    requireDatabaseAccess();
    const passphrase = assertBackupPassphrase(payload);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "استعادة نسخة احتياطية",
      properties: ["openFile"],
      filters: [{ name: "Academy Hub Backup", extensions: ["ahbackup", "sqlite", "db"] }],
    });
    if (result.canceled || !result.filePaths[0]) return { cancelled: true };
    restoring = true;
    try {
      const safetyBackup = await protectedBackup.restore(result.filePaths[0], passphrase);
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return { cancelled: false, restarting: true, safetyBackup };
    } catch (error) {
      restoring = false;
      throw error;
    }
  });

  handle("academy:backup:create-reset-safety", async () => {
    requireDatabaseAccess();
    const path = await protectedBackup.createResetSafety();
    return { path };
  });

  handle("academy:backup:restore-latest-automatic", async () => {
    requireDatabaseAccess();
    restoring = true;
    try {
      const { source, safetyBackup } = await protectedBackup.restoreLatestAutomatic();
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);
      return { cancelled: false, restarting: true, source, safetyBackup };
    } catch (error) {
      restoring = false;
      throw error;
    }
  });

  handle("academy:print:html", (payload) => printHtmlDocument(payload));

  handle("academy:app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  handle("academy:app:check-updates", () => updateService.check());
  handle("academy:app:close-ready", (payload) => {
    if (!closeRequested) return { accepted: false };
    if (payload?.ok !== true) {
      const detail = typeof payload?.error === "string" ? payload.error.slice(0, 500) : "تعذر حفظ آخر التعديلات.";
      cancelCloseRequest(detail);
      return { accepted: false };
    }
    clearCloseTimer();
    closeRequested = false;
    closeReady = true;
    app.quit();
    return { accepted: true };
  });
  handle("academy:app:quit", () => {
    requestRendererClose();
    return { quitting: true };
  });
}

function installSessionSecurity() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  if (!isDevelopment) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!allowedOrigin || !details.url.startsWith(allowedOrigin)) return callback({});
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; " +
              "img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
              "script-src 'self' 'unsafe-inline'; connect-src 'self';",
          ],
        },
      });
    });
  }
}

async function createMainWindow(url) {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDevelopment,
    },
  });

  window.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
    if (/^https:\/\//i.test(externalUrl)) void shell.openExternal(externalUrl);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith(allowedOrigin)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (closeReady || restoring) return;
    event.preventDefault();
    requestRendererClose();
  });
  await window.loadURL(url);
  return window;
}

async function bootstrap() {
  const userData = app.getPath("userData");
  mkdirSync(path.join(userData, "logs"), { recursive: true });
  logFile = path.join(userData, "logs", "academy-hub.log");

  const databasePath = path.join(userData, "data", "academy-hub.sqlite");
  const backupDirectory = path.join(userData, "backups");
  database = await AcademyDatabase.open({ databasePath, backupDirectory });
  const automaticPassphrase = await loadOrCreateAutomaticBackupPassphrase(userData);
  protectedBackup = new ProtectedBackupService({ database, backupDirectory, automaticPassphrase });
  licenseManager = await LicenseManager.create({
    licensePath: path.join(userData, "license", "academy.license"),
    publicKeyPath: path.join(__dirname, "resources", "license-public.pem"),
    machineCachePath: path.join(userData, "license", "machine-id.bin"),
    protectMachineId: safeStorage.isEncryptionAvailable()
      ? (value) => safeStorage.encryptString(value)
      : null,
    unprotectMachineId: safeStorage.isEncryptionAvailable()
      ? (value) => safeStorage.decryptString(value)
      : null,
    appVersion: app.getVersion(),
    developmentBypass: isDevelopment,
  });
  updateService = new UpdateService({
    configPath: path.join(__dirname, "resources", "update.json"),
    packaged: app.isPackaged,
    currentVersion: app.getVersion(),
    logger: log,
  });

  const url = isDevelopment ? devServerUrl : await startPackagedWebServer();
  allowedOrigin = new URL(url).origin;
  installSessionSecurity();
  installIpcHandlers();
  mainWindow = await createMainWindow(url);

  setTimeout(() => {
    void protectedBackup.createAutomaticIfDue().catch((error) => log("Automatic backup failed", error));
  }, 10_000).unref();

  if (app.isPackaged) {
    setTimeout(() => void updateService.check(), 15_000).unref();
  }
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.academyhub.desktop");
    Menu.setApplicationMenu(null);
    try {
      await bootstrap();
    } catch (error) {
      log("Startup failed", error);
      await dialog.showMessageBox({
        type: "error",
        title: "Academy Hub",
        message: "تعذر تشغيل Academy Hub.",
        detail: error instanceof Error ? error.message : String(error),
      });
      app.quit();
    }
  });
}

app.on("before-quit", (event) => {
  if (!restoring && mainWindow && !mainWindow.isDestroyed() && !closeReady) {
    event.preventDefault();
    requestRendererClose();
    return;
  }
  app.isQuitting = true;
  clearCloseTimer();
  stopWebServer();
  if (database) {
    try {
      database.close();
    } catch (error) {
      log("Database close failed", error);
    }
    database = null;
    protectedBackup = null;
  }
});

app.on("window-all-closed", () => app.quit());

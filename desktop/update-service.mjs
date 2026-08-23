import { readFile } from "node:fs/promises";

export class UpdateService {
  constructor({ configPath, packaged, currentVersion, logger }) {
    this.configPath = configPath;
    this.packaged = packaged;
    this.currentVersion = currentVersion;
    this.logger = logger;
  }

  async readConfig() {
    try {
      return JSON.parse(await readFile(this.configPath, "utf8"));
    } catch {
      return { enabled: false };
    }
  }

  async check() {
    const config = await this.readConfig();
    if (!this.packaged || config.enabled !== true) {
      return {
        configured: false,
        available: false,
        currentVersion: this.currentVersion,
        message: "خدمة التحديثات غير مفعلة بعد.",
      };
    }
    if (typeof config.feedUrl !== "string" || !/^https:\/\//i.test(config.feedUrl)) {
      return {
        configured: false,
        available: false,
        currentVersion: this.currentVersion,
        message: "رابط التحديثات غير مضبوط.",
      };
    }

    try {
      const updaterModule = await import("electron-updater");
      const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
      if (!autoUpdater) throw new Error("electron-updater is unavailable");
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.setFeedURL({ provider: "generic", url: config.feedUrl });
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version ?? this.currentVersion;
      return {
        configured: true,
        available: latestVersion !== this.currentVersion,
        currentVersion: this.currentVersion,
        latestVersion,
        message: latestVersion !== this.currentVersion ? "يتوفر تحديث جديد." : "البرنامج محدّث.",
      };
    } catch (error) {
      this.logger("Update check failed", error);
      return {
        configured: true,
        available: false,
        currentVersion: this.currentVersion,
        message: "تعذر فحص التحديثات الآن.",
      };
    }
  }
}


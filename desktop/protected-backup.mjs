import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { decryptBackupFile, encryptBackupFile, isEncryptedBackup } from "./backup-crypto.mjs";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.normalize("NFKC").length < 10) {
    throw new Error("كلمة حماية النسخة الاحتياطية يجب أن تكون 10 أحرف على الأقل.");
  }
  return passphrase.normalize("NFKC");
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseMeta(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export class ProtectedBackupService {
  constructor({ database, backupDirectory, automaticPassphrase = null }) {
    this.database = database;
    this.backupDirectory = backupDirectory;
    this.automaticPassphrase = typeof automaticPassphrase === "string" ? automaticPassphrase : null;
  }

  async create(destination, passphrase) {
    const password = assertPassphrase(passphrase);
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = path.join(this.backupDirectory, `.manual-backup-${randomUUID()}.sqlite`);
    try {
      await this.database.createBackup(temporary);
      await encryptBackupFile(temporary, destination, password);
      return destination;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async restore(source, passphrase) {
    const encrypted = await isEncryptedBackup(source);
    if (!encrypted) {
      return this.database.restoreFrom(source);
    }

    const password = assertPassphrase(passphrase);
    const temporary = path.join(this.backupDirectory, `.restore-${randomUUID()}.sqlite`);
    try {
      await decryptBackupFile(source, temporary, password);
      return await this.database.restoreFrom(temporary);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async createAutomaticIfDue() {
    if (!this.automaticPassphrase || !this.database.loadSnapshot()) return null;
    const last = parseMeta(this.database.getMeta("last_auto_backup_at"));
    const lastTime = typeof last === "string" ? Date.parse(last) : 0;
    if (Number.isFinite(lastTime) && Date.now() - lastTime < ONE_DAY_MS) return null;

    await mkdir(this.backupDirectory, { recursive: true });
    const destination = path.join(this.backupDirectory, `academy-hub-auto-${timestamp()}.ahbackup`);
    await this.create(destination, this.automaticPassphrase);
    this.database.setMeta("last_auto_backup_at", new Date().toISOString());
    await this.pruneAutomaticBackups(30);
    return destination;
  }

  async pruneAutomaticBackups(retain = 30) {
    const files = (await readdir(this.backupDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^academy-hub-auto-.*\.(?:ahbackup|sqlite)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const filename of files.slice(Math.max(1, retain))) {
      await rm(path.join(this.backupDirectory, filename), { force: true });
    }
  }
}

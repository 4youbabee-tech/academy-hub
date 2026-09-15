import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { decryptBackupFile, encryptBackupFile, isEncryptedBackup } from "./backup-crypto.mjs";

function assertPassphrase(passphrase) {
  if (typeof passphrase !== "string" || passphrase.normalize("NFKC").length < 10) {
    throw new Error("كلمة حماية النسخة الاحتياطية يجب أن تكون 10 أحرف على الأقل.");
  }
  return passphrase.normalize("NFKC");
}

export class ProtectedBackupService {
  constructor({ database, backupDirectory }) {
    this.database = database;
    this.backupDirectory = backupDirectory;
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
}

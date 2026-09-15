import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { decryptBackupFile, encryptBackupFile, isEncryptedBackup } from "../desktop/backup-crypto.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "academy-backup-crypto-"));
try {
  const source = path.join(temp, "source.sqlite");
  const encrypted = path.join(temp, "backup.ahbackup");
  const restored = path.join(temp, "restored.sqlite");
  const original = Buffer.concat([Buffer.from("SQLite format 3\0"), randomBytes(4096)]);
  const passphrase = "Academy Backup 2026!";

  await writeFile(source, original);
  await encryptBackupFile(source, encrypted, passphrase);
  assert.equal(await isEncryptedBackup(encrypted), true);
  assert.equal(await isEncryptedBackup(source), false);
  assert.equal((await readFile(encrypted)).includes(Buffer.from("SQLite format 3\0")), false);

  await decryptBackupFile(encrypted, restored, passphrase);
  assert.deepEqual(await readFile(restored), original);
  await assert.rejects(() => decryptBackupFile(encrypted, restored, "Wrong Password 123!"), /تعذر فك النسخة/);
  await assert.rejects(() => encryptBackupFile(source, encrypted, "short"), /10 أحرف/);

  console.log("backup-crypto-harness: OK");
} finally {
  await rm(temp, { recursive: true, force: true });
}

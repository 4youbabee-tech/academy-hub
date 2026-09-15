import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AcademyDatabase } from "../desktop/database.mjs";
import { ProtectedBackupService } from "../desktop/protected-backup.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "academy-protected-backup-"));
const databasePath = path.join(temp, "data", "academy.sqlite");
const backupDirectory = path.join(temp, "backups");
const protectedPath = path.join(temp, "portable.ahbackup");
const legacyPath = path.join(temp, "legacy.sqlite");
const passphrase = "Academy Portable Backup 2026!";
const now = new Date().toISOString();

const emptyCollections = {
  courses: [], classes: [], enrollments: [], invoices: [], installments: [], payments: [], employees: [],
  payroll_items: [], payroll_payments: [], advances: [], expenses: [], incomes: [], audit_log: [],
};
const snapshot = {
  schema_version: 4,
  settings: { institute_name: "اختبار النسخة المشفرة", currency: "USD" },
  expense_categories: [],
  users: [{ id: "owner", created_at: now, updated_at: now, branch_id: "main", sync_status: "local", username: "owner", full_name: "مالك", password_hash: "x", role: "owner", is_active: true }],
  students: [{ id: "student-1", created_at: now, updated_at: now, branch_id: "main", sync_status: "local", code: "ST-1", full_name: "طالب محمي", status: "active" }],
  ...emptyCollections,
};

let database;
try {
  database = await AcademyDatabase.open({ databasePath, backupDirectory });
  database.saveSnapshot(snapshot);
  const service = new ProtectedBackupService({ database, backupDirectory, automaticPassphrase: "Device-Automatic-Secret-123456789" });

  await service.create(protectedPath, passphrase);
  const protectedBytes = await readFile(protectedPath);
  assert.equal(protectedBytes.subarray(0, 5).toString("ascii"), "AHBK2");
  assert.equal(protectedBytes.includes(Buffer.from("SQLite format 3\0")), false);
  assert.equal(protectedBytes.includes(Buffer.from("طالب محمي", "utf8")), false);

  database.saveSnapshot({ ...snapshot, students: [] });
  assert.equal(database.loadSnapshot().students.length, 0);
  await service.restore(protectedPath, passphrase);
  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي");

  database.saveSnapshot({ ...snapshot, students: [] });
  await assert.rejects(() => service.restore(protectedPath, "Wrong Restore Password!"), /كلمة الحماية غير صحيحة|تعذر فك النسخة/);
  assert.equal(database.loadSnapshot().students.length, 0, "failed decrypt must preserve current data");

  database.saveSnapshot(snapshot);
  await database.createBackup(legacyPath);
  database.saveSnapshot({ ...snapshot, students: [] });
  await service.restore(legacyPath, passphrase);
  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "legacy SQLite backup remains restorable");

  database.setMeta("last_auto_backup_at", null);
  const automatic = await service.createAutomaticIfDue();
  assert.ok(automatic?.endsWith(".ahbackup"), "automatic backup must use encrypted .ahbackup format");
  const automaticBytes = await readFile(automatic);
  assert.equal(automaticBytes.subarray(0, 5).toString("ascii"), "AHBK2");
  assert.equal(automaticBytes.includes(Buffer.from("SQLite format 3\0")), false, "automatic backup must hide SQLite header");
  assert.equal(automaticBytes.includes(Buffer.from("طالب محمي", "utf8")), false, "automatic backup must hide student data");

  database.saveSnapshot({ ...snapshot, students: [] });
  const automaticRestore = await service.restoreLatestAutomatic();
  assert.equal(automaticRestore.source, automatic);
  assert.equal(database.loadSnapshot().students[0]?.full_name, "طالب محمي", "automatic backup must restore on same device secret");

  console.log("protected-backup-harness: OK");
} finally {
  if (database) database.close();
  await rm(temp, { recursive: true, force: true });
}

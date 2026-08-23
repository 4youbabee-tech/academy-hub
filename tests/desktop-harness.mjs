import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AcademyDatabase } from "../desktop/database.mjs";
import { calculateMachineId, canonicalJson, verifyLicenseDocument } from "../desktop/licensing.mjs";

const temp = await mkdtemp(path.join(os.tmpdir(), "academy-hub-desktop-test-"));
const databasePath = path.join(temp, "data", "academy-hub.sqlite");
const backupDirectory = path.join(temp, "backups");
const backupPath = path.join(temp, "manual.sqlite");

const collections = {
  users: [],
  students: [],
  courses: [],
  classes: [],
  enrollments: [],
  invoices: [],
  installments: [],
  payments: [],
  employees: [],
  payroll_items: [],
  advances: [],
  expenses: [],
  incomes: [],
  audit_log: [],
};

const now = new Date().toISOString();
const snapshot = {
  schema_version: 3,
  settings: { institute_name: "اختبار Academy Hub", currency: "USD" },
  expense_categories: ["إيجار"],
  ...collections,
  students: [
    {
      id: "student-1",
      created_at: now,
      updated_at: now,
      branch_id: "main",
      sync_status: "local",
      code: "ST-0001",
      full_name: "طالب اختبار",
      status: "active",
    },
  ],
};

let database;
try {
  database = await AcademyDatabase.open({ databasePath, backupDirectory });
  assert.equal(database.loadSnapshot(), undefined);
  database.saveSnapshot(snapshot);
  assert.equal(database.loadSnapshot().students[0].full_name, "طالب اختبار");
  assert.equal(database.getPage("students", { limit: 10, search: "اختبار" }).total, 1);

  await database.createBackup(backupPath);
  database.saveSnapshot({ ...snapshot, students: [] });
  assert.equal(database.loadSnapshot().students.length, 0);
  await database.restoreFrom(backupPath);
  assert.equal(database.loadSnapshot().students.length, 1);

  const largeStudentSet = Array.from({ length: 2_500 }, (_, index) => ({
    ...snapshot.students[0],
    id: `student-${index + 1}`,
    code: `ST-${String(index + 1).padStart(4, "0")}`,
    full_name: `طالب اختبار ${index + 1}`,
  }));
  database.saveSnapshot({ ...snapshot, students: largeStudentSet });
  const lastPage = database.getPage("students", { limit: 20, offset: 2_480 });
  assert.equal(lastPage.total, 2_500);
  assert.equal(lastPage.rows.length, 20);
  assert.equal(lastPage.rows[19].id, "student-2500");

  const machineId = await calculateMachineId();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = {
    customer: "Test Customer",
    machineId,
    product: "academy-hub",
    edition: "standard",
    issuedAt: now,
    expiresAt: null,
    allowedMajorVersion: 1,
  };
  const license = {
    format: 1,
    payload,
    signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64"),
  };
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  assert.equal(verifyLicenseDocument(license, machineId, publicKeyPem, "1.0.0").valid, true);
  assert.equal(
    verifyLicenseDocument({ ...license, payload: { ...payload, customer: "Tampered" } }, machineId, publicKeyPem, "1.0.0").valid,
    false,
  );

  console.log("Desktop SQLite (2,500 rows), paging, backup/restore, machine ID, and signed license checks passed.");
} finally {
  if (database) database.close();
  await rm(temp, { recursive: true, force: true });
}

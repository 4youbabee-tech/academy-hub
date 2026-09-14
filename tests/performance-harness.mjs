import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AcademyDatabase } from "../desktop/database.mjs";

const RECORD_COUNT = 50_000;
const temp = await mkdtemp(path.join(os.tmpdir(), "academy-hub-perf-"));
const databasePath = path.join(temp, "data", "academy-hub.sqlite");
const backupDirectory = path.join(temp, "backups");
const now = new Date().toISOString();
const base = {
  id: "", created_at: now, updated_at: now, branch_id: "main", sync_status: "local",
  code: "", full_name: "", birth_date: null, gender: "", phone: "", guardian_name: "",
  guardian_phone: "", mother_name: "", school_name: "", address: "", education_level: null,
  status: "active", archived_at: null, notes: "",
};
const students = Array.from({ length: RECORD_COUNT }, (_, index) => ({
  ...base,
  id: `student-${index + 1}`,
  code: `ST-${String(index + 1).padStart(6, "0")}`,
  full_name: `طالب أداء ${index + 1}`,
  phone: `70${String(index).padStart(7, "0")}`,
}));
const emptyCollections = {
  courses: [], classes: [], enrollments: [], invoices: [], installments: [], payments: [], employees: [],
  payroll_items: [], payroll_payments: [], advances: [], expenses: [], incomes: [], audit_log: [],
};
const snapshot = {
  schema_version: 4,
  settings: { institute_name: "اختبار الأداء", currency: "USD" },
  expense_categories: [],
  users: [{ id: "owner-perf", created_at: now, updated_at: now, branch_id: "main", sync_status: "local", username: "owner", full_name: "مالك", password_hash: "x", role: "owner", is_active: true }],
  students,
  ...emptyCollections,
};

let database;
try {
  database = await AcademyDatabase.open({ databasePath, backupDirectory });

  let started = performance.now();
  database.saveSnapshot(snapshot);
  const firstSaveMs = performance.now() - started;
  assert.ok(firstSaveMs < 30_000, `initial 50k save too slow: ${Math.round(firstSaveMs)}ms`);

  started = performance.now();
  const loaded = database.loadSnapshot();
  const loadMs = performance.now() - started;
  assert.equal(loaded.students.length, RECORD_COUNT);
  assert.ok(loadMs < 15_000, `50k load too slow: ${Math.round(loadMs)}ms`);

  started = performance.now();
  const page = database.getPage("students", { limit: 50, offset: RECORD_COUNT - 50 });
  const pageMs = performance.now() - started;
  assert.equal(page.total, RECORD_COUNT);
  assert.equal(page.rows.length, 50);
  assert.equal(page.rows[49].id, `student-${RECORD_COUNT}`);
  assert.ok(pageMs < 2_000, `paged query too slow: ${Math.round(pageMs)}ms`);

  started = performance.now();
  const search = database.getPage("students", { limit: 20, search: "أداء 49999" });
  const searchMs = performance.now() - started;
  assert.equal(search.total, 1);
  assert.equal(search.rows[0]?.id, "student-49999");
  assert.ok(searchMs < 5_000, `50k search too slow: ${Math.round(searchMs)}ms`);

  const changed = students.slice();
  changed[RECORD_COUNT - 1] = { ...changed[RECORD_COUNT - 1], full_name: `طالب أداء معدل ${RECORD_COUNT}`, updated_at: new Date().toISOString() };
  started = performance.now();
  database.saveSnapshot({ ...snapshot, students: changed });
  const incrementalSaveMs = performance.now() - started;
  assert.equal(database.getPage("students", { limit: 10, search: `معدل ${RECORD_COUNT}` }).total, 1);
  assert.ok(incrementalSaveMs < 18_000, `incremental 50k snapshot save too slow: ${Math.round(incrementalSaveMs)}ms`);

  console.log(`performance-harness: OK (${RECORD_COUNT} records save=${Math.round(firstSaveMs)}ms load=${Math.round(loadMs)}ms page=${Math.round(pageMs)}ms search=${Math.round(searchMs)}ms incremental=${Math.round(incrementalSaveMs)}ms)`);
} finally {
  if (database) database.close();
  await rm(temp, { recursive: true, force: true });
}

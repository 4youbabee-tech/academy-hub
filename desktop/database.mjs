import { backup as sqliteBackup, DatabaseSync } from "node:sqlite";
import { mkdir, copyFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const DATABASE_SCHEMA_VERSION = 1;
const COLLECTIONS = [
  "users",
  "students",
  "courses",
  "classes",
  "enrollments",
  "invoices",
  "installments",
  "payments",
  "employees",
  "payroll_items",
  "advances",
  "expenses",
  "incomes",
  "audit_log",
];
const COLLECTION_SET = new Set(COLLECTIONS);

function localFileTimestamp(date = new Date()) {
  const part = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    part(date.getMonth() + 1),
    part(date.getDate()),
    "-",
    part(date.getHours()),
    part(date.getMinutes()),
    part(date.getSeconds()),
  ].join("");
}

function json(value) {
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function recordIndexFields(record) {
  const dateKey =
    record.paid_at ??
    record.date ??
    record.issued_at ??
    record.enrolled_at ??
    record.at ??
    record.period ??
    record.created_at ??
    null;
  const numberKey =
    record.receipt_no ?? record.number ?? record.code ?? record.username ?? record.full_name ?? null;

  return {
    status: typeof record.status === "string" ? record.status : null,
    studentId: typeof record.student_id === "string" ? record.student_id : null,
    classId: typeof record.class_id === "string" ? record.class_id : null,
    invoiceId: typeof record.invoice_id === "string" ? record.invoice_id : null,
    enrollmentId: typeof record.enrollment_id === "string" ? record.enrollment_id : null,
    employeeId: typeof record.employee_id === "string" ? record.employee_id : null,
    dateKey: typeof dateKey === "string" ? dateKey : null,
    numberKey: typeof numberKey === "string" ? numberKey : null,
    isVoid: typeof record.is_void === "boolean" ? (record.is_void ? 1 : 0) : null,
  };
}

export class AcademyDatabase {
  static async open({ databasePath, backupDirectory }) {
    await mkdir(path.dirname(databasePath), { recursive: true });
    await mkdir(backupDirectory, { recursive: true });
    const instance = new AcademyDatabase(databasePath, backupDirectory);
    await instance.initialize();
    return instance;
  }

  constructor(databasePath, backupDirectory) {
    this.databasePath = databasePath;
    this.backupDirectory = backupDirectory;
    this.db = new DatabaseSync(databasePath);
  }

  configure() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
    `);
  }

  async initialize() {
    this.configure();
    const currentVersionRow = this.db.prepare("PRAGMA user_version").get();
    const currentVersion = Number(currentVersionRow?.user_version ?? 0);

    if (currentVersion > 0 && currentVersion < DATABASE_SCHEMA_VERSION) {
      await this.createBackup(path.join(
        this.backupDirectory,
        `academy-hub-before-migration-v${currentVersion}-${localFileTimestamp()}.sqlite`,
      ));
    }

    this.runMigrations(currentVersion);
  }

  runMigrations(currentVersion) {
    if (currentVersion >= DATABASE_SCHEMA_VERSION) return;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (currentVersion < 1) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS entities (
            collection TEXT NOT NULL,
            id TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at TEXT,
            updated_at TEXT,
            branch_id TEXT,
            sync_status TEXT,
            status TEXT,
            student_id TEXT,
            class_id TEXT,
            invoice_id TEXT,
            enrollment_id TEXT,
            employee_id TEXT,
            date_key TEXT,
            number_key TEXT,
            is_void INTEGER,
            data_json TEXT NOT NULL,
            PRIMARY KEY (collection, id)
          );

          CREATE INDEX IF NOT EXISTS idx_entities_collection_position
            ON entities(collection, position);
          CREATE INDEX IF NOT EXISTS idx_entities_collection_status
            ON entities(collection, status);
          CREATE INDEX IF NOT EXISTS idx_entities_student_status
            ON entities(collection, student_id, status);
          CREATE INDEX IF NOT EXISTS idx_entities_class_status
            ON entities(collection, class_id, status);
          CREATE INDEX IF NOT EXISTS idx_entities_invoice_void_date
            ON entities(collection, invoice_id, is_void, date_key);
          CREATE INDEX IF NOT EXISTS idx_entities_employee_status
            ON entities(collection, employee_id, status);
          CREATE INDEX IF NOT EXISTS idx_entities_date
            ON entities(collection, date_key);
          CREATE INDEX IF NOT EXISTS idx_entities_updated
            ON entities(collection, updated_at);
          CREATE INDEX IF NOT EXISTS idx_entities_number
            ON entities(collection, number_key);
        `);
        this.db
          .prepare("INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
          .run(1, new Date().toISOString());
      }

      this.db.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getMeta(key) {
    const row = this.db.prepare("SELECT value_json FROM app_meta WHERE key = ?").get(key);
    return row?.value_json;
  }

  setMeta(key, value) {
    this.db
      .prepare(`
        INSERT INTO app_meta(key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `)
      .run(key, json(value), new Date().toISOString());
  }

  loadSnapshot() {
    const schemaVersion = parseJson(this.getMeta("schema_version"), undefined);
    const settings = parseJson(this.getMeta("settings"), undefined);
    if (typeof schemaVersion !== "number" || !settings || typeof settings !== "object") {
      return undefined;
    }

    const result = {
      schema_version: schemaVersion,
      settings,
      expense_categories: parseJson(this.getMeta("expense_categories"), []),
    };

    const statement = this.db.prepare(`
      SELECT data_json
      FROM entities
      WHERE collection = ?
      ORDER BY position ASC
    `);
    for (const collection of COLLECTIONS) {
      result[collection] = statement
        .all(collection)
        .map((row) => parseJson(row.data_json, null))
        .filter(Boolean);
    }

    return result;
  }

  saveSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Invalid database snapshot.");
    if (!snapshot.settings || typeof snapshot.settings !== "object") {
      throw new Error("Database settings are missing.");
    }

    const selectExisting = this.db.prepare(
      "SELECT id, position, data_json FROM entities WHERE collection = ?",
    );
    const upsert = this.db.prepare(`
      INSERT INTO entities(
        collection, id, position, created_at, updated_at, branch_id, sync_status,
        status, student_id, class_id, invoice_id, enrollment_id, employee_id,
        date_key, number_key, is_void, data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        position = excluded.position,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        branch_id = excluded.branch_id,
        sync_status = excluded.sync_status,
        status = excluded.status,
        student_id = excluded.student_id,
        class_id = excluded.class_id,
        invoice_id = excluded.invoice_id,
        enrollment_id = excluded.enrollment_id,
        employee_id = excluded.employee_id,
        date_key = excluded.date_key,
        number_key = excluded.number_key,
        is_void = excluded.is_void,
        data_json = excluded.data_json
    `);
    const remove = this.db.prepare("DELETE FROM entities WHERE collection = ? AND id = ?");

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.setMeta("schema_version", Number(snapshot.schema_version) || 1);
      this.setMeta("settings", snapshot.settings);
      this.setMeta("expense_categories", Array.isArray(snapshot.expense_categories) ? snapshot.expense_categories : []);

      for (const collection of COLLECTIONS) {
        const records = Array.isArray(snapshot[collection]) ? snapshot[collection] : [];
        const existing = new Map(
          selectExisting
            .all(collection)
            .map((row) => [row.id, { position: Number(row.position), dataJson: row.data_json }]),
        );
        const incomingIds = new Set();

        records.forEach((record, position) => {
          if (!record || typeof record !== "object" || typeof record.id !== "string") {
            throw new Error(`Invalid record in ${collection}.`);
          }
          incomingIds.add(record.id);
          const dataJson = json(record);
          const previous = existing.get(record.id);
          if (previous?.position === position && previous.dataJson === dataJson) return;

          const index = recordIndexFields(record);
          upsert.run(
            collection,
            record.id,
            position,
            record.created_at ?? null,
            record.updated_at ?? null,
            record.branch_id ?? null,
            record.sync_status ?? null,
            index.status,
            index.studentId,
            index.classId,
            index.invoiceId,
            index.enrollmentId,
            index.employeeId,
            index.dateKey,
            index.numberKey,
            index.isVoid,
            dataJson,
          );
        });

        for (const id of existing.keys()) {
          if (!incomingIds.has(id)) remove.run(collection, id);
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getPage(collection, request = {}) {
    if (!COLLECTION_SET.has(collection)) throw new Error("Unknown collection.");
    const limit = [10, 20, 50].includes(Number(request.limit)) ? Number(request.limit) : 20;
    const offset = Math.max(0, Number(request.offset) || 0);
    const search = typeof request.search === "string" ? request.search.trim() : "";
    const where = search ? "collection = ? AND (number_key LIKE ? OR data_json LIKE ?)" : "collection = ?";
    const params = search ? [collection, `%${search}%`, `%${search}%`] : [collection];
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS total FROM entities WHERE ${where}`).get(...params);
    const rows = this.db
      .prepare(`SELECT data_json FROM entities WHERE ${where} ORDER BY position ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
      .map((row) => parseJson(row.data_json, null))
      .filter(Boolean);

    return { rows, total: Number(totalRow?.total ?? 0) };
  }

  async createBackup(destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(destination, { force: true });
    await sqliteBackup(this.db, destination);
    return destination;
  }

  async createAutomaticBackupIfDue() {
    if (!this.loadSnapshot()) return null;
    const last = parseJson(this.getMeta("last_auto_backup_at"), null);
    const lastTime = typeof last === "string" ? Date.parse(last) : 0;
    if (Number.isFinite(lastTime) && Date.now() - lastTime < 24 * 60 * 60 * 1000) return null;

    const destination = path.join(
      this.backupDirectory,
      `academy-hub-auto-${localFileTimestamp()}.sqlite`,
    );
    await this.createBackup(destination);
    this.setMeta("last_auto_backup_at", new Date().toISOString());
    await this.pruneAutomaticBackups(30);
    return destination;
  }

  async pruneAutomaticBackups(retain) {
    const files = (await readdir(this.backupDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^academy-hub-auto-.*\.sqlite$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const filename of files.slice(retain)) {
      await rm(path.join(this.backupDirectory, filename), { force: true });
    }
  }

  async validateBackup(source) {
    const info = await stat(source);
    if (!info.isFile() || info.size < 512) throw new Error("ملف النسخة الاحتياطية غير صالح.");
    const candidate = new DatabaseSync(source, { readOnly: true });
    try {
      const table = candidate
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'")
        .get();
      if (!table) throw new Error("الملف ليس نسخة SQLite صالحة لـ Academy Hub.");
    } finally {
      candidate.close();
    }
  }

  async restoreFrom(source) {
    await this.validateBackup(source);
    const safetyBackup = path.join(
      this.backupDirectory,
      `academy-hub-before-restore-${localFileTimestamp()}.sqlite`,
    );
    await this.createBackup(safetyBackup);

    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.close();
    await rm(`${this.databasePath}-wal`, { force: true });
    await rm(`${this.databasePath}-shm`, { force: true });

    try {
      await copyFile(source, this.databasePath);
      this.db = new DatabaseSync(this.databasePath);
      await this.initialize();
    } catch (error) {
      await copyFile(safetyBackup, this.databasePath);
      this.db = new DatabaseSync(this.databasePath);
      await this.initialize();
      throw error;
    }

    return safetyBackup;
  }

  close() {
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      this.db.close();
    }
  }
}

export const ACADEMY_COLLECTIONS = Object.freeze([...COLLECTIONS]);

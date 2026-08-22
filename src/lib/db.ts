import type { Base, CollectionKey, DB, ID, Settings, User } from "./types";

const DB_NAME = "institute-db";
const STORE = "kv";
const KEY = "main";
export const SCHEMA_VERSION = 2;

/* ---------------- IndexedDB primitives ---------------- */

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------------- helpers ---------------- */

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`inst::${pw}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function baseFields(): Base {
  const now = new Date().toISOString();
  return { id: uid(), created_at: now, updated_at: now, branch_id: "main", sync_status: "local" };
}

export function emptyDb(): DB {
  return {
    schema_version: SCHEMA_VERSION,
    settings: {
      institute_name: "معهد النور",
      logo_data_url: null,
      director_name: "",
      phone: "",
      address: "",
      currency: "USD",
      academic_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      receipt_prefix: "R-",
      receipt_next: 1,
      student_code_prefix: "ST-",
      student_code_next: 1,
      receipt_show_logo: true,
      receipt_paper_size: "A5",
      receipt_show_payment_method: true,
      receipt_show_guardian: true,
      receipt_show_notes: true,
      receipt_footer_text: "شكراً لثقتكم بنا",
    },
    expense_categories: ["إيجار", "كهرباء", "قرطاسية", "صيانة", "تسويق", "أخرى"],
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
}

/**
 * Upgrades old local databases to the current lightweight schema.
 * Attendance, exams, grades and certificates were removed from Academy Hub,
 * so their legacy data is intentionally discarded during this migration.
 */
function normalizeDb(value: unknown): DB {
  const base = emptyDb();
  if (!value || typeof value !== "object") return base;

  const raw = value as Record<string, unknown>;
  const {
    attendance: _attendance,
    exams: _exams,
    grades: _grades,
    grade_revisions: _gradeRevisions,
    certificates: _certificates,
    settings: _settings,
    schema_version: _schemaVersion,
    ...rest
  } = raw;

  const rawSettings = raw.settings && typeof raw.settings === "object"
    ? (raw.settings as Record<string, unknown>)
    : {};

  const {
    grading: _grading,
    certificate_prefix: _certificatePrefix,
    certificate_next: _certificateNext,
    ...settingsRest
  } = rawSettings;

  return {
    ...base,
    ...(rest as Partial<DB>),
    schema_version: SCHEMA_VERSION,
    settings: {
      ...base.settings,
      ...(settingsRest as Partial<Settings>),
    },
  };
}

/* ---------------- in-memory store + subscriptions ---------------- */

let current: DB | null = null;
let loading: Promise<DB> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function snapshot(): DB | null {
  return current;
}

export async function loadDb(): Promise<DB> {
  if (current) return current;
  if (loading) return loading;
  loading = (async () => {
    const stored = await idbGet<unknown>(KEY);
    if (stored) {
      current = normalizeDb(stored);
      await idbSet(KEY, current);
    } else {
      const fresh = emptyDb();
      const now = new Date().toISOString();
      const owner: User = {
        ...baseFields(),
        username: "owner",
        full_name: "مالك النظام",
        password_hash: await hashPassword("owner123"),
        role: "owner",
        is_active: true,
      };
      fresh.users.push(owner);
      fresh.audit_log.push({
        ...baseFields(),
        user_id: null,
        user_name: "النظام",
        entity: "system",
        entity_id: null,
        action: "init",
        detail: "تهيئة قاعدة البيانات المحلية",
        at: now,
      });
      current = fresh;
      await idbSet(KEY, fresh);
    }
    notify();
    return current;
  })();
  return loading;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (current) void idbSet(KEY, current);
  }, 120);
}

/** Single atomic mutation: the whole recipe applies or nothing does. */
export function transact(recipe: (db: DB) => void): void {
  if (!current) throw new Error("DB not loaded");
  const draft: DB = structuredClone(current);
  recipe(draft);
  current = draft;
  persist();
  notify();
}

export function replaceDb(next: DB): void {
  current = normalizeDb(next);
  persist();
  notify();
}

/* ---------------- audit + generic CRUD ---------------- */

export interface Actor {
  id: ID | null;
  name: string;
}

export function audit(
  db: DB,
  actor: Actor,
  entity: string,
  entity_id: ID | null,
  action: string,
  detail: string,
) {
  db.audit_log.unshift({
    ...baseFields(),
    user_id: actor.id,
    user_name: actor.name,
    entity,
    entity_id,
    action,
    detail,
    at: new Date().toISOString(),
  });
  if (db.audit_log.length > 5000) db.audit_log.length = 5000;
}

export function insert<K extends CollectionKey>(
  key: K,
  data: Omit<DB[K][number], keyof Base>,
  actor: Actor,
  detail: string,
): ID {
  const record = { ...baseFields(), ...data } as DB[K][number];
  transact((db) => {
    (db[key] as DB[K][number][]).push(record);
    audit(db, actor, key, (record as Base).id, "create", detail);
  });
  return (record as Base).id;
}

export function update<K extends CollectionKey>(
  key: K,
  id: ID,
  patch: Partial<DB[K][number]>,
  actor: Actor,
  detail: string,
): void {
  transact((db) => {
    const list = db[key] as unknown as Base[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("السجل غير موجود");
    list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() } as Base;
    audit(db, actor, key, id, "update", detail);
  });
}

export function remove<K extends CollectionKey>(key: K, id: ID, actor: Actor, detail: string): void {
  transact((db) => {
    const list = db[key] as unknown as Base[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return;
    list.splice(idx, 1);
    audit(db, actor, key, id, "delete", detail);
  });
}

/* ---------------- sequence helpers ---------------- */

export function nextReceiptNo(db: DB): string {
  const n = db.settings.receipt_next;
  db.settings.receipt_next = n + 1;
  return `${db.settings.receipt_prefix}${String(n).padStart(5, "0")}`;
}

export function nextStudentCode(db: DB): string {
  const n = db.settings.student_code_next;
  db.settings.student_code_next = n + 1;
  return `${db.settings.student_code_prefix}${String(n).padStart(4, "0")}`;
}

import type { Base, CollectionKey, DB, ID, Settings, User } from "./types";
import { createIndexedDbStorage } from "./storage";
import {
  assertClassUpdate,
  assertStudentUpdate,
  assertUserCreate,
  assertUserDelete,
  assertUserUpdate,
} from "./domain-guards";

const DB_NAME = "institute-db";
const STORE = "kv";
const KEY = "main";
export const SCHEMA_VERSION = 4;

const storage = createIndexedDbStorage<DB>({ databaseName: DB_NAME, storeName: STORE, key: KEY });

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
      discount_presets: [],
      monthly_generation_last_period: null,
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
    payroll_payments: [],
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

  const rawSettings = raw["settings"] && typeof raw["settings"] === "object"
    ? (raw["settings"] as Record<string, unknown>)
    : {};

  const {
    grading: _grading,
    certificate_prefix: _certificatePrefix,
    certificate_next: _certificateNext,
    ...settingsRest
  } = rawSettings;

  const source = rest as Partial<DB>;
  const array = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

  return {
    ...base,
    ...source,
    schema_version: SCHEMA_VERSION,
    settings: {
      ...base.settings,
      ...(settingsRest as Partial<Settings>),
      discount_presets: Array.isArray(settingsRest["discount_presets"])
        ? settingsRest["discount_presets"] as Settings["discount_presets"]
        : [],
    },
    students: array<DB["students"][number]>(source.students).map((student) => ({
      ...student,
      mother_name: typeof student.mother_name === "string" ? student.mother_name : "",
      school_name: typeof student.school_name === "string" ? student.school_name : "",
    })),
    enrollments: array<DB["enrollments"][number]>(source.enrollments).map((enrollment) => ({
      ...enrollment,
      billing_mode: enrollment.billing_mode ?? "legacy",
      billing_start_period: enrollment.billing_start_period ?? null,
      billing_end_period: enrollment.billing_end_period ?? null,
      monthly_price_snapshot: enrollment.monthly_price_snapshot ?? 0,
      discount_preset_id: enrollment.discount_preset_id ?? null,
      discount_title_snapshot: enrollment.discount_title_snapshot ?? enrollment.discount_reason ?? "",
    })),
    installments: array<DB["installments"][number]>(source.installments).map((installment) => ({
      ...installment,
      period: installment.period ?? null,
      is_void: installment.is_void ?? false,
      void_reason: installment.void_reason ?? "",
      voided_at: installment.voided_at ?? null,
    })),
    employees: array<DB["employees"][number]>(source.employees).map((employee) => ({
      ...employee,
      ended_at: employee.ended_at ?? null,
    })),
    advances: array<DB["advances"][number]>(source.advances).map((advance) => ({
      ...advance,
      allocated_payroll_id: advance.allocated_payroll_id ?? null,
      settled_at: advance.settled_at ?? null,
    })),
    payroll_payments: array<DB["payroll_payments"][number]>(source.payroll_payments),
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
    const stored = await storage.load();
    if (stored) {
      current = normalizeDb(stored);
      await storage.save(current);
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
      await storage.save(fresh);
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
    if (current) void storage.save(current).catch((error: unknown) => console.error("تعذر حفظ قاعدة البيانات المحلية", error));
  }, 120);
}

/** Ensures pending in-memory changes are written before an explicit export/close workflow. */
export async function flushDb(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (current) await storage.save(current);
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

const PROTECTED_FINANCIAL_COLLECTIONS = new Set<CollectionKey>([
  "enrollments",
  "invoices",
  "installments",
  "payments",
  "payroll_items",
  "payroll_payments",
  "advances",
  "expenses",
  "incomes",
]);

function assertGenericFinancialMutationAllowed(key: CollectionKey): void {
  if (PROTECTED_FINANCIAL_COLLECTIONS.has(key)) {
    throw new Error("السجلات المالية لا تُعدّل أو تُحذف مباشرة. استخدم العملية المالية المخصصة مع سجل التدقيق.");
  }
}

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
    if (key === "users") assertUserCreate(db, record as User, actor);
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
  assertGenericFinancialMutationAllowed(key);
  transact((db) => {
    const list = db[key] as unknown as Base[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("السجل غير موجود");
    if (key === "students") {
      assertStudentUpdate(db, list[idx] as DB["students"][number], patch as Partial<DB["students"][number]>);
    }
    if (key === "classes") {
      assertClassUpdate(db, list[idx] as DB["classes"][number], patch as Partial<DB["classes"][number]>);
    }
    if (key === "users") {
      assertUserUpdate(db, list[idx] as User, patch as Partial<User>, actor);
    }
    list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() } as Base;
    audit(db, actor, key, id, "update", detail);
  });
}

export function remove<K extends CollectionKey>(key: K, id: ID, actor: Actor, detail: string): void {
  assertGenericFinancialMutationAllowed(key);
  transact((db) => {
    const list = db[key] as unknown as Base[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return;
    if (key === "users") assertUserDelete(db, list[idx] as User, actor);
    list.splice(idx, 1);
    audit(db, actor, key, id, "delete", detail);
  });
}

/* ---------------- sequence helpers ---------------- */

export function nextReceiptNo(db: DB): string {
  let n = Math.max(1, db.settings.receipt_next);
  let candidate = "";
  do {
    candidate = `${db.settings.receipt_prefix}${String(n).padStart(5, "0")}`;
    n += 1;
  } while (db.payments.some((payment) => payment.receipt_no === candidate));
  db.settings.receipt_next = n;
  return candidate;
}

export function nextStudentCode(db: DB): string {
  let n = Math.max(1, db.settings.student_code_next);
  let candidate = "";
  do {
    candidate = `${db.settings.student_code_prefix}${String(n).padStart(4, "0")}`;
    n += 1;
  } while (db.students.some((student) => student.code === candidate));
  db.settings.student_code_next = n;
  return candidate;
}

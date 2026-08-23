import type { CollectionKey, DB, ID } from "./types";

export interface PageRequest {
  limit: 10 | 20 | 50;
  offset?: number;
  cursor?: string;
  search?: string;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  nextCursor?: string;
}

/**
 * Contract for a future query-backed repository. The current IndexedDB store
 * remains local and in-memory; SQLite can implement this contract with
 * LIMIT/OFFSET or cursors without changing screen-level pagination controls.
 */
export interface AcademyRepository {
  load(): Promise<DB>;
  getById<K extends CollectionKey>(collection: K, id: ID): Promise<DB[K][number] | undefined>;
  getPage<K extends CollectionKey>(collection: K, request: PageRequest): Promise<PageResult<DB[K][number]>>;
}

export const SQLITE_INDEX_PLAN = [
  "students(status, full_name)",
  "enrollments(student_id, status)",
  "enrollments(class_id, status)",
  "invoices(student_id, status, issued_at)",
  "payments(invoice_id, is_void, paid_at)",
  "payments(student_id, is_void, paid_at)",
  "expenses(is_void, date)",
  "payroll_items(period, status)",
  "audit_log(at, entity, action)",
] as const;

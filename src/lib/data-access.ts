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
 * Contract shared by browser and desktop repositories. The desktop preload
 * implements paging with indexed SQLite LIMIT/OFFSET queries, while the
 * existing screen-level controls remain unchanged.
 */
export interface AcademyRepository {
  load(): Promise<DB>;
  getById<K extends CollectionKey>(collection: K, id: ID): Promise<DB[K][number] | undefined>;
  getPage<K extends CollectionKey>(collection: K, request: PageRequest): Promise<PageResult<DB[K][number]>>;
}

export function createDesktopRepository(): AcademyRepository | null {
  if (typeof window === "undefined" || !window.academyDesktop) return null;
  const api = window.academyDesktop.database;
  return {
    async load() {
      const database = await api.load();
      if (!database) throw new Error("قاعدة بيانات Desktop غير مهيأة بعد.");
      return database;
    },
    async getById(collection, id) {
      const page = await api.getPage<DB[typeof collection][number]>(collection, {
        limit: 50,
        search: id,
      });
      return page.rows.find((row) => row.id === id);
    },
    async getPage(collection, request) {
      return api.getPage<DB[typeof collection][number]>(collection, request);
    },
  };
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
  "payroll_payments(employee_id, is_void, paid_at)",
  "audit_log(at, entity, action)",
] as const;

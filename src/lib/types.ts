/ Domain types. Money is stored in minor units (integers) everywhere.

export type ID = string;

export interface Base {
  id: ID;
  created_at: string;
  updated_at: string;
  branch_id: ID;
  sync_status: "local" | "synced";
}

export type PermissionKey = string; // "entity.action"

export interface Settings {
  institute_name: string;
  logo_data_url: string | null;
  director_name: string;
  phone: string;
  address: string;
  currency: string;
  academic_year: string;
  receipt_prefix: string;
  receipt_next: number;
  student_code_prefix: string;
  student_code_next: number;
  receipt_show_logo: boolean;
  receipt_paper_size: "A4" | "A5";
  receipt_show_payment_method: boolean;
  receipt_show_guardian: boolean;
  receipt_show_notes: boolean;
  receipt_footer_text: string;
}

export interface User extends Base {
  username: string;
  full_name: string;
  password_hash: string;
  role: RoleKey;
  is_active: boolean;
  employee_id?: ID | null;
}

export type RoleKey = "owner" | "director" | "accountant" | "secretary" | "teacher";

export interface Student extends Base {
  code: string;
  full_name: string;
  birth_date: string | null;
  gender: "male" | "female" | "";
  phone: string;
  guardian_name: string;
  guardian_phone: string;
  address: string;
  education_level: "ابتدائي" | "متوسط" | "ثانوي" | "جامعي" | "" | null;
  status: "active" | "inactive" | "graduated" | "archived";
  archived_at?: string | null;
  notes: string;
}

export interface Course extends Base {
  name: string;
  code: string;
  level: string;
  hours: number;
  default_price: number; // minor units
  active: boolean;
}

export interface Klass extends Base {
  name: string;
  course_id: ID;
  teacher_id: ID | null;
  term: string;
  capacity: number;
  start_date: string;
  end_date: string;
  schedule: { weekday: number; start_time: string; end_time: string; room: string }[];
  status: "planned" | "running" | "finished";
}

export interface Enrollment extends Base {
  student_id: ID;
  class_id: ID;
  enrolled_at: string;
  price_snapshot: number;
  discount_snapshot: number;
  discount_reason: string;
  status: "active" | "completed" | "withdrawn" | "cancelled";
}

export interface Invoice extends Base {
  number: string;
  enrollment_id: ID;
  student_id: ID;
  total: number;
  status: "open" | "paid" | "cancelled";
  issued_at: string;
}

export interface Installment extends Base {
  invoice_id: ID;
  due_date: string;
  amount: number;
  status: "due" | "paid" | "partial";
  /** "registration" = رسوم التسجيل، "installment" = قسط عادي */
  kind?: "registration" | "installment";
  /** 0 لرسوم التسجيل، 1..n لأرقام الأقساط */
  seq?: number;
}

export interface Payment extends Base {
  invoice_id: ID;
  installment_id: ID | null;
  student_id: ID;
  receipt_no: string;
  amount: number;
  method: "cash" | "bank" | "other";
  paid_at: string;
  is_void: boolean;
  void_reason: string;
  user_id: ID | null;
  note?: string;
}

export interface Employee extends Base {
  full_name: string;
  kind: "teacher" | "staff";
  job_title: string;
  phone: string;
  hired_at: string;
  base_salary: number;
  active: boolean;
}

export interface PayrollItem extends Base {
  employee_id: ID;
  period: string; // YYYY-MM
  base_snapshot: number;
  bonus: number;
  deduction: number;
  advance_deducted: number;
  net: number;
  paid_at: string | null;
  status: "draft" | "paid";
}

export interface Advance extends Base {
  employee_id: ID;
  amount: number;
  date: string;
  reason: string;
  settled: boolean;
}

export interface Expense extends Base {
  category: string;
  amount: number;
  date: string;
  note: string;
  user_id: ID | null;
  is_void: boolean;
}

export interface Income extends Base {
  source: string;
  amount: number;
  date: string;
  note: string;
  user_id: ID | null;
  is_void: boolean;
}

export interface AuditEntry extends Base {
  user_id: ID | null;
  user_name: string;
  entity: string;
  entity_id: ID | null;
  action: string;
  detail: string;
  at: string;
}

export interface DB {
  schema_version: number;
  settings: Settings;
  expense_categories: string[];
  users: User[];
  students: Student[];
  courses: Course[];
  classes: Klass[];
  enrollments: Enrollment[];
  invoices: Invoice[];
  installments: Installment[];
  payments: Payment[];
  employees: Employee[];
  payroll_items: PayrollItem[];
  advances: Advance[];
  expenses: Expense[];
  incomes: Income[];
  audit_log: AuditEntry[];
}

export type CollectionKey = {
  [K in keyof DB]: DB[K] extends Base[] ? K : never;
}[keyof DB];

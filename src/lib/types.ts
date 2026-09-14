// Domain types. Money is stored in minor units (integers) everywhere.

export type ID = string;

export interface Base {
  id: ID;
  created_at: string;
  updated_at: string;
  branch_id: ID;
  sync_status: "local" | "synced";
}

export type PermissionKey = string; // "entity.action"

export interface DiscountPreset {
  id: ID;
  title: string;
  amount: number;
  active: boolean;
}

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
  payroll_receipt_prefix?: string;
  payroll_receipt_next?: number;
  student_code_prefix: string;
  student_code_next: number;
  receipt_show_logo: boolean;
  receipt_paper_size: "A4" | "A5";
  receipt_show_payment_method: boolean;
  receipt_show_guardian: boolean;
  receipt_show_notes: boolean;
  receipt_footer_text: string;
  discount_presets: DiscountPreset[];
  /** Last period processed by the automatic monthly engine. Null means activate from the current month only. */
  monthly_generation_last_period: string | null;
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
  mother_name: string;
  school_name: string;
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
  /** Legacy registrations keep their historical one-time invoice unchanged. */
  billing_mode?: "legacy" | "monthly";
  /** First and optional final billed period in YYYY-MM format. */
  billing_start_period?: string | null;
  billing_end_period?: string | null;
  /** Net recurring monthly charge after the snapshotted discount. */
  monthly_price_snapshot?: number;
  discount_preset_id?: ID | null;
  discount_title_snapshot?: string;
  /** Specific YYYY-MM periods intentionally excluded from billing (student did not attend). */
  skipped_periods?: string[];
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
  /** registration = رسوم التسجيل، installment = قسط قديم، monthly = استحقاق شهري. */
  kind?: "registration" | "installment" | "monthly";
  /** 0 لرسوم التسجيل، 1..n لأرقام الأقساط */
  seq?: number;
  /** Billing period for monthly charges (YYYY-MM). */
  period?: string | null;
  is_void?: boolean;
  void_reason?: string;
  voided_at?: string | null;
}

export interface PaymentAllocation {
  installment_id: ID;
  amount: number;
}

export interface Payment extends Base {
  invoice_id: ID;
  /** Legacy single-target field. New receipts persist exact allocations below. */
  installment_id: ID | null;
  /** Exact immutable distribution of this receipt over invoice installments/months. */
  allocations?: PaymentAllocation[];
  student_id: ID;
  receipt_no: string;
  amount: number;
  method: "cash" | "bank" | "other";
  paid_at: string;
  is_void: boolean;
  void_reason: string;
  voided_at?: string | null;
  user_id: ID | null;
  note?: string;
  /** Immutable financial state immediately after issuing this receipt. */
  invoice_total_snapshot?: number;
  paid_after_snapshot?: number;
  due_after_snapshot?: number;
}

export interface Employee extends Base {
  full_name: string;
  kind: "teacher" | "staff";
  job_title: string;
  phone: string;
  hired_at: string;
  ended_at?: string | null;
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
  /** Exact advances settled by this payroll item. */
  advance_ids?: ID[];
  net: number;
  paid_at: string | null;
  status: "draft" | "partial" | "paid";
}

export interface Advance extends Base {
  employee_id: ID;
  amount: number;
  date: string;
  reason: string;
  settled: boolean;
  /** Reserved for exactly one payroll item as soon as it is allocated. */
  allocated_payroll_id?: ID | null;
  settled_at?: string | null;
}

export interface PayrollPayment extends Base {
  payroll_item_id: ID;
  employee_id: ID;
  amount: number;
  paid_at: string;
  is_void: boolean;
  void_reason: string;
  voided_at?: string | null;
  user_id: ID | null;
  note?: string;
  /** Multiple month allocations created by one payout share these immutable settlement identifiers. */
  settlement_id?: ID | null;
  settlement_no?: string;
  /** Immutable payroll state immediately after issuing this payment receipt. */
  payroll_net_snapshot?: number;
  paid_before_snapshot?: number;
  paid_after_snapshot?: number;
  remaining_after_snapshot?: number;
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
  payroll_payments: PayrollPayment[];
  advances: Advance[];
  expenses: Expense[];
  incomes: Income[];
  audit_log: AuditEntry[];
}

export type CollectionKey = {
  [K in keyof DB]: DB[K] extends Base[] ? K : never;
}[keyof DB];

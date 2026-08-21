import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/session";
import { Button, Input, Panel } from "@/components/ui-kit";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV: { group: string; items: { to: string; label: string; perm: string }[] }[] = [
  {
    group: "الرئيسية",
    items: [{ to: "/", label: "لوحة المعلومات", perm: "students.view" }],
  },
  {
    group: "الأكاديمي",
    items: [
      { to: "/students", label: "الطلاب", perm: "students.view" },
      { to: "/courses", label: "الدورات", perm: "courses.view" },
      { to: "/classes", label: "الصفوف والجداول", perm: "classes.view" },
    ],
  },
  {
    group: "المالية",
    items: [
      { to: "/finance", label: "الفواتير والدفعات", perm: "finance.view" },
      { to: "/receipts", label: "الإيصالات", perm: "finance.view" }, // ✅ جديد
      { to: "/expenses", label: "المصاريف والمداخيل", perm: "expenses.view" },
      { to: "/employees", label: "الموظفون والرواتب", perm: "payroll.view" },
      { to: "/reports", label: "التقارير", perm: "reports.view" },
    ],
  },
  {
    group: "النظام",
    items: [
      { to: "/settings", label: "الإعدادات", perm: "settings.view" },
      { to: "/users", label: "المستخدمون", perm: "users.view" },
      { to: "/audit", label: "سجل التدقيق", perm: "audit.view" },
      { to: "/backup", label: "النسخ الاحتياطي", perm: "backup.view" },
    ],
  },
];

// باقي الكود (LoginScreen, AppShell, Denied) كما هو دون تغيير
// ... (احتفظ بالكود الموجود أسفل هذا المصفوفة)

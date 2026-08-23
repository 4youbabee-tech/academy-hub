import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Table, Td } from "@/components/ui-kit";
import { insert, update, remove, hashPassword } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import type { User, RoleKey } from "@/lib/types";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون — نظام إدارة المعهد" },
      { name: "description", content: "إدارة المستخدمين والأدوار والصلاحيات." },
    ],
  }),
  component: UsersPage,
});

const EMPTY = { username: "", full_name: "", password: "", role: "secretary" as RoleKey, is_active: true };

function UsersPage() {
  const { db, actor, allowed, user: currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (db ? db.users.slice().sort((a, b) => a.full_name.localeCompare(b.full_name, "ar")) : []),
    [db],
  );
  const pagination = usePagination(rows, "users");

  if (!db) return null;
  if (!allowed("users.view")) return <Denied />;
  const currentDb = db;
  const canCreate = allowed("users.create");
  const canUpdate = allowed("users.update");
  const canDelete = allowed("users.delete");
  const isOwner = currentUser?.role === "owner";

  function startAdd() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function startEdit(u: User) {
    setEditing(u);
    setForm({
      username: u.username,
      full_name: u.full_name,
      password: "",
      role: u.role,
      is_active: u.is_active,
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!form.username.trim()) return setError("اسم المستخدم إلزامي");
    if (!form.full_name.trim()) return setError("الاسم الظاهر إلزامي");

    const existing = currentDb.users.find(
      (u) => u.username.toLowerCase() === form.username.trim().toLowerCase() && u.id !== editing?.id,
    );
    if (existing) return setError("اسم المستخدم موجود مسبقاً");

    try {
      if (editing) {
        const patch: Partial<User> = {
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password.trim()) {
          patch.password_hash = await hashPassword(form.password.trim());
        }
        update("users", editing.id, patch, actor, `تعديل المستخدم ${form.full_name}`);
      } else {
        if (!form.password.trim()) return setError("كلمة المرور إلزامية للمستخدم الجديد");
        const password_hash = await hashPassword(form.password.trim());
        insert(
          "users",
          {
            username: form.username.trim(),
            full_name: form.full_name.trim(),
            password_hash,
            role: form.role,
            is_active: form.is_active,
            employee_id: null,
          },
          actor,
          `إضافة المستخدم ${form.full_name}`,
        );
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteUser(u: User) {
    if (u.id === currentUser?.id) return setError("لا يمكن حذف حسابك الحالي");
    if (!confirm(`هل تريد حذف المستخدم "${u.full_name}"؟`)) return;
    try {
      remove("users", u.id, actor, `حذف المستخدم ${u.full_name}`);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        subtitle={`${currentDb.users.length} مستخدم`}
        actions={canCreate ? <Button onClick={startAdd}>+ مستخدم جديد</Button> : null}
      />

      {rows.length === 0 ? (
        <Empty text="لا يوجد مستخدمون." />
      ) : (
        <>
        <Table head={["اسم المستخدم", "الاسم الظاهر", "الدور", "الحالة", ""]}>
          {pagination.rows.map((u) => (
            <tr key={u.id} className={u.id === currentUser?.id ? "bg-muted/40" : ""}>
              <Td className="font-semibold">@{u.username}</Td>
              <Td>{u.full_name}</Td>
              <Td>{ROLE_LABELS[u.role]}</Td>
              <Td>
                <Badge tone={u.is_active ? "success" : "muted"}>{u.is_active ? "نشط" : "معطّل"}</Badge>
                {u.id === currentUser?.id && (
                  <Badge tone="primary" className="mr-2">أنت</Badge>
                )}
              </Td>
              <Td>
                <div className="flex gap-1">
                  {canUpdate && (u.role !== "owner" || isOwner) && (
                    <Button variant="ghost" onClick={() => startEdit(u)}>
                      تعديل
                    </Button>
                  )}
                  {canDelete && u.id !== currentUser?.id && (u.role !== "owner" || isOwner) && (
                    <Button variant="ghost" onClick={() => deleteUser(u)}>
                      حذف
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        <PaginationControls
          page={pagination.page}
          pageCount={pagination.pageCount}
          pageSize={pagination.pageSize}
          total={pagination.total}
          from={pagination.from}
          to={pagination.to}
          onPrevious={pagination.previous}
          onNext={pagination.next}
          onPageSizeChange={pagination.setPageSize}
        />
        </>
      )}

      <Modal open={open} title={editing ? "تعديل مستخدم" : "مستخدم جديد"} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المستخدم">
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} dir="ltr" />
            </Field>
            <Field label="الاسم الظاهر">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label={editing ? "كلمة المرور (اتركها فارغة للإبقاء)" : "كلمة المرور"}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                dir="ltr"
                required={!editing}
              />
            </Field>
            <Field label="الدور">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as RoleKey })}
              >
                {isOwner ? <option value="owner">مالك</option> : null}
                <option value="director">مدير</option>
                <option value="accountant">محاسب</option>
                <option value="secretary">سكرتير</option>
                <option value="teacher">مدرّس</option>
              </Select>
            </Field>
          </div>
          <Field label="نشط">
            <select
              value={form.is_active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="1">نشط</option>
              <option value="0">معطّل</option>
            </select>
          </Field>
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={save}>حفظ</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

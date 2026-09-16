import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, PaginationControls, Select, Table, Td } from "@/components/ui-kit";
import { insert, update, remove, hashPassword } from "@/lib/db";
import { canUser, DEFAULT_WORKER_PERMISSIONS, PERMISSION_OPTIONS, ROLE_LABELS } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون — نظام إدارة المركز التعليمي" },
      { name: "description", content: "إدارة المستخدمين وصلاحيات كل عامل بصورة مستقلة." },
    ],
  }),
  component: UsersPage,
});

const EMPTY = {
  username: "",
  full_name: "",
  password: "",
  is_active: true,
  permissions: [...DEFAULT_WORKER_PERMISSIONS] as string[],
};

const PERMISSION_GROUPS = [...new Set(PERMISSION_OPTIONS.map((item) => item.group))];

function effectivePermissions(user: User): string[] {
  if (user.role === "owner") return PERMISSION_OPTIONS.map((item) => item.key);
  if (Array.isArray(user.permissions)) return [...user.permissions];
  return PERMISSION_OPTIONS.filter((item) => canUser(user, item.key)).map((item) => item.key);
}

function UsersPage() {
  const { db, actor, allowed, user: currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    if (!db) return [];
    const term = q.trim().toLowerCase();
    return db.users
      .filter((user) => !role || (role === "worker" ? user.role !== "owner" : user.role === role))
      .filter((user) => status === "active" ? user.is_active : status === "inactive" ? !user.is_active : true)
      .filter((user) => !term || user.username.toLowerCase().includes(term) || user.full_name.toLowerCase().includes(term))
      .slice().sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
  }, [db, q, role, status]);
  const pagination = usePagination(rows, `${q}|${role}|${status}`);

  if (!db) return null;
  if (!allowed("users.view")) return <Denied />;
  const currentDb = db;
  const isOwner = currentUser?.role === "owner";
  const canManage = isOwner;

  function startAdd() {
    setEditing(null);
    setForm({ ...EMPTY, permissions: [...DEFAULT_WORKER_PERMISSIONS] });
    setError(null);
    setOpen(true);
  }

  function startEdit(user: User) {
    setEditing(user);
    setForm({
      username: user.username,
      full_name: user.full_name,
      password: "",
      is_active: user.is_active,
      permissions: effectivePermissions(user),
    });
    setError(null);
    setOpen(true);
  }

  function togglePermission(key: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key],
    }));
  }

  async function save() {
    if (!canManage) return setError("إدارة المستخدمين والصلاحيات متاحة للمدير الرئيسي فقط");
    if (!form.username.trim()) return setError("اسم المستخدم إلزامي");
    if (!form.full_name.trim()) return setError("الاسم الظاهر إلزامي");

    const existing = currentDb.users.find(
      (user) => user.username.toLowerCase() === form.username.trim().toLowerCase() && user.id !== editing?.id,
    );
    if (existing) return setError("اسم المستخدم موجود مسبقاً");

    try {
      if (editing) {
        const patch: Partial<User> = {
          username: form.username.trim(),
          full_name: form.full_name.trim(),
          is_active: form.is_active,
        };
        if (editing.role !== "owner") {
          patch.role = "worker";
          patch.permissions = [...new Set(form.permissions)];
        }
        if (form.password.trim()) patch.password_hash = await hashPassword(form.password.trim());
        update("users", editing.id, patch, actor, `تعديل المستخدم وصلاحياته ${form.full_name}`);
      } else {
        if (!form.password.trim()) return setError("كلمة المرور إلزامية للمستخدم الجديد");
        const password_hash = await hashPassword(form.password.trim());
        insert(
          "users",
          {
            username: form.username.trim(),
            full_name: form.full_name.trim(),
            password_hash,
            role: "worker",
            is_active: form.is_active,
            employee_id: null,
            permissions: [...new Set(form.permissions)],
          },
          actor,
          `إضافة العامل ${form.full_name}`,
        );
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function deleteUser(user: User) {
    if (!canManage) return setError("إدارة المستخدمين متاحة للمدير الرئيسي فقط");
    if (user.id === currentUser?.id) return setError("لا يمكن حذف حسابك الحالي");
    if (!confirm(`هل تريد حذف المستخدم "${user.full_name}"؟`)) return;
    try {
      remove("users", user.id, actor, `حذف المستخدم ${user.full_name}`);
      setError(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle="المدير الرئيسي يملك كل الصلاحيات، ولكل عامل صلاحيات مستقلة"
        actions={canManage ? <Button onClick={startAdd}>+ عامل جديد</Button> : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو اسم المستخدم" />
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">كل الأنواع</option>
          <option value="owner">المدير الرئيسي</option>
          <option value="worker">العاملون</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطّل</option>
        </Select>
      </div>

      {error ? <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</div> : null}

      {rows.length === 0 ? (
        <Empty text="لا يوجد مستخدمون." />
      ) : (
        <>
          <Table head={["اسم المستخدم", "الاسم الظاهر", "النوع", "الصلاحيات", "الحالة", ""]}>
            {pagination.rows.map((user) => (
              <tr key={user.id} className={user.id === currentUser?.id ? "bg-muted/40" : ""}>
                <Td className="font-semibold">@{user.username}</Td>
                <Td>{user.full_name}</Td>
                <Td>{user.role === "owner" ? "المدير الرئيسي" : "عامل"}</Td>
                <Td className="text-xs">
                  {user.role === "owner" ? "كل الصلاحيات" : `${effectivePermissions(user).length} صلاحية`}
                </Td>
                <Td>
                  <Badge tone={user.is_active ? "success" : "muted"}>{user.is_active ? "نشط" : "معطّل"}</Badge>
                  {user.id === currentUser?.id ? <Badge tone="primary" className="mr-2">أنت</Badge> : null}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {canManage ? <Button variant="ghost" onClick={() => startEdit(user)}>تعديل</Button> : null}
                    {canManage && user.id !== currentUser?.id && user.role !== "owner" ? (
                      <Button variant="ghost" onClick={() => deleteUser(user)}>حذف</Button>
                    ) : null}
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

      <Modal open={open} title={editing ? "تعديل مستخدم وصلاحياته" : "إضافة عامل"} onClose={() => setOpen(false)} extraWide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المستخدم">
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} dir="ltr" />
            </Field>
            <Field label="الاسم الظاهر">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label={editing ? "كلمة المرور (اتركها فارغة للإبقاء)" : "كلمة المرور"}>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" required={!editing} />
            </Field>
            <Field label="الحالة">
              <Select value={form.is_active ? "1" : "0"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}>
                <option value="1">نشط</option>
                <option value="0">معطّل</option>
              </Select>
            </Field>
          </div>

          {editing?.role === "owner" ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-bold">المدير الرئيسي</p>
              <p className="mt-1 text-sm text-muted-foreground">هذا الحساب يملك جميع الصلاحيات دائمًا ولا يمكن حجبها.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">صلاحيات العامل</h3>
                  <p className="text-xs text-muted-foreground">أي صلاحية غير معلّمة لن تظهر شاشتها أو أزرارها للعامل.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setForm({ ...form, permissions: [...DEFAULT_WORKER_PERMISSIONS] })}>الافتراضي</Button>
                  <Button variant="ghost" onClick={() => setForm({ ...form, permissions: PERMISSION_OPTIONS.map((item) => item.key) })}>تحديد الكل</Button>
                  <Button variant="ghost" onClick={() => setForm({ ...form, permissions: [] })}>إلغاء الكل</Button>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group} className="rounded-lg bg-muted/30 p-3">
                    <p className="mb-2 text-sm font-bold">{group}</p>
                    <div className="space-y-2">
                      {PERMISSION_OPTIONS.filter((item) => item.group === group).map((item) => (
                        <label key={item.key} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(item.key)}
                            onChange={() => togglePermission(item.key)}
                            className="h-4 w-4 rounded border-input"
                          />
                          <span className={item.dangerous ? "font-semibold text-destructive" : ""}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>حفظ</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

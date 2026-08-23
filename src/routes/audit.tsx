import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/session";
import { Denied } from "@/components/AppShell";
import { Badge, Empty, Field, Input, PageHeader, PaginationControls, Select, Table, Td } from "@/components/ui-kit";
import { dateStr, localDateKey } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagination } from "@/hooks/use-pagination";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "سجل التدقيق — نظام إدارة المعهد" },
      { name: "description", content: "سجل جميع العمليات الحساسة في النظام مع فلترة متقدمة." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { db, allowed } = useApp();
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedQ = useDebouncedValue(q);

  const entities = useMemo(() => (db ? [...new Set(db.audit_log.map((a) => a.entity).filter(Boolean))] : []), [db]);
  const actions = useMemo(() => (db ? [...new Set(db.audit_log.map((a) => a.action).filter(Boolean))] : []), [db]);

  const rows = useMemo(() => {
    if (!db) return [];
    let logs = db.audit_log.slice();

    if (debouncedQ.trim()) {
      const term = debouncedQ.trim().toLowerCase();
      logs = logs.filter(
        (a) =>
          a.user_name?.toLowerCase().includes(term) ||
          a.detail?.toLowerCase().includes(term) ||
          a.entity?.toLowerCase().includes(term),
      );
    }
    if (entity) logs = logs.filter((a) => a.entity === entity);
    if (action) logs = logs.filter((a) => a.action === action);
    if (dateFrom) logs = logs.filter((a) => localDateKey(a.at) >= dateFrom);
    if (dateTo) logs = logs.filter((a) => localDateKey(a.at) <= dateTo);

    return logs.sort((a, b) => b.at.localeCompare(a.at));
  }, [db, debouncedQ, entity, action, dateFrom, dateTo]);
  const pagination = usePagination(rows, `${debouncedQ}|${entity}|${action}|${dateFrom}|${dateTo}`);

  if (!db) return null;
  if (!allowed("audit.view")) return <Denied />;

  function getActionBadge(action: string): "muted" | "success" | "warning" | "danger" | "primary" {
    const map: Record<string, "muted" | "success" | "warning" | "danger" | "primary"> = {
      create: "success",
      update: "primary",
      delete: "danger",
      void: "warning",
      login: "primary",
      logout: "muted",
      mark: "warning",
      pay: "success",
      cancel: "warning",
      archive: "warning",
      restore: "success",
      init: "muted",
    };
    return map[action] || "muted";
  }

  const actionLabels: Record<string, string> = {
    create: "إنشاء",
    update: "تعديل",
    delete: "حذف",
    void: "إلغاء",
    login: "دخول",
    logout: "خروج",
    mark: "تسجيل",
    pay: "دفع",
    cancel: "إلغاء",
    archive: "أرشفة",
    restore: "استرجاع",
    init: "تهيئة",
  };

  return (
    <div>
      <PageHeader
        title="سجل التدقيق"
        subtitle={`${rows.length} سجل${rows.length !== 1 ? "ات" : ""}`}
      />

      <div className="panel mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="بحث">
            <Input
              placeholder="مستخدم / تفاصيل..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="الكيان">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">الكل</option>
              {entities.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </Field>
          <Field label="الإجراء">
            <Select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">الكل</option>
              {actions.map((a) => (
                <option key={a} value={a}>{actionLabels[a] || a}</option>
              ))}
            </Select>
          </Field>
          <Field label="من تاريخ">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty text="لا توجد سجلات مطابقة." />
      ) : (
        <>
        <Table head={["التاريخ", "المستخدم", "الكيان", "الإجراء", "التفاصيل"]}>
          {pagination.rows.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-xs">{dateStr(a.at)}</Td>
              <Td className="font-semibold">{a.user_name || "النظام"}</Td>
              <Td>{a.entity}</Td>
              <Td>
                <Badge tone={getActionBadge(a.action)}>
                  {actionLabels[a.action] || a.action}
                </Badge>
              </Td>
              <Td className="text-sm text-muted-foreground">{a.detail}</Td>
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
    </div>
  );
}

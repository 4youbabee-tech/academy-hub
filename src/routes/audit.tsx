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
      { title: "سجل التدقيق — نظام إدارة المركز التعليمي" },
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
      status: "primary",
      "skip-month": "warning",
      "restore-month": "success",
      withdraw: "warning",
      generate: "success",
      "catch-up": "success",
      init: "muted",
      "reset-operational-data": "danger",
    };
    return map[action] || "muted";
  }

  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle={`${rows.length} عملية`} />
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالمستخدم أو التفاصيل" />
        <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">كل الأقسام</option>
          {entities.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">كل العمليات</option>
          {actions.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
        <Field label="من"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
        <Field label="إلى"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
      </div>

      {rows.length === 0 ? <Empty text="لا توجد عمليات مطابقة." /> : (
        <>
          <Table head={["الوقت", "المستخدم", "القسم", "العملية", "التفاصيل"]}>
            {pagination.rows.map((row) => (
              <tr key={row.id}>
                <Td className="whitespace-nowrap text-xs">{dateStr(row.at)}</Td>
                <Td className="font-semibold">{row.user_name || "النظام"}</Td>
                <Td>{row.entity}</Td>
                <Td><Badge tone={getActionBadge(row.action)}>{row.action}</Badge></Td>
                <Td className="max-w-lg text-sm">{row.detail}</Td>
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

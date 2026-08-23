import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function usePagination<T>(items: readonly T[], resetKey: string, defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const rows = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, pageSize, startIndex],
  );

  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => setPage((value) => Math.min(value, pageCount)), [pageCount]);

  function setPageSize(next: number) {
    setPageSizeState(next);
    setPage(1);
  }

  return {
    rows,
    page: currentPage,
    pageSize,
    pageCount,
    total: items.length,
    from: items.length ? startIndex + 1 : 0,
    to: Math.min(startIndex + pageSize, items.length),
    previous: () => setPage((value) => Math.max(1, value - 1)),
    next: () => setPage((value) => Math.min(pageCount, value + 1)),
    setPageSize,
  };
}

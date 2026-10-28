'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/surfaces';

export interface Column<T> {
  key: string;
  header: string;
  /** Rendered for every row. Keep it cheap — this runs for the whole page. */
  cell: (row: T) => ReactNode;
  /** Hidden below `lg`, so a narrow screen keeps only the columns that matter. */
  secondary?: boolean;
  align?: 'left' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  /** Rendered instead of the table below `lg`, where columns would be unreadable. */
  mobileCard?: (row: T) => ReactNode;
}

/**
 * The admin table.
 *
 * On a large screen it is a real table, which is what dense operational data
 * wants. Below `lg` it becomes a list of cards, because a twelve-column table on
 * a phone is not a table — it is a horizontal scroll nobody reads. Both are
 * driven by the same column definitions, so a column cannot exist in one and be
 * forgotten in the other.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  onRowClick,
  pagination,
  mobileCard,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Something went wrong.'}
        onRetry={onRetry}
      />
    );
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      {/* Cards on small screens */}
      {mobileCard && (
        <ul className="flex flex-col divide-y divide-ink-100 lg:hidden">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx('p-4', onRowClick && 'cursor-pointer hover:bg-ink-50')}
            >
              {mobileCard(row)}
            </li>
          ))}
        </ul>
      )}

      <div className={clsx('overflow-x-auto', mobileCard && 'hidden lg:block')}>
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={clsx(
                    'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.secondary && 'hidden xl:table-cell',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(onRowClick && 'cursor-pointer hover:bg-ink-50')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      'px-4 py-3 align-middle text-ink-800',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.secondary && 'hidden xl:table-cell',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
          <p className="text-sm text-ink-500">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

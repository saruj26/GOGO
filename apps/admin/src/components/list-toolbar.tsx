'use client';

import type { ReactNode } from 'react';

interface FilterDefinition {
  key: string;
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}

/** Search box plus dropdown filters, laid out the same way on every list. */
export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
  filters = [],
  actions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M9 3.5a5.5 5.5 0 1 0 3.4 9.8l3.4 3.4a1 1 0 0 0 1.4-1.4l-3.4-3.4A5.5 5.5 0 0 0 9 3.5zm-3.5 5.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-10 w-full rounded-[var(--radius-control)] border border-ink-300 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
        />
      </div>

      {filters.map((filter) => (
        <select
          key={filter.key}
          value={filter.value ?? ''}
          onChange={(e) => filter.onChange(e.target.value || undefined)}
          aria-label={filter.label}
          className="h-10 rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 text-sm text-ink-800 focus:border-brand-500"
        >
          <option value="">{filter.label}: all</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      {actions && <div className="ml-auto flex gap-2">{actions}</div>}
    </div>
  );
}

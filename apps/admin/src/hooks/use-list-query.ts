'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDebounced } from './use-debounced';

export interface ListState {
  page: number;
  search: string;
  filters: Record<string, string | undefined>;
}

/**
 * Shared state for every admin list: page, search and filters.
 *
 * Search is debounced, and changing a filter or the search resets to page one —
 * otherwise a narrowed result set leaves you stranded on a page that no longer
 * exists.
 */
export function useListQuery(initialFilters: Record<string, string | undefined> = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const debouncedSearch = useDebounced(search, 350);

  const setFilter = useCallback((key: string, value: string | undefined) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  }, []);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const query = useMemo(
    () => ({ page, limit: 25, q: debouncedSearch.trim() || undefined, ...filters }),
    [page, debouncedSearch, filters],
  );

  return { page, setPage, search, onSearchChange, filters, setFilter, query };
}

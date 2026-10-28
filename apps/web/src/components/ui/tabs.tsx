'use client';

import clsx from 'clsx';

export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
}

/** Horizontally scrollable on narrow screens so a tab is never cut off. */
export function Tabs({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: TabDefinition[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="no-scrollbar -mx-1 overflow-x-auto">
      <div className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'bg-ink-900 text-white'
                  : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-300 hover:bg-ink-50',
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 text-xs',
                    selected ? 'bg-white/20' : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

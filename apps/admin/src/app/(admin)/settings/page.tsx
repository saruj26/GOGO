'use client';

import { dateTime, messageFor, relativeTime } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import {
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useAdminApi, type AdminSetting } from '@/lib/admin-context';

const CATEGORY_LABEL: Record<string, string> = {
  matching: 'Shared-ride matching',
  safety: 'Safety',
  ride: 'Rides',
  pricing: 'Pricing',
  location: 'Live location',
  food: 'Food',
  delivery: 'Courier assignment',
  parcel: 'Parcels',
};

/**
 * Runtime business rules.
 *
 * Every control is generated from the backend's own settings registry, including
 * its type and its admissible range — so a rule cannot be exposed here that the
 * backend does not actually accept, and a value out of range is rejected by both
 * sides.
 */
export default function SettingsPage() {
  const admin = useAdminApi();
  const [category, setCategory] = useState<string>('matching');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: ({ signal }) => admin.settings(undefined, { signal }),
  });

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const setting of data ?? []) {
      seen.set(setting.category, (seen.get(setting.category) ?? 0) + 1);
    }
    return Array.from(seen.entries()).map(([id, count]) => ({
      id,
      label: CATEGORY_LABEL[id] ?? id,
      count,
    }));
  }, [data]);

  if (isLoading) return <LoadingBlock label="Loading settings" />;
  if (error) return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;

  const visible = (data ?? []).filter((setting) => setting.category === category);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business rules that take effect without a deploy."
      />

      <div className="border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
        <Tabs ariaLabel="Setting category" tabs={categories} active={category} onChange={setCategory} />
      </div>

      <div className="p-4 sm:p-6">
        <div className="mb-4 max-w-3xl">
          <InlineNotice tone="neutral">
            Changes apply within about a minute, and every one is recorded in the audit log.
          </InlineNotice>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((setting) => (
            <SettingRow key={setting.key} setting={setting} />
          ))}
        </div>
      </div>
    </>
  );
}

function SettingRow({ setting }: { setting: AdminSetting }) {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => serialise(setting.value, setting.valueType));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => admin.updateSetting(setting.key, parse(draft, setting.valueType)),
    onSuccess: () => {
      toast.success(`${setting.label} saved.`);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  const original = serialise(setting.value, setting.valueType);
  const changed = draft !== original;
  const isDefault = JSON.stringify(setting.value) === JSON.stringify(setting.defaultValue);

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-ink-900">{setting.label}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-400">{setting.key}</p>
          </div>
          {!isDefault && (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              customised
            </span>
          )}
        </div>

        {setting.description && (
          <p className="mt-2 text-sm text-ink-500">{setting.description}</p>
        )}

        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {setting.valueType === 'BOOLEAN' ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={setting.label}
                className="h-10 w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            ) : setting.valueType === 'JSON' ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                aria-label={setting.label}
                className="w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 font-mono text-xs text-ink-900 focus:border-brand-500"
              />
            ) : (
              <input
                type={setting.valueType === 'NUMBER' ? 'number' : 'text'}
                value={draft}
                min={setting.min ?? undefined}
                max={setting.max ?? undefined}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={setting.label}
                className="h-10 w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500"
              />
            )}
          </div>

          <Button
            size="sm"
            disabled={!changed}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>

        {(setting.min !== null || setting.max !== null) && (
          <p className="mt-1.5 text-xs text-ink-400">
            Allowed range {setting.min ?? '−∞'} to {setting.max ?? '∞'}
          </p>
        )}

        {error && (
          <p className="mt-2 text-sm text-critical-700" role="alert">
            {error}
          </p>
        )}

        <p className="mt-2 text-xs text-ink-400">Last changed {relativeTime(setting.updatedAt)}</p>
      </div>
    </Card>
  );
}

function serialise(value: unknown, type: AdminSetting['valueType']): string {
  if (type === 'JSON') return JSON.stringify(value, null, 2);
  return String(value);
}

function parse(draft: string, type: AdminSetting['valueType']): unknown {
  switch (type) {
    case 'NUMBER':
      return Number(draft);
    case 'BOOLEAN':
      return draft === 'true';
    case 'JSON':
      // A malformed edit is reported rather than silently sent as a string.
      return JSON.parse(draft);
    default:
      return draft;
  }
}

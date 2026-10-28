'use client';

import { dateTime, relativeTime } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Modal } from '@/components/ui/modal';
import { Badge, Card, InlineNotice } from '@/components/ui/surfaces';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminAuditLog } from '@/lib/admin-context';

/**
 * The audit trail.
 *
 * Records show business state — statuses, amounts, identifiers — because that is
 * all the audit service is ever given. No credential, token or password passes
 * through it, so none can appear here.
 */
export default function AuditLogsPage() {
  const admin = useAdminApi();
  const list = useListQuery();
  const [inspecting, setInspecting] = useState<AdminAuditLog | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'audit-logs', list.query],
    queryFn: ({ signal }) => admin.auditLogs(list.query, { signal }),
  });

  const { data: actions } = useQuery({
    queryKey: ['admin', 'audit-actions'],
    queryFn: ({ signal }) => admin.auditActions({ signal }),
    staleTime: 5 * 60_000,
  });

  const columns: Column<AdminAuditLog>[] = [
    {
      key: 'at',
      header: 'When',
      cell: (row) => (
        <div>
          <p className="text-sm text-ink-900">{relativeTime(row.at)}</p>
          <p className="text-xs text-ink-400">{dateTime(row.at)}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (row) => <span className="font-mono text-xs text-ink-800">{row.action}</span>,
    },
    {
      key: 'entity',
      header: 'Entity',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-ink-800">{row.entityType}</p>
          {row.entityId && (
            <p className="truncate font-mono text-[11px] text-ink-400">{row.entityId}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Who',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-800">{row.actor.name}</p>
          {row.actor.role && (
            <Badge tone={row.actor.role === 'ADMIN' ? 'progress' : 'neutral'}>
              {row.actor.role.toLowerCase()}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      secondary: true,
      cell: (row) => (
        <span className="font-mono text-xs text-ink-500">{row.ipAddress ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setInspecting(row)}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Audit logs" description="Who changed what, and when." />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search by entity id"
        filters={[
          {
            key: 'action',
            label: 'Action',
            value: list.filters.action,
            onChange: (value) => list.setFilter('action', value),
            options: (actions ?? []).map((a) => ({
              value: a.action,
              label: `${a.action} (${a.count})`,
            })),
          },
          {
            key: 'entityType',
            label: 'Entity',
            value: list.filters.entityType,
            onChange: (value) => list.setFilter('entityType', value),
            options: [
              'Ride', 'RidePassenger', 'FoodOrder', 'FoodDelivery', 'ParcelOrder',
              'Payment', 'PricingRule', 'Promotion', 'AdminSetting', 'Driver',
              'User', 'Restaurant', 'MenuItem',
            ].map((entity) => ({ value: entity, label: entity })),
          },
        ]}
      />

      <div className="p-4 sm:p-6">
        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle="No entries match"
            pagination={
              data
                ? { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: list.setPage }
                : undefined
            }
            mobileCard={(row) => (
              <button type="button" onClick={() => setInspecting(row)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-ink-800">{row.action}</p>
                    <p className="truncate text-xs text-ink-500">
                      {row.entityType} · {row.actor.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{relativeTime(row.at)}</span>
                </div>
              </button>
            )}
          />
        </Card>
      </div>

      <Modal
        open={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title={inspecting?.action ?? 'Audit entry'}
        description={inspecting ? `${inspecting.entityType} · ${dateTime(inspecting.at)}` : undefined}
        size="lg"
      >
        {inspecting && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Actor</dt>
                <dd className="text-ink-900">{inspecting.actor.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Role</dt>
                <dd className="text-ink-900">{inspecting.actor.role?.toLowerCase() ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-ink-500">Entity</dt>
                <dd className="font-mono text-xs text-ink-900">
                  {inspecting.entityType} {inspecting.entityId ?? ''}
                </dd>
              </div>
              {inspecting.ipAddress && (
                <div>
                  <dt className="text-xs text-ink-500">IP address</dt>
                  <dd className="font-mono text-xs text-ink-900">{inspecting.ipAddress}</dd>
                </div>
              )}
            </dl>

            {inspecting.previousState !== null && inspecting.previousState !== undefined && (
              <StatePanel label="Before" value={inspecting.previousState} />
            )}
            {inspecting.newState !== null && inspecting.newState !== undefined && (
              <StatePanel label="After" value={inspecting.newState} />
            )}
            {inspecting.metadata !== null && inspecting.metadata !== undefined && (
              <StatePanel label="Context" value={inspecting.metadata} />
            )}

            <InlineNotice tone="neutral">
              Audit entries are immutable. They record business state only — never credentials,
              tokens or passwords.
            </InlineNotice>
          </div>
        )}
      </Modal>
    </>
  );
}

function StatePanel({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-ink-900 p-3 font-mono text-xs text-ink-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

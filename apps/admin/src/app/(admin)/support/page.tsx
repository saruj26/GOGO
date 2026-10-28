'use client';

import { dateTime, messageFor, relativeTime, type AdminSupportTicketRow } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Badge, Card, InlineNotice } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi } from '@/lib/admin-context';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  WAITING_ON_USER: 'Waiting on customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const TONE: Record<string, 'warning' | 'progress' | 'success' | 'neutral'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'progress',
  WAITING_ON_USER: 'neutral',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function SupportPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery();

  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'support', list.query],
    queryFn: ({ signal }) => admin.supportTickets(list.query, { signal }),
  });

  const columns: Column<AdminSupportTicketRow>[] = [
    {
      key: 'subject',
      header: 'Ticket',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{row.subject}</p>
          <p className="font-mono text-xs text-ink-400">{row.reference}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Customer',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-800">
            {row.user.firstName} {row.user.lastName ?? ''}
          </p>
          <p className="text-xs text-ink-500">{row.user.phone}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'About',
      cell: (row) => <span className="text-sm text-ink-600">{row.category}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge tone={TONE[row.status] ?? 'neutral'}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'age',
      header: 'Waiting',
      cell: (row) => (
        <span className="text-sm text-ink-600" title={dateTime(row.createdAt)}>
          {relativeTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button variant="secondary" size="sm" onClick={() => setOpenTicketId(row.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Support"
        description="Oldest unanswered first — a queue nobody has replied to should surface, not sink."
      />

      <Card>
        <ListToolbar
          search={list.search}
          onSearchChange={list.onSearchChange}
          searchPlaceholder="Reference, subject or phone"
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: list.filters.status,
              options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
              onChange: (value) => list.setFilter('status', value),
            },
          ]}
        />

        <DataTable
          rows={data?.items}
          columns={columns}
          rowKey={(row) => row.id}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          emptyTitle="No tickets"
          emptyDescription="Nothing is waiting on support right now."
          pagination={{
            page: data?.page ?? 1,
            totalPages: data?.totalPages ?? 1,
            total: data?.total ?? 0,
            onPageChange: list.setPage,
          }}
          mobileCard={(row) => (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-ink-900">{row.subject}</p>
              <p className="font-mono text-xs text-ink-400">{row.reference}</p>
              <p className="text-xs text-ink-500">
                {row.user.firstName} · {row.user.phone}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={TONE[row.status] ?? 'neutral'}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
                <span className="text-xs text-ink-400">{relativeTime(row.createdAt)}</span>
              </div>
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={() => setOpenTicketId(row.id)}>
                  Open
                </Button>
              </div>
            </div>
          )}
        />
      </Card>

      {openTicketId ? (
        <TicketModal
          ticketId={openTicketId}
          onClose={() => {
            setOpenTicketId(null);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
          }}
          onToast={toast}
        />
      ) : null}
    </>
  );
}

function TicketModal({
  ticketId,
  onClose,
  onToast,
}: {
  ticketId: string;
  onClose: () => void;
  onToast: ReturnType<typeof useToast>;
}) {
  const admin = useAdminApi();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'support', 'ticket', ticketId],
    queryFn: ({ signal }) => admin.supportTicket(ticketId, { signal }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });

  const send = useMutation({
    mutationFn: () => admin.replyToTicket(ticketId, { body: reply.trim(), internal }),
    onSuccess: () => {
      setReply('');
      onToast.success(internal ? 'Note added.' : 'Reply sent to the customer.');
      void invalidate();
    },
    onError: (caught) => onToast.error(messageFor(caught)),
  });

  const setStatus = useMutation({
    mutationFn: (next: string) => admin.setTicketStatus(ticketId, next),
    onSuccess: () => {
      onToast.success('Ticket updated.');
      void invalidate();
    },
    onError: (caught) => onToast.error(messageFor(caught)),
  });

  const assign = useMutation({
    mutationFn: () => admin.assignTicket(ticketId),
    onSuccess: () => {
      onToast.success('Assigned to you.');
      void invalidate();
    },
    onError: (caught) => onToast.error(messageFor(caught)),
  });

  return (
    <Modal open onClose={onClose} title={data?.reference ?? 'Ticket'}>
      {isLoading || !data ? (
        <p className="p-4 text-sm text-ink-500">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-base font-medium text-ink-900">{data.subject}</p>
            <p className="mt-1 text-sm text-ink-500">
              {data.user.firstName} {data.user.lastName ?? ''} · {data.user.phone} · {data.category}
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-100">
            <ul className="divide-y divide-ink-100">
              {data.messages.map((message) => (
                <li
                  key={message.id}
                  className={message.internal ? 'bg-amber-50 px-3 py-2' : 'px-3 py-2'}
                >
                  <p className="text-xs font-medium text-ink-500">
                    {message.author.firstName}
                    {message.internal ? ' · internal note' : ''}
                    {' · '}
                    {relativeTime(message.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{message.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <TextAreaField
            label="Reply"
            value={reply}
            rows={4}
            maxLength={4000}
            onChange={(event) => setReply(event.target.value)}
          />

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={internal}
              onChange={(event) => setInternal(event.target.checked)}
              className="size-4"
            />
            Internal note — not shown to the customer
          </label>

          {internal ? (
            <InlineNotice tone="warning">
              An internal note is invisible to the customer, so it cannot answer them.
            </InlineNotice>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={send.isPending}
              disabled={reply.trim().length === 0}
              onClick={() => send.mutate()}
            >
              {internal ? 'Add note' : 'Send reply'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={assign.isPending}
              onClick={() => assign.mutate()}
            >
              Assign to me
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={setStatus.isPending}
              onClick={() => setStatus.mutate('RESOLVED')}
            >
              Mark resolved
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={setStatus.isPending}
              onClick={() => setStatus.mutate('CLOSED')}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

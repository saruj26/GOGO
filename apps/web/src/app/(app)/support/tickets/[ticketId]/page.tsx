'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, relativeTime } from '@rideflow/shared';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import {
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'Being looked at',
  WAITING_ON_USER: 'Waiting for you',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);
  const api = useApi();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: ({ signal }) => api.support.get(ticketId, { signal }),
    // A ticket is a conversation; a reply can land while it is open.
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: () => api.support.reply(ticketId, reply.trim()),
    onSuccess: async () => {
      setReply('');
      await queryClient.invalidateQueries({ queryKey: ['support'] });
    },
  });

  if (isLoading) return <LoadingBlock label="Loading this ticket" />;

  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : 'We could not load that ticket.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const closed = data.status === 'CLOSED';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} label={STATUS_LABEL[data.status] ?? data.status} />
          <span className="font-mono text-xs text-ink-400">{data.reference}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">{data.subject}</h1>
      </header>

      <Card className="mb-4">
        <CardHeader title="Conversation" />
        <ul className="flex flex-col gap-3 p-4">
          {data.messages.map((message) => (
            <li
              key={message.id}
              className={message.fromSupport ? 'self-start' : 'self-end'}
              style={{ maxWidth: '85%' }}
            >
              <div
                className={
                  message.fromSupport
                    ? 'rounded-2xl bg-ink-100 px-3 py-2'
                    : 'rounded-2xl bg-brand-50 px-3 py-2'
                }
              >
                <p className="text-xs font-medium text-ink-500">
                  {message.fromSupport ? 'Support' : 'You'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{message.body}</p>
                <p className="mt-1 text-xs text-ink-400">{relativeTime(message.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {closed ? (
        <InlineNotice tone="neutral">
          This ticket is closed. Raise a new one if you still need help.
        </InlineNotice>
      ) : (
        <Card>
          <CardHeader title="Reply" />
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (reply.trim().length > 0) send.mutate();
            }}
          >
            <TextAreaField
              label="Your reply"
              value={reply}
              rows={4}
              maxLength={4000}
              onChange={(event) => setReply(event.target.value)}
            />
            {send.isError ? (
              <InlineNotice tone="danger">
                {send.error instanceof ApiError
                  ? send.error.message
                  : 'We could not send that reply.'}
              </InlineNotice>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={send.isPending}
              disabled={reply.trim().length === 0}
            >
              Send reply
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

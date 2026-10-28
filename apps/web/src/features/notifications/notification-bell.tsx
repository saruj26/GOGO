'use client';

import { relativeTime } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { EmptyState, LoadingBlock } from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

export function NotificationBell() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) => api.notifications.unreadCount({ signal }),
    // Polled gently: a badge is not worth a socket, and hammering it would be
    // rude to the API.
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ signal }) => api.notifications.list({ limit: 20 }, { signal }),
    enabled: open,
  });

  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const count = unread?.count ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative -m-2 rounded-full p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5 2 6H4c1-1 2-2.5 2-6z" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-critical-500 px-1 text-[11px] font-semibold leading-[18px] text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          count > 0 ? (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Mark all as read
            </button>
          ) : undefined
        }
      >
        {isLoading ? (
          <LoadingBlock />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="Nothing yet" description="Updates about your trips and orders appear here." />
        ) : (
          <ul className="flex flex-col divide-y divide-ink-200">
            {data.items.map((notification) => (
              <li key={notification.id} className="flex gap-3 py-3">
                <span
                  className={
                    notification.readAt
                      ? 'mt-1.5 size-2 shrink-0 rounded-full bg-transparent'
                      : 'mt-1.5 size-2 shrink-0 rounded-full bg-brand-500'
                  }
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{notification.title}</p>
                  <p className="mt-0.5 text-sm text-ink-600">{notification.body}</p>
                  <p className="mt-1 text-xs text-ink-400">{relativeTime(notification.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

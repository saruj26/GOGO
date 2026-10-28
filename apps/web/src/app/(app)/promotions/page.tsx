'use client';

import { SERVICE_LABEL, dateTime, messageFor, money } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, EmptyState, ErrorState, Badge, Skeleton } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/lib/api-context';

/**
 * Promotions this customer can still use.
 *
 * The backend filters out anything they have exhausted, so nothing here is
 * advertised and then refused at checkout.
 */
export default function PromotionsPage() {
  const api = useApi();
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['promotions'],
    queryFn: ({ signal }) => api.account.promotions({ signal }),
  });

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success(`${code} copied.`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Could not copy. Write it down instead.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Promotions</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Enter a code at checkout. The discount is applied by us, not by the app.
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No promotions right now"
          description="When something is available to you, it will be here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((promotion) => (
            <li key={promotion.code}>
              <Card className="overflow-hidden">
                <div className="flex items-stretch">
                  <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-share-100 px-2 py-4 text-center">
                    <span className="text-xl font-bold text-share-700">
                      {promotion.type === 'PERCENT'
                        ? `${Number(promotion.value)}%`
                        : money(promotion.value)}
                    </span>
                    <span className="mt-0.5 text-[11px] font-medium text-share-700">off</span>
                  </div>

                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink-900">{promotion.name}</h2>
                      {promotion.appliesTo?.map((service) => (
                        <Badge key={service} tone="neutral">
                          {SERVICE_LABEL[service]}
                        </Badge>
                      ))}
                    </div>

                    {promotion.description && (
                      <p className="mt-1 text-sm text-ink-500">{promotion.description}</p>
                    )}

                    <ul className="mt-2 flex flex-col gap-0.5 text-xs text-ink-500">
                      {Number(promotion.minOrderAmount) > 0 && (
                        <li>Minimum spend {money(promotion.minOrderAmount)}</li>
                      )}
                      {promotion.maxDiscount && <li>Up to {money(promotion.maxDiscount)} off</li>}
                      <li>Expires {dateTime(promotion.expiresAt)}</li>
                      <li>
                        {promotion.usesLeft} {promotion.usesLeft === 1 ? 'use' : 'uses'} left
                      </li>
                    </ul>

                    <button
                      type="button"
                      onClick={() => copy(promotion.code)}
                      className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-ink-400 px-3 py-1.5 font-mono text-sm font-semibold text-ink-900 hover:bg-ink-50"
                    >
                      {promotion.code}
                      <span className="text-xs font-sans font-medium text-brand-700">
                        {copied === promotion.code ? 'copied' : 'copy'}
                      </span>
                    </button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

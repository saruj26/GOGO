'use client';

import { messageFor, money, type MenuItem } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingBlock,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/lib/api-context';

export default function RestaurantPage() {
  const { slug } = useParams<{ slug: string }>();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);

  const { data: restaurant, isLoading, error, refetch } = useQuery({
    queryKey: ['restaurant', slug],
    queryFn: ({ signal }) => api.food.restaurant(slug, { signal }),
  });

  const { data: cart } = useQuery({
    queryKey: ['cart', restaurant?.id],
    queryFn: ({ signal }) => api.food.cart(restaurant!.id, { signal }),
    enabled: Boolean(restaurant?.id),
    // A missing cart is a normal state, not an error worth retrying.
    retry: false,
  });

  const addItem = useMutation({
    mutationFn: (menuItemId: string) => api.food.addItem({ menuItemId, quantity: 1 }),
    onMutate: (menuItemId) => setAdding(menuItemId),
    onSuccess: () => {
      toast.success('Added to your cart.');
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
    onSettled: () => setAdding(null),
  });

  if (isLoading) return <LoadingBlock label="Loading the menu" />;

  if (error || !restaurant) {
    return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;
  }

  const itemCount = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl pb-24 lg:max-w-4xl lg:pb-8">
      <div className="relative h-36 bg-linear-to-br from-brand-100 to-brand-200 sm:h-48">
        {restaurant.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={restaurant.coverUrl} alt="" className="size-full object-cover" />
        )}
      </div>

      <div className="px-4 sm:px-6">
        <div className="-mt-6 flex flex-col gap-3 rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink-900">{restaurant.name}</h1>
            {restaurant.description && (
              <p className="mt-1 text-sm text-ink-500">{restaurant.description}</p>
            )}
            <p className="mt-2 text-sm text-ink-500">{restaurant.addressLine}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {Number(restaurant.rating.count) > 0 && (
                <Badge tone="neutral">★ {restaurant.rating.average} ({restaurant.rating.count})</Badge>
              )}
              <Badge tone="neutral">{restaurant.defaultPrepMinutes} min</Badge>
              <Badge tone="neutral">Min {money(restaurant.minOrderAmount)}</Badge>
            </div>
          </div>

          {!restaurant.isAcceptingOrders && (
            <div className="shrink-0">
              <Badge tone="warning">Not taking orders right now</Badge>
            </div>
          )}
        </div>

        {restaurant.categories.length === 0 ? (
          <EmptyState title="No menu yet" description="This restaurant has not published a menu." />
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {restaurant.categories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-2 text-base font-semibold text-ink-900">{category.name}</h2>
                <ul className="flex flex-col gap-2">
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <MenuRow
                        item={item}
                        disabled={!restaurant.isAcceptingOrders}
                        adding={adding === item.id}
                        onAdd={() => addItem.mutate(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {cart?.hasPriceChanges && (
          <div className="mt-4">
            <InlineNotice tone="warning">
              Some prices in your cart have changed. The amount charged is recalculated at checkout.
            </InlineNotice>
          </div>
        )}
      </div>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-30 px-4 pb-3 lg:sticky lg:bottom-4 lg:mt-6">
          <Link href="/food/cart" className="mx-auto block max-w-3xl">
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-ink-900 px-4 py-3 text-white shadow-lg">
              <span className="text-sm font-medium">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} · {money(cart?.itemsSubtotal ?? '0')}
              </span>
              <span className="text-sm font-semibold">View cart →</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function MenuRow({
  item,
  disabled,
  adding,
  onAdd,
}: {
  item: MenuItem;
  disabled: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const unavailable = !item.available;

  return (
    <Card className={unavailable ? 'p-3 opacity-60' : 'p-3'}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate font-medium text-ink-900">{item.name}</h3>
            {unavailable && <Badge tone="neutral">Sold out</Badge>}
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{item.description}</p>
          )}
          <p className="mt-1.5 font-semibold text-ink-900">{money(item.price, item.currency)}</p>
        </div>

        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="size-16 shrink-0 rounded-lg object-cover"
          />
        )}

        <Button
          size="sm"
          variant={unavailable || disabled ? 'secondary' : 'primary'}
          disabled={unavailable || disabled}
          loading={adding}
          onClick={onAdd}
          aria-label={`Add ${item.name} to cart`}
          className="shrink-0 self-center"
        >
          {unavailable ? 'Sold out' : 'Add'}
        </Button>
      </div>
    </Card>
  );
}

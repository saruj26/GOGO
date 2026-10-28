'use client';

import {
  messageFor,
  money,
  type Cart,
  type PaymentMethod,
  type Place,
} from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingBlock,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { LocationSearch } from '@/features/booking/location-search';
import { useApi } from '@/lib/api-context';
import { useAuth } from '@/lib/auth';

export default function CartPage() {
  const api = useApi();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['carts'],
    queryFn: ({ signal }) => api.food.carts({ signal }),
  });

  if (isLoading) return <LoadingBlock label="Loading your cart" />;
  if (error) return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;

  if (!data || data.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <EmptyState
          title="Your cart is empty"
          description="Find something to eat and it will show up here."
          action={
            <Link href="/food">
              <Button>Browse restaurants</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 text-xl font-semibold text-ink-900">
        {data.length === 1 ? 'Your cart' : 'Your carts'}
      </h1>

      <div className="flex flex-col gap-5">
        {data.map((cart) => (
          <CartPanel key={cart.cartId} cart={cart} />
        ))}
      </div>
    </div>
  );
}

function CartPanel({ cart }: { cart: Cart }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [address, setAddress] = useState<Place | null>(null);
  const [note, setNote] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['carts'] });
    void queryClient.invalidateQueries({ queryKey: ['cart'] });
  };

  const updateItem = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.food.updateItem(id, { quantity }),
    onSuccess: invalidate,
    onError: (caught) => toast.error(messageFor(caught)),
  });

  const clear = useMutation({
    mutationFn: () => api.food.clearCart(cart.restaurant.id),
    onSuccess: () => {
      toast.success('Cart emptied.');
      invalidate();
    },
  });

  const checkout = useMutation({
    mutationFn: () =>
      api.food.checkout(cart.restaurant.id, {
        deliveryAddress: address as Place,
        paymentMethod,
        deliveryNote: note.trim() || undefined,
        promotionCode: promotionCode.trim() || undefined,
      }),
    onSuccess: (order) => {
      toast.success('Order placed.');
      invalidate();
      router.push(`/food/orders/${order.orderId}`);
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  const blocked =
    !address ||
    !cart.meetsMinimum ||
    cart.hasUnavailableItems ||
    !cart.restaurant.isAcceptingOrders;

  return (
    <Card>
      <CardHeader
        title={cart.restaurant.name}
        description={`${cart.restaurant.prepMinutes} min preparation`}
        action={
          <button
            type="button"
            onClick={() => clear.mutate()}
            className="text-sm text-ink-500 hover:text-critical-700"
          >
            Empty
          </button>
        }
      />

      <ul className="divide-y divide-ink-100">
        {cart.items.map((line) => (
          <li key={line.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink-900">{line.name}</p>
              <p className="text-sm text-ink-500">
                {money(line.unitPrice, cart.currency)} each
                {!line.available && (
                  <span className="ml-2 font-medium text-critical-700">no longer available</span>
                )}
                {line.priceChanged && line.available && (
                  <span className="ml-2 font-medium text-caution-700">
                    now {money(line.currentPrice, cart.currency)}
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <QuantityButton
                label={`Decrease ${line.name}`}
                onClick={() => updateItem.mutate({ id: line.id, quantity: line.quantity - 1 })}
                disabled={updateItem.isPending}
              >
                −
              </QuantityButton>
              <span className="w-7 text-center text-sm font-medium tabular-nums">
                {line.quantity}
              </span>
              <QuantityButton
                label={`Increase ${line.name}`}
                onClick={() => updateItem.mutate({ id: line.id, quantity: line.quantity + 1 })}
                disabled={updateItem.isPending || !line.available}
              >
                +
              </QuantityButton>
            </div>

            <p className="w-20 shrink-0 text-right font-medium text-ink-900">
              {money(line.lineTotal, cart.currency)}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-ink-200 p-4">
        {/*
          Only the item subtotal is known before checkout. The delivery fee,
          service fee, tax and any discount are calculated by the backend from
          the routed distance and the current pricing rule — the browser never
          works out what is owed.
        */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-600">Items</span>
          <span className="font-medium text-ink-900">
            {money(cart.itemsSubtotal, cart.currency)}
          </span>
        </div>
        <p className="-mt-1 text-xs text-ink-500">
          Delivery and any fees are calculated when you place the order.
        </p>

        {!cart.meetsMinimum && (
          <InlineNotice tone="warning">
            This restaurant has a minimum order of {money(cart.minimumOrderAmount, cart.currency)}.
          </InlineNotice>
        )}

        {cart.hasUnavailableItems && (
          <InlineNotice tone="danger">
            Remove the unavailable items before checking out.
          </InlineNotice>
        )}

        {!cart.restaurant.isAcceptingOrders && (
          <InlineNotice tone="warning">
            {cart.restaurant.name} is not taking orders at the moment.
          </InlineNotice>
        )}

        <LocationSearch
          label="Deliver to"
          placeholder="Where should we bring it?"
          value={address}
          onChange={setAddress}
          showCurrentLocation
          tone="dropoff"
        />

        <SelectField
          label="Payment"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          hint={
            paymentMethod === 'WALLET' && user?.wallet
              ? `Wallet balance ${money(user.wallet.balance, user.wallet.currency)}`
              : 'Card and online payment are not available yet.'
          }
        >
          <option value="CASH">Cash on delivery</option>
          <option value="WALLET">Wallet</option>
        </SelectField>

        <TextField
          label="Promotion code"
          placeholder="Optional"
          value={promotionCode}
          onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
        />

        <TextAreaField
          label="Note for the courier"
          placeholder="Blue gate, second floor…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />

        {error && <InlineNotice tone="danger">{error}</InlineNotice>}

        <Button
          size="lg"
          fullWidth
          disabled={blocked}
          loading={checkout.isPending}
          onClick={() => {
            setError(null);
            checkout.mutate();
          }}
        >
          Place order
        </Button>
      </div>
    </Card>
  );
}

function QuantityButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 items-center justify-center rounded-full text-lg text-ink-700 ring-1 ring-inset ring-ink-300 hover:bg-ink-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

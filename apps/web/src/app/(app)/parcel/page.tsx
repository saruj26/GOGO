'use client';

import {
  distance,
  duration,
  messageFor,
  money,
  type ParcelQuote,
  type ParcelType,
  type PaymentMethod,
  type Place,
} from '@rideflow/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import {
  Card,
  CardHeader,
  InlineNotice,
  LoadingBlock,
  Skeleton,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { LocationSearch } from '@/features/booking/location-search';
import { useApi } from '@/lib/api-context';

export default function ParcelPage() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [parcelTypeId, setParcelTypeId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [quote, setQuote] = useState<ParcelQuote | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: types, isLoading: typesLoading } = useQuery({
    queryKey: ['parcel-types'],
    queryFn: ({ signal }) => api.parcels.types({ signal }),
  });

  const parcelType = types?.find((t) => t.id === parcelTypeId) ?? null;

  const contactsComplete =
    senderName.trim() && senderPhone.trim() && receiverName.trim() && receiverPhone.trim();
  const canEstimate = Boolean(pickup && dropoff && parcelTypeId && contactsComplete);

  const points = () => ({
    pickup: {
      ...(pickup as Place),
      contactName: senderName.trim(),
      contactPhone: senderPhone.trim(),
    },
    dropoff: {
      ...(dropoff as Place),
      contactName: receiverName.trim(),
      contactPhone: receiverPhone.trim(),
    },
  });

  const {
    data: quotes,
    isFetching: quoting,
    error: quoteError,
  } = useQuery({
    queryKey: ['parcel-estimate', pickup, dropoff, parcelTypeId, weightKg],
    queryFn: ({ signal }) =>
      api.parcels.estimate(
        {
          ...points(),
          parcelTypeId,
          weightKg: weightKg ? Number(weightKg) : undefined,
        },
        { signal },
      ),
    enabled: canEstimate,
  });

  const book = useMutation({
    mutationFn: () =>
      api.parcels.create({
        ...points(),
        parcelTypeId,
        vehicleTypeId: (quote as ParcelQuote).vehicleTypeId,
        paymentMethod,
        weightKg: weightKg ? Number(weightKg) : undefined,
        declaredValue: declaredValue ? Number(declaredValue) : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (parcel) => {
      toast.success('Parcel booked. We are finding a courier.');
      router.push(`/parcel/${parcel.parcelId}`);
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Send a parcel</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Door to door, with tracking the whole way.
          </p>
        </div>
        <Link href="/history?tab=parcels" className="shrink-0 text-sm font-medium text-brand-700 hover:underline">
          My parcels
        </Link>
      </header>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-700">Collection</h2>
          <LocationSearch
            label="Pickup address"
            placeholder="Where should we collect from?"
            value={pickup}
            onChange={setPickup}
            showCurrentLocation
            tone="pickup"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Sender name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              required
            />
            <TextField
              label="Sender phone"
              type="tel"
              inputMode="tel"
              placeholder="+94 77 123 4567"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              required
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-700">Delivery</h2>
          <LocationSearch
            label="Destination address"
            placeholder="Where is it going?"
            value={dropoff}
            onChange={setDropoff}
            tone="dropoff"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Receiver name"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              required
            />
            <TextField
              label="Receiver phone"
              type="tel"
              inputMode="tel"
              placeholder="+94 77 123 4567"
              value={receiverPhone}
              onChange={(e) => setReceiverPhone(e.target.value)}
              required
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink-700">The parcel</h2>

          {typesLoading ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <SelectField
              label="What are you sending?"
              value={parcelTypeId}
              onChange={(e) => {
                setParcelTypeId(e.target.value);
                setQuote(null);
              }}
              required
              hint={parcelType ? describeType(parcelType) : 'Choose the closest match.'}
            >
              <option value="">Choose a parcel type</option>
              {types?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} — up to {type.maxWeightKg} kg
                </option>
              ))}
            </SelectField>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="Optional"
              value={weightKg}
              onChange={(e) => {
                setWeightKg(e.target.value);
                setQuote(null);
              }}
              hint="Helps us send the right vehicle."
            />
            <TextField
              label="Declared value"
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Optional"
              value={declaredValue}
              onChange={(e) => setDeclaredValue(e.target.value)}
            />
          </div>

          <TextAreaField
            label="Notes for the courier"
            placeholder="Fragile, ring the bell twice…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
          />
        </Card>

        {/* Vehicle classes and prices come from the backend, which decides what
            can legally carry this parcel. */}
        <Card>
          <CardHeader
            title="Price"
            description={
              canEstimate
                ? 'Only vehicles that can carry this parcel are shown.'
                : 'Fill in the details above to see prices.'
            }
          />
          <div className="p-4">
            {!canEstimate ? (
              <p className="text-sm text-ink-500">
                We need both addresses, both contacts and a parcel type.
              </p>
            ) : quoting ? (
              <LoadingBlock label="Pricing your parcel" />
            ) : quoteError ? (
              <InlineNotice tone="danger">{messageFor(quoteError)}</InlineNotice>
            ) : !quotes || quotes.length === 0 ? (
              <InlineNotice tone="warning">
                No vehicle on the platform can carry this parcel. Try a larger parcel type.
              </InlineNotice>
            ) : (
              <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Vehicle">
                {quotes.map((option) => {
                  const selected = quote?.vehicleTypeId === option.vehicleTypeId;
                  return (
                    <li key={option.vehicleTypeId}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setQuote(option)}
                        className={clsx(
                          'flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3 text-left',
                          selected
                            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                            : 'border-ink-200 hover:border-ink-300',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-ink-900">
                            {option.vehicleTypeName}
                          </span>
                          <span className="block text-xs text-ink-500">
                            {distance(option.distanceM)} · {duration(option.durationS)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold text-ink-900">
                          {money(option.total, option.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {quote && (
              <dl className="mt-4 flex flex-col gap-1.5 border-t border-ink-200 pt-3 text-sm">
                {quote.breakdown.map((line) => (
                  <div key={line.code + line.label} className="flex justify-between">
                    <dt className="text-ink-600">{line.label}</dt>
                    <dd className="text-ink-800">{money(line.amount, quote.currency)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <SelectField
            label="Payment"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            hint="Card and online payment are not available yet."
          >
            <option value="CASH">Cash on collection</option>
            <option value="WALLET">Wallet</option>
          </SelectField>
        </Card>

        {error && <InlineNotice tone="danger">{error}</InlineNotice>}

        <Button
          size="lg"
          fullWidth
          disabled={!quote}
          loading={book.isPending}
          onClick={() => {
            setError(null);
            book.mutate();
          }}
        >
          {quote ? `Book for ${money(quote.total, quote.currency)}` : 'Book parcel'}
        </Button>
      </div>
    </div>
  );
}

function describeType(type: ParcelType): string {
  const parts = [`Up to ${type.maxWeightKg} kg`];
  if (type.minVehicleTypeCode) parts.push(`needs at least a ${type.minVehicleTypeCode.toLowerCase().replace('_', ' ')}`);
  if (type.requiresSignature) parts.push('signature required');
  return parts.join(' · ');
}

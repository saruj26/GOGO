'use client';

import { dateTime, messageFor, money, phone as formatPhone } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import {
  Card,
  CardHeader,
  EmptyState,
  InlineNotice,
  LoadingBlock,
  Skeleton,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { LocationSearch } from '@/features/booking/location-search';
import { useApi } from '@/lib/api-context';
import { useAuth } from '@/lib/auth';
import type { Place } from '@rideflow/shared';

export default function ProfilePage() {
  const { user, signOut, loading } = useAuth();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [addingPlace, setAddingPlace] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['account-summary'],
    queryFn: ({ signal }) => api.account.summary({ signal }),
  });

  const { data: places, isLoading: placesLoading } = useQuery({
    queryKey: ['places', 'saved'],
    queryFn: ({ signal }) => api.places.saved({ signal }),
  });

  const removePlace = useMutation({
    mutationFn: (id: string) => api.places.removeSaved(id),
    onSuccess: () => {
      toast.success('Place removed.');
      void queryClient.invalidateQueries({ queryKey: ['places', 'saved'] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
  });

  if (loading) return <LoadingBlock label="Loading your profile" />;
  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5 flex items-center gap-4">
        <Avatar name={user.firstName} className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink-900">
            {user.firstName} {user.lastName ?? ''}
          </h1>
          <p className="text-sm text-ink-500">{formatPhone(user.phone)}</p>
          {user.email && <p className="truncate text-sm text-ink-500">{user.email}</p>}
        </div>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Rides" value={summary?.rides} />
        <Stat label="Food orders" value={summary?.foodOrders} />
        <Stat label="Parcels" value={summary?.parcels} />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Wallet"
          action={
            <Link href="/payments" className="text-sm font-medium text-brand-700 hover:underline">
              Details
            </Link>
          }
        />
        <div className="p-4">
          <p className="text-2xl font-semibold text-ink-900">
            {money(user.wallet?.balance ?? '0.00', user.wallet?.currency)}
          </p>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Saved places"
          description="Shortcuts when you book."
          action={
            <Button size="sm" variant="secondary" onClick={() => setAddingPlace(true)}>
              Add
            </Button>
          }
        />

        {placesLoading ? (
          <div className="p-4">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !places || places.length === 0 ? (
          <EmptyState title="No saved places" description="Save home or work to book faster." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {places.map((place) => (
              <li key={place.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{place.label}</p>
                  <p className="truncate text-sm text-ink-500">{place.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removePlace.mutate(place.id)}
                  className="shrink-0 text-sm text-ink-500 hover:text-critical-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Account" />
        <ul className="divide-y divide-ink-100">
          <NavRow href="/safety" label="Safety and shared-ride preferences" />
          <NavRow href="/history" label="Trip and order history" />
          <NavRow href="/payments" label="Payments and wallet" />
          <NavRow href="/promotions" label="Promotions" />
          <NavRow href="/profile/edit" label="Edit profile" />
          <NavRow href="/support" label="Help and support" />
          <NavRow href="/support/tickets" label="Your support tickets" />
        </ul>
      </Card>

      <div className="mb-4">
        <InlineNotice tone="neutral">
          Your phone number is how you sign in, so it is changed by support rather than here.
        </InlineNotice>
      </div>

      <p className="mb-4 text-xs text-ink-400">Member since {dateTime(user.createdAt)}</p>

      <Button variant="secondary" fullWidth onClick={() => void signOut()}>
        Sign out
      </Button>

      <AddPlaceDialog open={addingPlace} onClose={() => setAddingPlace(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xl font-semibold text-ink-900">{value ?? '—'}</p>
      <p className="mt-0.5 text-xs text-ink-500">{label}</p>
    </Card>
  );
}

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between px-4 py-3 hover:bg-ink-50">
        <span className="text-sm text-ink-800">{label}</span>
        <svg viewBox="0 0 20 20" className="size-4 text-ink-400" fill="currentColor" aria-hidden="true">
          <path d="M7.2 4.2a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.4 10 7.2 5.6a1 1 0 0 1 0-1.4z" />
        </svg>
      </Link>
    </li>
  );
}

function AddPlaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.places.save({
        label: label.trim(),
        address: (place as Place).address,
        lat: (place as Place).lat,
        lng: (place as Place).lng,
      }),
    onSuccess: () => {
      toast.success('Place saved.');
      void queryClient.invalidateQueries({ queryKey: ['places', 'saved'] });
      setLabel('');
      setPlace(null);
      onClose();
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save a place"
      size="sm"
      footer={
        <Button
          fullWidth
          disabled={!label.trim() || !place}
          loading={save.isPending}
          onClick={() => {
            setError(null);
            save.mutate();
          }}
        >
          Save place
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Name it"
          placeholder="Home, Work, Amma's house…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          required
        />
        <LocationSearch
          label="Address"
          placeholder="Search for the address"
          value={place}
          onChange={setPlace}
          showCurrentLocation
        />
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

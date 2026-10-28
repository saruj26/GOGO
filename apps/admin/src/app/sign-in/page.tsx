'use client';

import { messageFor } from '@rideflow/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/surfaces';
import { useMounted } from '@/hooks/use-mounted';
import { useAuth } from '@/lib/auth';

export default function AdminSignInPage() {
  const { signIn, signedIn, isAdmin, signOut } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mounted = useMounted();

  useEffect(() => {
    if (mounted && signedIn && isAdmin) router.replace('/');
  }, [mounted, signedIn, isAdmin, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await signIn(phone.trim(), password);

      if (!user.roles.includes('ADMIN')) {
        // Signed in as a real person, just not one with access here. Ending the
        // session avoids leaving them in a half-authenticated state.
        await signOut();
        setError('That account does not have administrator access.');
        return;
      }

      router.replace('/');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-linear-to-br from-ink-900 to-brand-900 px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden="true">
            <rect width="32" height="32" rx="9" className="fill-brand-600" />
            <path d="M8 21c0-5 3.6-9 8-9s8 4 8 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="11" cy="21" r="2.5" fill="white" />
            <circle cx="21" cy="21" r="2.5" fill="white" />
          </svg>
          <div>
            <p className="font-semibold tracking-tight text-ink-900">RideFlow</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-brand-700">Admin</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-ink-900">Sign in</h1>
        <p className="mt-1 text-sm text-ink-500">Administrator access only.</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <TextField
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <InlineNotice tone="danger">{error}</InlineNotice>}

          <Button type="submit" size="lg" fullWidth loading={submitting}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

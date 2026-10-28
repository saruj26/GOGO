'use client';

import { messageFor } from '@rideflow/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/surfaces';
import { useAuth } from '@/lib/auth';

function SignInForm() {
  const { signIn, signedIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const expired = params.get('reason') === 'expired';
  const next = params.get('next') ?? '/';

  useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, router, next]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(phone.trim(), password);
      router.replace(next);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-ink-900">Sign in</h1>
      <p className="mt-1 text-sm text-ink-500">Welcome back.</p>

      {expired && (
        <div className="mt-4">
          <InlineNotice tone="warning">
            Your session ended. Please sign in again.
          </InlineNotice>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+94 77 123 4567"
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

      <p className="mt-6 text-center text-sm text-ink-500">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

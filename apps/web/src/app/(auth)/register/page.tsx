'use client';

import { messageFor } from '@rideflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { InlineNotice } from '@/components/ui/surfaces';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    gender: 'UNDISCLOSED',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password.length < 10) {
      setError('Choose a password of at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        gender: form.gender,
      });
      router.replace('/');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-ink-900">Create your account</h1>
      <p className="mt-1 text-sm text-ink-500">It takes a minute.</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => set('firstName')(e.target.value)}
            required
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => set('lastName')(e.target.value)}
          />
        </div>

        <TextField
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+94 77 123 4567"
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
          required
        />

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          hint="Optional — used for receipts."
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
        />

        <SelectField
          label="Gender"
          hint="Used only to match shared rides against safety preferences."
          value={form.gender}
          onChange={(e) => set('gender')(e.target.value)}
        >
          <option value="UNDISCLOSED">Prefer not to say</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
        </SelectField>

        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          required
        />

        {error && <InlineNotice tone="danger">{error}</InlineNotice>}

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

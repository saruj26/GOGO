'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ApiError, type Gender, phone as formatPhone } from '@rideflow/shared';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { Card, CardHeader, InlineNotice, LoadingBlock } from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';
import { useAuth } from '@/lib/auth';

/**
 * Edit the profile fields a person owns.
 *
 * Phone is shown but not editable. It is the login identifier, and the backend
 * will not move an account onto a number nobody has proved they control —
 * showing that plainly beats a field that silently fails.
 */
export default function EditProfilePage() {
  const api = useApi();
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [gender, setGender] = useState<Gender>(user?.gender ?? 'UNDISCLOSED');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      api.auth.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        gender,
      }),
    onSuccess: () => {
      // Re-read rather than patching locally, so what is shown is what the
      // server stored.
      refresh();
      router.push('/profile');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.details) {
        setErrors(error.details as Record<string, string>);
      }
    },
  });

  if (!user) return <LoadingBlock label="Loading your account" />;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const next: Record<string, string> = {};
    if (firstName.trim().length === 0) next.firstName = 'Enter your first name';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    save.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Edit profile</h1>
      </header>

      <Card className="mb-4">
        <CardHeader title="Your details" />
        <form onSubmit={submit} className="flex flex-col gap-4 p-4">
          <TextField
            label="First name"
            value={firstName}
            error={errors.firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />

          <TextField
            label="Last name"
            value={lastName}
            error={errors.lastName}
            onChange={(event) => setLastName(event.target.value)}
          />

          <TextField
            label="Email"
            type="email"
            value={email}
            hint="Changing this means it needs verifying again"
            error={errors.email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <SelectField
            label="Gender"
            value={gender}
            hint="Used by shared-ride safety matching, so it changes who you can share with"
            onChange={(event) => setGender(event.target.value as Gender)}
          >
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
            <option value="UNDISCLOSED">Prefer not to say</option>
          </SelectField>

          {save.isError && Object.keys(errors).length === 0 ? (
            <InlineNotice tone="danger">
              {save.error instanceof ApiError
                ? save.error.message
                : 'We could not save that. Please try again.'}
            </InlineNotice>
          ) : null}

          <Button type="submit" variant="primary" fullWidth loading={save.isPending}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Phone number" />
        <div className="p-4">
          <p className="text-base font-medium text-ink-900">{formatPhone(user.phone)}</p>
          <div className="mt-3">
            <InlineNotice tone="neutral">
              Your phone number is how you sign in, so it cannot be changed here. Contact support
              to change it.
            </InlineNotice>
          </div>
        </div>
      </Card>
    </div>
  );
}

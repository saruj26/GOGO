'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@rideflow/shared';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Card, CardHeader, InlineNotice } from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

/** The categories the backend accepts. Anything else is refused server-side. */
const CATEGORIES: Array<[string, string]> = [
  ['RIDE', 'A ride'],
  ['SHARED_RIDE', 'A shared ride'],
  ['FOOD', 'A food order'],
  ['PARCEL', 'A parcel'],
  ['PAYMENT', 'A payment'],
  ['ACCOUNT', 'My account'],
  ['SAFETY', 'Safety'],
  ['OTHER', 'Something else'],
];

export default function NewTicketPage() {
  const api = useApi();
  const router = useRouter();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('RIDE');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => api.support.create({ subject, category, description }),
    onSuccess: (ticket) => router.replace(`/support/tickets/${ticket.id}`),
    onError: (error) => {
      if (error instanceof ApiError && error.details) {
        setErrors(error.details as Record<string, string>);
      }
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    const next: Record<string, string> = {};
    if (subject.trim().length < 4) next.subject = 'Give it a short title';
    if (description.trim().length < 10) next.description = 'Tell us a little more so we can help';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate();
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Raise a ticket</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Tell us what happened and we will look into it.
        </p>
      </header>

      <Card>
        <CardHeader title="What went wrong?" />
        <form onSubmit={submit} className="flex flex-col gap-4 p-4">
          <SelectField
            label="What is it about?"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Title"
            value={subject}
            maxLength={160}
            placeholder="e.g. Driver did not arrive"
            error={errors.subject}
            onChange={(event) => setSubject(event.target.value)}
          />

          <TextAreaField
            label="What happened?"
            value={description}
            rows={6}
            maxLength={4000}
            placeholder="Tell us what went wrong, and when"
            error={errors.description}
            onChange={(event) => setDescription(event.target.value)}
          />

          {create.isError && !Object.keys(errors).length ? (
            <InlineNotice tone="danger">
              {create.error instanceof ApiError
                ? create.error.message
                : 'We could not send that. Please try again.'}
            </InlineNotice>
          ) : null}

          <Button type="submit" variant="primary" fullWidth loading={create.isPending}>
            Send to support
          </Button>
        </form>
      </Card>
    </div>
  );
}

'use client';

import { messageFor, type SharedRideGenderPreference } from '@rideflow/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  InlineNotice,
  LoadingBlock,
  SharedBadge,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/lib/api-context';
import { useAuth } from '@/lib/auth';

const PREFERENCES: Array<{ value: SharedRideGenderPreference; title: string; detail: string }> = [
  { value: 'ANY', title: 'Anyone', detail: 'Share with any other passenger.' },
  {
    value: 'SAME_GENDER_ONLY',
    title: 'Same gender only',
    detail: 'Only share with passengers of the same gender as you.',
  },
  { value: 'WOMEN_ONLY', title: 'Women only', detail: 'Only share with women.' },
  { value: 'MEN_ONLY', title: 'Men only', detail: 'Only share with men.' },
];

/**
 * Safety preferences.
 *
 * Only settings the backend actually enforces are offered here. The matching
 * engine treats the gender preference as a hard rule — it is applied before any
 * ranking, and no cheaper or closer ride can override it.
 */
export default function SafetyPage() {
  const { user, loading, refresh } = useAuth();
  const api = useApi();
  const toast = useToast();

  const [allowShared, setAllowShared] = useState(true);
  const [preference, setPreference] = useState<SharedRideGenderPreference>('ANY');
  const [allowFrontSeat, setAllowFrontSeat] = useState(true);
  const [shareContact, setShareContact] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prefs = user?.sharedRidePrefs;
    if (!prefs) return;
    setAllowShared(prefs.allowSharedRides);
    setPreference(prefs.genderPreference);
    setAllowFrontSeat(prefs.allowFrontSeat);
    setShareContact(prefs.shareContactWithCoPax);
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      api.auth.updateSafetyPreferences({
        allowSharedRides: allowShared,
        genderPreference: preference,
        allowFrontSeat,
        shareContactWithCoPax: shareContact,
      }),
    onSuccess: () => {
      toast.success('Preferences saved.');
      refresh();
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  if (loading) return <LoadingBlock label="Loading your preferences" />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Safety</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          How you travel when you share a vehicle with someone else.
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader title="Shared rides" />
        <div className="flex flex-col gap-4 p-4">
          <Toggle
            checked={allowShared}
            onChange={setAllowShared}
            title="Allow shared rides"
            detail="Turn this off and you will only ever be offered solo rides."
          />

          {allowShared && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-700">
                  Who are you happy to share with?
                  <SharedBadge />
                </p>

                <div role="radiogroup" aria-label="Shared ride preference" className="flex flex-col gap-2">
                  {PREFERENCES.map((option) => (
                    <label
                      key={option.value}
                      className={
                        preference === option.value
                          ? 'flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-brand-500 bg-brand-50 p-3 ring-1 ring-brand-500'
                          : 'flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-ink-200 p-3 hover:border-ink-300'
                      }
                    >
                      <input
                        type="radio"
                        name="preference"
                        className="mt-0.5 size-4 accent-[var(--color-brand-600)]"
                        checked={preference === option.value}
                        onChange={() => setPreference(option.value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-900">{option.title}</span>
                        <span className="block text-sm text-ink-500">{option.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <InlineNotice tone="progress">
                This is applied as a strict rule when we match you. We will never place you with
                someone outside it, whatever the fare or the wait.
              </InlineNotice>

              <Toggle
                checked={allowFrontSeat}
                onChange={setAllowFrontSeat}
                title="Willing to sit in the front"
                detail="Helps us seat everyone comfortably."
              />

              <Toggle
                checked={shareContact}
                onChange={setShareContact}
                title="Share my contact with co-passengers"
                detail="Off by default. Your driver always has what they need to find you."
              />
            </>
          )}

          {error && <InlineNotice tone="danger">{error}</InlineNotice>}

          <Button fullWidth loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>
            Save preferences
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="What we share about you" />
        <ul className="flex flex-col gap-2 p-4 text-sm text-ink-600">
          <li>Co-passengers see only how many people are aboard — never who they are.</li>
          <li>Your driver sees your first name, your phone number and your stops. Nothing else.</li>
          <li>Your gender is used only to match against safety preferences, and is never shown.</li>
          <li>A driver&apos;s number is released to you only once they are on the way.</li>
        </ul>
      </Card>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="block text-sm text-ink-500">{detail}</span>
      </span>
    </label>
  );
}

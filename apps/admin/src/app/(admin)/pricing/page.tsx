'use client';

import { SERVICE_LABEL, dateTime, messageFor, type ServiceType } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import {
  Badge,
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useAdminApi, type AdminPricingRule } from '@/lib/admin-context';

/**
 * Only fields the backend's `UpdatePricingRuleDto` accepts appear here. A
 * control for anything else would be refused by the API, so it is not offered.
 */
const PASSENGER_FIELDS: Array<{ key: string; label: string; suffix?: string }> = [
  { key: 'baseFare', label: 'Base fare' },
  { key: 'perKmFare', label: 'Per kilometre' },
  { key: 'perMinuteFare', label: 'Per minute' },
  { key: 'minimumFare', label: 'Minimum fare' },
  { key: 'bookingFee', label: 'Booking fee' },
  { key: 'waitingPerMinuteFee', label: 'Waiting, per minute' },
  { key: 'freeWaitingMinutes', label: 'Free waiting', suffix: 'min' },
  { key: 'sharedDiscountPct', label: 'Shared ride discount', suffix: '%' },
  { key: 'maxPassengerDiscountPct', label: 'Maximum discount', suffix: '%' },
  { key: 'serviceFeePct', label: 'Service fee', suffix: '%' },
  { key: 'taxPct', label: 'Tax', suffix: '%' },
  { key: 'cancellationFee', label: 'Cancellation fee' },
  { key: 'freeCancellationSeconds', label: 'Free cancellation window', suffix: 's' },
];

const DRIVER_FIELDS: Array<{ key: string; label: string; suffix?: string }> = [
  { key: 'platformCommissionPct', label: 'Platform commission', suffix: '%' },
  { key: 'sharedPassengerDriverSharePct', label: 'Driver share of a shared passenger', suffix: '%' },
  { key: 'additionalStopFee', label: 'Additional stop fee' },
  { key: 'minimumDriverEarning', label: 'Minimum driver earning' },
];

export default function PricingPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminPricingRule | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: listError, refetch } = useQuery({
    queryKey: ['admin', 'pricing-rules'],
    queryFn: ({ signal }) => admin.pricingRules({ signal }),
  });

  const save = useMutation({
    mutationFn: () => {
      // Only genuinely changed fields are sent, so an untouched rule is not
      // superseded by an identical copy.
      const changed: Record<string, number> = {};
      const original = { ...editing!.passenger, ...editing!.driver };

      for (const [key, value] of Object.entries(values)) {
        if (value === '' || value === undefined) continue;
        if (String(original[key]) === value) continue;
        changed[key] = Number(value);
      }

      if (Object.keys(changed).length === 0) {
        throw new Error('Nothing has changed.');
      }

      return admin.updatePricingRule(editing!.id, changed);
    },
    onSuccess: (result) => {
      toast.success(`Saved as version ${result.version}.`);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pricing-rules'] });
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  function openEditor(rule: AdminPricingRule) {
    setEditing(rule);
    setError(null);
    setValues(
      Object.fromEntries(
        [...PASSENGER_FIELDS, ...DRIVER_FIELDS].map((field) => [
          field.key,
          String({ ...rule.passenger, ...rule.driver }[field.key] ?? ''),
        ]),
      ),
    );
  }

  if (isLoading) return <LoadingBlock label="Loading pricing rules" />;
  if (listError) return <ErrorState message={messageFor(listError)} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader
        title="Pricing"
        description="The rules in force. Changing one creates a new version rather than editing it."
      />

      <div className="p-4 sm:p-6">
        <div className="mb-4 max-w-3xl">
          <InlineNotice tone="neutral">
            Every fare ever quoted points at the exact rule version that produced it, so a change
            here never rewrites history. Historical charges stay reproducible.
          </InlineNotice>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data?.map((rule) => (
            <Card key={rule.id}>
              <CardHeader
                title={
                  rule.vehicleType
                    ? `${rule.vehicleType.name} · ${SERVICE_LABEL[rule.serviceType as ServiceType] ?? rule.serviceType}`
                    : (SERVICE_LABEL[rule.serviceType as ServiceType] ?? rule.serviceType)
                }
                description={`Version ${rule.version} · since ${dateTime(rule.effectiveFrom)}`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => openEditor(rule)}>
                    Edit
                  </Button>
                }
              />
              <div className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Passenger
                </p>
                <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {PASSENGER_FIELDS.slice(0, 6).map((field) => (
                    <div key={field.key} className="flex justify-between gap-2">
                      <dt className="min-w-0 truncate text-ink-500">{field.label}</dt>
                      <dd className="shrink-0 tabular-nums text-ink-900">
                        {rule.passenger[field.key]}
                        {field.suffix}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Driver
                </p>
                <dl className="grid grid-cols-1 gap-1.5 text-sm">
                  {DRIVER_FIELDS.map((field) => (
                    <div key={field.key} className="flex justify-between gap-2">
                      <dt className="min-w-0 truncate text-ink-500">{field.label}</dt>
                      <dd className="shrink-0 tabular-nums text-ink-900">
                        {rule.driver[field.key]}
                        {field.suffix}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3">
                  <Badge tone="neutral">{rule.currency}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={
          editing
            ? `${editing.vehicleType?.name ?? 'All vehicles'} · ${SERVICE_LABEL[editing.serviceType as ServiceType] ?? editing.serviceType}`
            : 'Pricing'
        }
        description={editing ? `Currently version ${editing.version}` : undefined}
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button fullWidth loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>
              Save as new version
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink-700">What the passenger pays</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {PASSENGER_FIELDS.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.suffix ? `${field.label} (${field.suffix})` : field.label}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-700">What the driver earns</h3>
              <p className="mb-3 text-xs text-ink-500">
                Computed independently of the passenger charge. A discount to a customer never
                reduces driver pay.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {DRIVER_FIELDS.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.suffix ? `${field.label} (${field.suffix})` : field.label}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                ))}
              </div>
            </div>

            {error && <InlineNotice tone="danger">{error}</InlineNotice>}
          </div>
        )}
      </Modal>
    </>
  );
}

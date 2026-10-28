'use client';

import { SERVICE_LABEL, dateTime, messageFor, money, type ServiceType } from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/admin-shell';
import { DataTable, type Column } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Badge, Card, InlineNotice } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { useListQuery } from '@/hooks/use-list-query';
import { useAdminApi, type AdminPromotion } from '@/lib/admin-context';

export default function PromotionsPage() {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useListQuery();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminPromotion | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'promotions', list.query],
    queryFn: ({ signal }) => admin.promotions(list.query, { signal }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      admin.updatePromotion(id, { active }),
    onSuccess: () => {
      toast.success('Promotion updated.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
  });

  const columns: Column<AdminPromotion>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-ink-900">{row.code}</p>
          <p className="truncate text-xs text-ink-500">{row.name}</p>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Discount',
      cell: (row) => (
        <span className="text-sm text-ink-800">
          {row.type === 'PERCENT' ? `${Number(row.value)}%` : money(row.value)}
          {row.maxDiscount && (
            <span className="ml-1 text-xs text-ink-400">max {money(row.maxDiscount)}</span>
          )}
        </span>
      ),
    },
    {
      key: 'applies',
      header: 'Applies to',
      secondary: true,
      cell: (row) =>
        row.appliesTo ? (
          <div className="flex flex-wrap gap-1">
            {row.appliesTo.map((service) => (
              <Badge key={service} tone="neutral">
                {SERVICE_LABEL[service as ServiceType] ?? service}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-ink-500">every service</span>
        ),
    },
    {
      key: 'usage',
      header: 'Used',
      align: 'right',
      cell: (row) => (
        <span className="text-sm tabular-nums text-ink-800">
          {row.usage.used}
          {row.usage.limit !== null && <span className="text-ink-400"> / {row.usage.limit}</span>}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Valid',
      secondary: true,
      cell: (row) => (
        <span className="text-xs text-ink-500">
          {dateTime(row.validFrom)} → {dateTime(row.validTo)}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      cell: (row) => {
        const expired = new Date(row.validTo) < new Date();
        if (expired) return <Badge tone="neutral">expired</Badge>;
        return row.active ? <Badge tone="success">active</Badge> : <Badge tone="warning">paused</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toggle.mutate({ id: row.id, active: !row.active })}
          >
            {row.active ? 'Pause' : 'Resume'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Discount codes and how much they have been used."
        actions={<Button onClick={() => setCreating(true)}>New promotion</Button>}
      />

      <ListToolbar
        search={list.search}
        onSearchChange={list.onSearchChange}
        searchPlaceholder="Search code or name"
      />

      <div className="p-4 sm:p-6">
        <div className="mb-4 max-w-3xl">
          <InlineNotice tone="neutral">
            The redemption counter is maintained by the platform and cannot be edited. A usage limit
            can only be raised above what has already been used.
          </InlineNotice>
        </div>

        <Card className="overflow-hidden">
          <DataTable
            columns={columns}
            rows={data?.items}
            rowKey={(row) => row.id}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            emptyTitle="No promotions yet"
            emptyDescription="Create one to offer customers a discount."
            pagination={
              data
                ? { page: data.page, totalPages: data.totalPages, total: data.total, onPageChange: list.setPage }
                : undefined
            }
            mobileCard={(row) => (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-ink-900">{row.code}</p>
                    <p className="truncate text-xs text-ink-500">{row.name}</p>
                  </div>
                  <span className="shrink-0 text-sm text-ink-800">
                    {row.type === 'PERCENT' ? `${Number(row.value)}%` : money(row.value)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {row.active ? <Badge tone="success">active</Badge> : <Badge tone="warning">paused</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                </div>
              </div>
            )}
          />
        </Card>
      </div>

      <CreatePromotionDialog open={creating} onClose={() => setCreating(false)} />
      <EditPromotionDialog promotion={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CreatePromotionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    type: 'PERCENT',
    value: '',
    maxDiscount: '',
    minOrderAmount: '',
    usageLimit: '',
    perUserLimit: '1',
    validFrom: '',
    validTo: '',
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      admin.createPromotion({
        code: form.code.toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        value: Number(form.value),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perUserLimit: Number(form.perUserLimit || 1),
        validFrom: new Date(form.validFrom).toISOString(),
        validTo: new Date(form.validTo).toISOString(),
      }),
    onSuccess: (result) => {
      toast.success(`${result.code} created.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      onClose();
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  const ready = form.code && form.name && form.value && form.validFrom && form.validTo;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New promotion"
      size="lg"
      footer={
        <Button
          fullWidth
          disabled={!ready}
          loading={create.isPending}
          onClick={() => {
            setError(null);
            create.mutate();
          }}
        >
          Create promotion
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Code"
          placeholder="WELCOME20"
          hint="Upper-case letters, digits, hyphen or underscore."
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase())}
          required
        />
        <TextField
          label="Name"
          placeholder="Welcome discount"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
        />

        <div className="sm:col-span-2">
          <TextAreaField
            label="Description"
            placeholder="Shown to customers on the promotions screen."
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <SelectField label="Type" value={form.type} onChange={(e) => set('type', e.target.value)}>
          <option value="PERCENT">Percentage off</option>
          <option value="FIXED">Fixed amount off</option>
        </SelectField>

        <TextField
          label={form.type === 'PERCENT' ? 'Percentage' : 'Amount'}
          type="number"
          step="0.01"
          min="0.01"
          max={form.type === 'PERCENT' ? '100' : undefined}
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
          required
        />

        <TextField
          label="Maximum discount"
          type="number"
          step="0.01"
          min="0"
          hint="Caps a percentage discount."
          value={form.maxDiscount}
          onChange={(e) => set('maxDiscount', e.target.value)}
        />
        <TextField
          label="Minimum order"
          type="number"
          step="0.01"
          min="0"
          value={form.minOrderAmount}
          onChange={(e) => set('minOrderAmount', e.target.value)}
        />

        <TextField
          label="Total uses"
          type="number"
          min="1"
          hint="Leave empty for unlimited."
          value={form.usageLimit}
          onChange={(e) => set('usageLimit', e.target.value)}
        />
        <TextField
          label="Uses per customer"
          type="number"
          min="1"
          value={form.perUserLimit}
          onChange={(e) => set('perUserLimit', e.target.value)}
        />

        <TextField
          label="Valid from"
          type="datetime-local"
          value={form.validFrom}
          onChange={(e) => set('validFrom', e.target.value)}
          required
        />
        <TextField
          label="Valid until"
          type="datetime-local"
          value={form.validTo}
          onChange={(e) => set('validTo', e.target.value)}
          required
        />

        {error && (
          <div className="sm:col-span-2">
            <InlineNotice tone="danger">{error}</InlineNotice>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditPromotionDialog({
  promotion,
  onClose,
}: {
  promotion: AdminPromotion | null;
  onClose: () => void;
}) {
  const admin = useAdminApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [usageLimit, setUsageLimit] = useState('');
  const [validTo, setValidTo] = useState('');

  const update = useMutation({
    mutationFn: () =>
      admin.updatePromotion(promotion!.id, {
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
        validTo: validTo ? new Date(validTo).toISOString() : undefined,
      }),
    onSuccess: () => {
      toast.success('Promotion updated.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      onClose();
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  return (
    <Modal
      open={Boolean(promotion)}
      onClose={onClose}
      title={promotion?.code ?? 'Promotion'}
      description={promotion?.name}
      size="sm"
      footer={
        <Button fullWidth loading={update.isPending} onClick={() => { setError(null); update.mutate(); }}>
          Save
        </Button>
      }
    >
      {promotion && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-600">
            Used {promotion.usage.used} times
            {promotion.usage.limit !== null && ` of ${promotion.usage.limit}`}, by up to{' '}
            {promotion.usage.perUserLimit} per customer.
          </p>

          <TextField
            label="Total uses"
            type="number"
            min={promotion.usage.used}
            hint={`Cannot be lower than the ${promotion.usage.used} already used.`}
            placeholder={promotion.usage.limit?.toString() ?? 'unlimited'}
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
          />

          <TextField
            label="Valid until"
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />

          {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        </div>
      )}
    </Modal>
  );
}

'use client';

import { messageFor } from '@rideflow/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { InlineNotice } from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';

interface RatingDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (score: number, comment?: string) => Promise<unknown>;
}

/** Star rating, reused for rides, food orders and parcels. */
export function RatingDialog({ open, onClose, title, onSubmit }: RatingDialogProps) {
  const toast = useToast();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (score < 1) {
      setError('Choose a rating first.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(score, comment.trim() || undefined);
      toast.success('Thanks for the feedback.');
      onClose();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <Button fullWidth loading={submitting} onClick={submit}>
          Submit rating
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={score === value}
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              onClick={() => setScore(value)}
              className="rounded-full p-1"
            >
              <svg
                viewBox="0 0 24 24"
                className={clsx('size-9', value <= score ? 'text-share-500' : 'text-ink-200')}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" />
              </svg>
            </button>
          ))}
        </div>

        <TextAreaField
          label="Anything to add?"
          placeholder="Optional"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
        />

        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      </div>
    </Modal>
  );
}

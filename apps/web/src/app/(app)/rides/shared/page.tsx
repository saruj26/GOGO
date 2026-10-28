'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, SharedBadge } from '@/components/ui/surfaces';

/**
 * What a shared ride is, before someone commits to trying one.
 *
 * The booking itself happens on the home screen; this explains the idea and the
 * safety rules, which is what people actually hesitate over.
 */
export default function SharedRidesPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <SharedBadge />
        <h1 className="mt-3 text-xl font-semibold text-ink-900">Share a ride, pay less</h1>
        <p className="mt-1 text-sm text-ink-500">
          Join a driver who is already going your way. You save; they earn more for a journey they
          were making anyway.
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader title="How it works" />
        <ol className="flex flex-col gap-4 p-4">
          {[
            {
              title: 'Tell us where you are going',
              detail: 'Pick your route as you would for any ride.',
            },
            {
              title: 'We look for drivers already on that road',
              detail:
                'Not just drivers who are nearby — drivers whose actual route passes your pickup and your destination, in the right order, at about the right time.',
            },
            {
              title: 'You see the real numbers',
              detail:
                'The fare, what you save, how far you walk to the pickup, and when you will arrive. All worked out by us before you commit.',
            },
            {
              title: 'You choose',
              detail: 'Take the ride, or book a solo one instead. Nothing happens until you say so.',
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-share-100 text-sm font-semibold text-share-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{step.title}</p>
                <p className="mt-0.5 text-sm text-ink-500">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Your safety comes first" />
        <div className="flex flex-col gap-3 p-4 text-sm text-ink-600">
          <p>
            You decide who you are willing to share with — anyone, only the same gender, women only
            or men only. That choice is a <strong className="text-ink-900">strict rule</strong>: we
            will never place you with someone outside it, however much cheaper or closer another
            match would be.
          </p>
          <p>
            Co-passengers never see who else is in the vehicle. Your gender is used only to apply
            your preference, and is never shown to anybody.
          </p>
          <Link href="/safety">
            <Button variant="secondary" size="sm">
              Set my preference
            </Button>
          </Link>
        </div>
      </Card>

      <Link href="/">
        <Button variant="share" size="lg" fullWidth>
          Find a shared ride
        </Button>
      </Link>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, InlineNotice } from '@/components/ui/surfaces';

const FAQS = [
  {
    question: 'How does a shared ride work?',
    answer:
      'You tell us where you are going. We look for a driver already travelling that way with a free seat, check the route, the timing and your safety preferences, and offer you the ones that genuinely fit. You pay less because the driver was making the journey anyway.',
  },
  {
    question: 'Who will I be sharing with?',
    answer:
      'Whoever you have said you are willing to share with. Your preference is a strict rule — we will never place you with someone outside it, however much cheaper or closer another match would be. You can change it under Safety.',
  },
  {
    question: 'Why can I not cancel my food order?',
    answer:
      'Once the kitchen has started cooking, the food exists and somebody has paid for the ingredients. Cancel before then and there is no charge.',
  },
  {
    question: 'When am I charged?',
    answer:
      'Cash is collected at the door. Wallet payments come out when you place the order, and are returned in full if the order is cancelled or the restaurant declines it.',
  },
  {
    question: 'Why can I not pay by card?',
    answer: 'Card and online payment are not available yet. Cash and wallet both work today.',
  },
  {
    question: 'Why is my shared ride waiting for the driver?',
    answer:
      'A shared ride joins a journey somebody is already making, so the driver confirms they can take you. Your seat is held while they decide, and you are told either way.',
  },
];

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Help and support</h1>
        <p className="mt-0.5 text-sm text-ink-500">Answers to the things people ask most.</p>
      </header>

      <Card className="mb-5">
        <CardHeader title="Report a problem" />
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <Link href="/support/new" className="flex-1">
            <Button variant="primary" fullWidth>
              Raise a ticket
            </Button>
          </Link>
          <Link href="/support/tickets" className="flex-1">
            <Button variant="secondary" fullWidth>
              Your tickets
            </Button>
          </Link>
        </div>
        <p className="px-4 pb-4 text-xs text-ink-500">
          A ticket leaves a record we can follow up. Call us if you need an answer right now.
        </p>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Get in touch" />
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <a href="tel:+94112345678" className="flex-1">
            <Button variant="primary" fullWidth>
              Call support
            </Button>
          </a>
          <a href="mailto:support@tugo.lk" className="flex-1">
            <Button variant="secondary" fullWidth>
              Email us
            </Button>
          </a>
        </div>
        <p className="px-4 pb-4 text-xs text-ink-500">
          Have your trip or order reference ready — you will find it on the trip page.
        </p>
      </Card>

      <Card className="mb-5">
        <CardHeader title="Common questions" />
        <ul className="divide-y divide-ink-100">
          {FAQS.map((faq) => (
            <li key={faq.question}>
              <details className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-900">
                  {faq.question}
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5.2 7.2a1 1 0 0 1 1.4 0L10 10.6l3.4-3.4a1 1 0 1 1 1.4 1.4l-4.1 4.1a1 1 0 0 1-1.4 0L5.2 8.6a1 1 0 0 1 0-1.4z" />
                  </svg>
                </summary>
                <p className="mt-2 text-sm text-ink-600">{faq.answer}</p>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Report a problem with a trip" />
        <div className="p-4">
          <p className="text-sm text-ink-600">
            Open the trip or order and quote its reference when you contact us. That lets us find
            exactly what happened.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/history"><Button variant="secondary" size="sm">Trip history</Button></Link>
            <Link href="/orders"><Button variant="secondary" size="sm">Active orders</Button></Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

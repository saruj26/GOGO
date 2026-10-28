import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/harness';
import { EmptyState, ErrorState, StatusBadge } from './surfaces';

describe('ErrorState', () => {
  /**
   * The backend writes messages meant for people. The UI must show those and
   * never a stack trace or an internal detail.
   */
  it('shows the backend message and the correlation reference', () => {
    renderWithProviders(
      <ErrorState
        message="The last seat on that ride has just been taken."
        reference="abc-123"
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('The last seat on that ride has just been taken.')).toBeInTheDocument();
    expect(screen.getByText('Ref abc-123')).toBeInTheDocument();
  });

  it('offers a retry only when there is something to retry', () => {
    const onRetry = vi.fn();
    const { rerender } = renderWithProviders(
      <ErrorState message="Network failed" onRetry={onRetry} />,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    rerender(<ErrorState message="Network failed" />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('explains what is missing and what to do about it', () => {
    renderWithProviders(
      <EmptyState title="No rides yet" description="Your completed trips will be listed here." />,
    );

    expect(screen.getByText('No rides yet')).toBeInTheDocument();
    expect(screen.getByText('Your completed trips will be listed here.')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('shows the friendly label rather than the raw enum', () => {
    renderWithProviders(<StatusBadge status="READY_FOR_PICKUP" label="Ready for collection" />);
    expect(screen.getByText('Ready for collection')).toBeInTheDocument();
  });

  it('humanises an unlabelled status instead of shouting the enum', () => {
    renderWithProviders(<StatusBadge status="DRIVER_ARRIVING" />);
    expect(screen.getByText('driver arriving')).toBeInTheDocument();
  });
});

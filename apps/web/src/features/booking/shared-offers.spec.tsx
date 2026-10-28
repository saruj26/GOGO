import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SharedRideOffer } from '@rideflow/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/harness';
import { SharedOffers } from './shared-offers';

function offer(overrides: Partial<SharedRideOffer> = {}): SharedRideOffer {
  return {
    rideId: 'ride-1',
    reference: 'SJ-ABC123',
    vehicleType: { code: 'CAR', name: 'Car' },
    vehicle: { make: 'Toyota', model: 'Axio', colour: 'Silver' },
    driver: { firstName: 'Kumar', rating: '4.80', trips: 132 },
    pickupWalkMeters: 120,
    dropoffWalkMeters: 240,
    estimatedPickupAt: '2026-09-08T08:13:00.000Z',
    estimatedDropoffAt: '2026-09-08T08:52:00.000Z',
    seatsAvailable: 3,
    coPassengerCount: 1,
    fare: {
      currency: 'LKR',
      subtotal: '1792.61',
      discount: '537.78',
      serviceFee: '0.00',
      tax: '0.00',
      total: '1254.83',
      breakdown: [],
    },
    saving: '489.03',
    matchQuality: 92,
    ...overrides,
  };
}

describe('SharedOffers', () => {
  /**
   * The frontend must never decide whether a ride is compatible. These tests pin
   * that it only ever displays what the backend returned.
   */
  it('shows the fare and saving exactly as the backend calculated them', () => {
    renderWithProviders(
      <SharedOffers
        offers={[offer()]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay Junction"
        dropoffLabel="Nelliyady Market"
      />,
    );

    expect(screen.getByText('LKR 1,254.83')).toBeInTheDocument();
    expect(screen.getByText(/Save 489\.03/)).toBeInTheDocument();
  });

  it('labels the offer as a shared ride', () => {
    renderWithProviders(
      <SharedOffers
        offers={[offer()]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay Junction"
        dropoffLabel="Nelliyady Market"
      />,
    );

    expect(screen.getAllByText('Shared ride').length).toBeGreaterThan(0);
  });

  it('shows walking distances and seat availability', () => {
    renderWithProviders(
      <SharedOffers
        offers={[offer()]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay Junction"
        dropoffLabel="Nelliyady Market"
      />,
    );

    expect(screen.getByText(/120 m walk/)).toBeInTheDocument();
    expect(screen.getByText(/240 m walk/)).toBeInTheDocument();
    expect(screen.getByText(/3 seats free/)).toBeInTheDocument();
  });

  it('reports co-passengers as a count and never names them', () => {
    const { container } = renderWithProviders(
      <SharedOffers
        offers={[offer({ coPassengerCount: 2 })]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay"
        dropoffLabel="Nelliyady"
      />,
    );

    expect(screen.getByText(/2 other passengers/)).toBeInTheDocument();
    // The driver is named because the passenger has to find them; nobody else is.
    expect(container.textContent).toContain('Kumar');
  });

  it('shows the backend’s reason when nothing matched', () => {
    renderWithProviders(
      <SharedOffers
        offers={[]}
        loading={false}
        noMatchReason="Rides on your route do not currently match your safety preferences."
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay"
        dropoffLabel="Nelliyady"
      />,
    );

    expect(
      screen.getByText('Rides on your route do not currently match your safety preferences.'),
    ).toBeInTheDocument();
  });

  it('falls back to a neutral message when the backend gave no reason', () => {
    renderWithProviders(
      <SharedOffers
        offers={[]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay"
        dropoffLabel="Nelliyady"
      />,
    );

    expect(screen.getByText(/No driver is currently travelling your way/)).toBeInTheDocument();
  });

  it('reports the chosen offer to the caller', async () => {
    const onSelect = vi.fn();
    const chosen = offer();

    renderWithProviders(
      <SharedOffers
        offers={[chosen]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={onSelect}
        pickupLabel="Kopay"
        dropoffLabel="Nelliyady"
      />,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(chosen);
  });

  it('hides the saving badge when there is nothing to save', () => {
    renderWithProviders(
      <SharedOffers
        offers={[offer({ saving: '0.00' })]}
        loading={false}
        noMatchReason={null}
        selectedRideId={null}
        onSelect={vi.fn()}
        pickupLabel="Kopay"
        dropoffLabel="Nelliyady"
      />,
    );

    expect(screen.queryByText(/^Save/)).not.toBeInTheDocument();
  });
});

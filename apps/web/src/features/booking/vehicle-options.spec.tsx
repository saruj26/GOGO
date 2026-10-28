import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VehicleEstimate } from '@rideflow/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/harness';
import { VehicleOptions } from './vehicle-options';

function estimate(overrides: Partial<VehicleEstimate> = {}): VehicleEstimate {
  return {
    vehicleTypeId: 'vt-car',
    code: 'CAR',
    name: 'Car',
    seatCapacity: 4,
    maxPassengers: 4,
    sharedRideEligible: true,
    distanceM: 37146,
    durationS: 3821,
    etaMinutes: 64,
    currency: 'LKR',
    soloFare: '2930.66',
    sharedFareFrom: '2051.46',
    sharedSaving: '879.20',
    ...overrides,
  };
}

describe('VehicleOptions', () => {
  const options = [
    estimate({ vehicleTypeId: 'vt-bike', code: 'BIKE', name: 'Bike', maxPassengers: 1, sharedRideEligible: false, soloFare: '1376.04', sharedFareFrom: null, sharedSaving: null }),
    estimate({ vehicleTypeId: 'vt-auto', code: 'AUTO', name: 'Auto', maxPassengers: 3, soloFare: '1952.62', sharedFareFrom: '1366.83', sharedSaving: '585.79' }),
    estimate(),
  ];

  /**
   * Vehicle classes come from the backend. Nothing about bikes, autos or cars is
   * decided here, so a class added in the admin console appears without a
   * frontend change.
   */
  it('renders whatever classes the backend returned', () => {
    renderWithProviders(
      <VehicleOptions options={options} loading={false} selectedId={null} onSelect={vi.fn()} mode="SOLO" />,
    );

    expect(screen.getByText('Bike')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Car')).toBeInTheDocument();
  });

  it('renders an unfamiliar class it has never seen before', () => {
    renderWithProviders(
      <VehicleOptions
        options={[estimate({ vehicleTypeId: 'vt-tuk', code: 'ELECTRIC_TUK', name: 'Electric Tuk' })]}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
        mode="SOLO"
      />,
    );

    expect(screen.getByText('Electric Tuk')).toBeInTheDocument();
  });

  it('shows the solo fare in solo mode', () => {
    renderWithProviders(
      <VehicleOptions options={[estimate()]} loading={false} selectedId={null} onSelect={vi.fn()} mode="SOLO" />,
    );

    expect(screen.getByText('2,930.66')).toBeInTheDocument();
  });

  it('shows the shared fare and saving in shared mode', () => {
    renderWithProviders(
      <VehicleOptions options={[estimate()]} loading={false} selectedId={null} onSelect={vi.fn()} mode="SHARED" />,
    );

    expect(screen.getByText('2,051.46')).toBeInTheDocument();
    expect(screen.getByText('save 879.20')).toBeInTheDocument();
  });

  it('hides classes the backend says cannot be shared', () => {
    renderWithProviders(
      <VehicleOptions options={options} loading={false} selectedId={null} onSelect={vi.fn()} mode="SHARED" />,
    );

    // The bike is not shared-eligible, so it is not an option here.
    expect(screen.queryByText('Bike')).not.toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('explains itself when no class can be shared', () => {
    renderWithProviders(
      <VehicleOptions
        options={[options[0]]}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
        mode="SHARED"
      />,
    );

    expect(screen.getByText(/No vehicle class currently offers shared rides/)).toBeInTheDocument();
  });

  it('reports the selection and marks it checked', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <VehicleOptions options={[estimate()]} loading={false} selectedId="vt-car" onSelect={onSelect} mode="SOLO" />,
    );

    const option = screen.getByRole('radio');
    expect(option).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ vehicleTypeId: 'vt-car' }));
  });

  it('renders nothing rather than an empty shell before an estimate arrives', () => {
    renderWithProviders(
      <VehicleOptions options={undefined} loading={false} selectedId={null} onSelect={vi.fn()} mode="SOLO" />,
    );

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

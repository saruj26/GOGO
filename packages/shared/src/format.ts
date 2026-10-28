import type { FoodOrderStatus, ParcelStatus, RideStatus, ServiceType } from './types';

/**
 * Money arrives from the API as a fixed-point decimal string and is displayed as
 * one. It is never parsed into a JavaScript number for arithmetic — the backend
 * is the only thing that does money arithmetic, and rounding a float here would
 * quietly disagree with the receipt.
 */
export function money(amount: string | null | undefined, currency = 'LKR'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const [whole, fraction = '00'] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${grouped}.${fraction}`;
}

/** Money without the currency code, for tight layouts where it is already shown. */
export function amount(value: string | null | undefined): string {
  if (!value) return '—';
  const [whole, fraction = '00'] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

export function distance(metres: number | null | undefined): string {
  if (metres === null || metres === undefined) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function time(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return dateTime(iso);
}

/**
 * User-facing labels for backend statuses.
 *
 * The backend's own names are kept exactly as they are; this only decides what a
 * person reads. `PLACED` means the restaurant has not looked at it yet, which is
 * "Sent to restaurant" to a customer waiting for their dinner.
 */
export const FOOD_STATUS_LABEL: Record<FoodOrderStatus, string> = {
  DRAFT: 'In your cart',
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Sent to restaurant',
  ACCEPTED: 'Confirmed',
  REJECTED: 'Declined by restaurant',
  PREPARING: 'Being prepared',
  READY_FOR_PICKUP: 'Ready for collection',
  ASSIGNED: 'Courier assigned',
  PICKED_UP: 'Collected',
  DELIVERING: 'On the way to you',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** The steps a customer is shown, in order. Terminal states are not steps. */
export const FOOD_PROGRESS_STEPS: FoodOrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERING',
  'DELIVERED',
];

export const PARCEL_STATUS_LABEL: Record<ParcelStatus, string> = {
  DRAFT: 'Draft',
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Booked',
  SEARCHING_DRIVER: 'Finding a courier',
  ASSIGNED: 'Courier assigned',
  HEADING_TO_PICKUP: 'Courier on the way',
  PICKED_UP: 'Collected',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Could not be delivered',
};

export const PARCEL_PROGRESS_STEPS: ParcelStatus[] = [
  'PLACED',
  'ASSIGNED',
  'HEADING_TO_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
];

export const RIDE_STATUS_LABEL: Record<RideStatus, string> = {
  DRAFT: 'Draft',
  SEARCHING: 'Finding a driver',
  SCHEDULED: 'Scheduled',
  ACCEPTED: 'Driver assigned',
  DRIVER_ARRIVING: 'Driver on the way',
  DRIVER_ARRIVED: 'Driver has arrived',
  IN_PROGRESS: 'On your trip',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const SERVICE_LABEL: Record<ServiceType, string> = {
  RIDE: 'Ride',
  SHARED_RIDE: 'Shared ride',
  FOOD_DELIVERY: 'Food',
  PARCEL: 'Parcel',
};

export type StatusTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

/** Maps any lifecycle status onto a badge tone, so colour is decided in one place. */
export function statusTone(status: string): StatusTone {
  if (['DELIVERED', 'COMPLETED', 'PAID'].includes(status)) return 'success';
  if (['CANCELLED', 'REJECTED', 'FAILED', 'EXPIRED'].includes(status)) return 'danger';
  if (['PENDING_PAYMENT', 'SEARCHING', 'SEARCHING_DRIVER', 'PENDING'].includes(status)) {
    return 'warning';
  }
  if (['DRAFT'].includes(status)) return 'neutral';
  return 'progress';
}

/** Turns a phone number into something readable without changing its value. */
export function phone(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/^(\+\d{2})(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3 $4');
}

export function initials(firstName: string | null | undefined): string {
  if (!firstName) return '?';
  return firstName.trim().charAt(0).toUpperCase();
}

/// User-facing wording for backend statuses.
///
/// The backend's own names are never changed to suit the interface; this is the
/// single place where one is turned into something a person reads. `PLACED`
/// means the restaurant has not looked at the order yet, which to someone
/// waiting for dinner is "Sent to restaurant".
library;

/// What a passenger's own leg is called, which is not the same as the ride's
/// status: a ride can be under way while your request to join it is still
/// waiting for the driver.
const Map<String, String> passengerLegLabel = {
  'REQUESTED': 'Requested',
  'OFFERED': 'Waiting for the driver',
  'CONFIRMED': 'Confirmed',
  'AWAITING_PICKUP': 'Waiting to be picked up',
  'ONBOARD': 'On board',
  'DROPPED_OFF': 'Dropped off',
  'CANCELLED': 'Cancelled',
  'REJECTED': 'Declined by the driver',
  'NO_SHOW': 'Not picked up',
};

const Map<String, String> rideStatusLabel = {
  'DRAFT': 'Draft',
  'SEARCHING': 'Finding a driver',
  'SCHEDULED': 'Scheduled',
  'ACCEPTED': 'Driver assigned',
  'DRIVER_ARRIVING': 'Driver on the way',
  'DRIVER_ARRIVED': 'Driver has arrived',
  'IN_PROGRESS': 'On your trip',
  'COMPLETED': 'Completed',
  'CANCELLED': 'Cancelled',
  'EXPIRED': 'Expired',
};

const Map<String, String> foodStatusLabel = {
  'DRAFT': 'In your cart',
  'PENDING_PAYMENT': 'Awaiting payment',
  'PLACED': 'Sent to restaurant',
  'ACCEPTED': 'Confirmed',
  'REJECTED': 'Declined by restaurant',
  'PREPARING': 'Being prepared',
  'READY_FOR_PICKUP': 'Ready for collection',
  'ASSIGNED': 'Courier assigned',
  'PICKED_UP': 'Collected',
  'DELIVERING': 'On the way to you',
  'DELIVERED': 'Delivered',
  'CANCELLED': 'Cancelled',
};

/// The steps a customer is shown, in order. Terminal states are not steps.
const List<String> foodProgressSteps = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'ASSIGNED',
  'PICKED_UP',
  'DELIVERING',
  'DELIVERED',
];

const Map<String, String> parcelStatusLabel = {
  'DRAFT': 'Draft',
  'PENDING_PAYMENT': 'Awaiting payment',
  'PLACED': 'Booked',
  'SEARCHING_DRIVER': 'Finding a courier',
  'ASSIGNED': 'Courier assigned',
  'HEADING_TO_PICKUP': 'Courier on the way',
  'PICKED_UP': 'Collected',
  'IN_TRANSIT': 'In transit',
  'DELIVERED': 'Delivered',
  'CANCELLED': 'Cancelled',
  'FAILED': 'Could not be delivered',
};

const List<String> parcelProgressSteps = [
  'PLACED',
  'ASSIGNED',
  'HEADING_TO_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
];

const Map<String, String> serviceLabel = {
  'RIDE': 'Ride',
  'SHARED_RIDE': 'Shared ride',
  'FOOD_DELIVERY': 'Food',
  'PARCEL': 'Parcel',
};

const Map<String, String> paymentMethodLabel = {
  'CASH': 'Cash',
  'WALLET': 'Wallet',
  'CARD': 'Card',
  'ONLINE': 'Online',
};

const Map<String, String> paymentStatusLabel = {
  'PENDING': 'Pending',
  'AUTHORIZED': 'Authorised',
  'PAID': 'Paid',
  'FAILED': 'Failed',
  'REFUNDED': 'Refunded',
  'PARTIALLY_REFUNDED': 'Partly refunded',
  'CANCELLED': 'Cancelled',
};

/// What a courier's own delivery leg is called, which is not the same wording
/// the customer sees for the same underlying state.
const Map<String, String> deliveryStatusLabel = {
  'UNASSIGNED': 'Open',
  'ASSIGNED': 'Assigned to you',
  'HEADING_TO_PICKUP': 'Heading to collection',
  'AT_PICKUP': 'At collection point',
  'PICKED_UP': 'Collected',
  'DELIVERING': 'Delivering',
  'DELIVERED': 'Delivered',
  'CANCELLED': 'Cancelled',
  'FAILED': 'Failed',
};

/// Falls back to a readable version of the raw value rather than to a wrong
/// label, so a status the backend grows later is never mislabelled here.
String labelFor(Map<String, String> labels, String status) =>
    labels[status] ?? _humanise(status);

String _humanise(String status) {
  if (status.isEmpty) return '—';
  final words = status.toLowerCase().replaceAll('_', ' ');
  return words[0].toUpperCase() + words.substring(1);
}

enum StatusTone { neutral, progress, success, warning, danger }

/// Maps any lifecycle status onto a tone, so colour is decided in one place.
StatusTone toneFor(String status) {
  if (const {'DELIVERED', 'COMPLETED', 'PAID'}.contains(status)) return StatusTone.success;
  if (const {'CANCELLED', 'REJECTED', 'FAILED', 'EXPIRED'}.contains(status)) {
    return StatusTone.danger;
  }
  if (const {'PENDING_PAYMENT', 'SEARCHING', 'SEARCHING_DRIVER', 'PENDING'}.contains(status)) {
    return StatusTone.warning;
  }
  if (status == 'DRAFT') return StatusTone.neutral;
  return StatusTone.progress;
}

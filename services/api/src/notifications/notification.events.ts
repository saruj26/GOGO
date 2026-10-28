/**
 * Every notification the food and parcel modules can raise.
 *
 * The type is the stable machine identifier a client switches on; the copy is
 * produced by the service. Keeping them in one place means a lifecycle change
 * cannot silently ship without somebody deciding who hears about it.
 */
export const NOTIFICATION_TYPES = {
  // food — customer
  FOOD_ORDER_PLACED: 'food.order.placed',
  FOOD_ORDER_ACCEPTED: 'food.order.accepted',
  FOOD_ORDER_REJECTED: 'food.order.rejected',
  FOOD_ORDER_PREPARING: 'food.order.preparing',
  FOOD_ORDER_READY: 'food.order.ready',
  FOOD_ORDER_COURIER_ASSIGNED: 'food.order.courier_assigned',
  FOOD_ORDER_PICKED_UP: 'food.order.picked_up',
  FOOD_ORDER_DELIVERING: 'food.order.delivering',
  FOOD_ORDER_DELIVERED: 'food.order.delivered',
  FOOD_ORDER_CANCELLED: 'food.order.cancelled',

  // food — restaurant
  RESTAURANT_ORDER_RECEIVED: 'restaurant.order.received',
  RESTAURANT_ORDER_CANCELLED: 'restaurant.order.cancelled',
  RESTAURANT_ORDER_COLLECTED: 'restaurant.order.collected',

  // parcel — customer
  PARCEL_BOOKED: 'parcel.booked',
  PARCEL_COURIER_ASSIGNED: 'parcel.courier_assigned',
  PARCEL_COURIER_ARRIVING: 'parcel.courier_arriving',
  PARCEL_PICKED_UP: 'parcel.picked_up',
  PARCEL_IN_TRANSIT: 'parcel.in_transit',
  PARCEL_DELIVERED: 'parcel.delivered',
  PARCEL_CANCELLED: 'parcel.cancelled',

  // couriers
  DELIVERY_JOB_ASSIGNED: 'delivery.job.assigned',
  DELIVERY_JOB_CANCELLED: 'delivery.job.cancelled',

  // rides — passenger
  RIDE_DRIVER_ASSIGNED: 'ride.driver_assigned',
  RIDE_DRIVER_ARRIVING: 'ride.driver_arriving',
  RIDE_DRIVER_ARRIVED: 'ride.driver_arrived',
  RIDE_STARTED: 'ride.started',
  RIDE_COMPLETED: 'ride.completed',
  RIDE_CANCELLED: 'ride.cancelled',

  // rides — shared
  SHARED_REQUEST_RECEIVED: 'ride.shared.request_received',
  SHARED_REQUEST_ACCEPTED: 'ride.shared.request_accepted',
  SHARED_REQUEST_REJECTED: 'ride.shared.request_rejected',
  SHARED_PASSENGER_ADDED: 'ride.shared.passenger_added',

  // support
  SUPPORT_TICKET_REPLIED: 'support.ticket.replied',
  SUPPORT_TICKET_RESOLVED: 'support.ticket.resolved',

  // payments
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * Everything the platform pushes to a connected client.
 *
 * The name is the stable contract a client subscribes to; the payload is
 * deliberately small. A realtime event says *what changed and where*, not the
 * whole entity — the client re-reads the resource it already knows how to
 * fetch. That keeps one projection of a ride (the REST one, with its access
 * rules) instead of two that can disagree.
 */
export const REALTIME_EVENTS = {
  // rides
  RIDE_CREATED: 'ride.created',
  RIDE_DRIVER_ASSIGNED: 'ride.driver_assigned',
  RIDE_DRIVER_ARRIVING: 'ride.driver_arriving',
  RIDE_DRIVER_ARRIVED: 'ride.driver_arrived',
  RIDE_STARTED: 'ride.started',
  RIDE_UPDATED: 'ride.updated',
  RIDE_COMPLETED: 'ride.completed',
  RIDE_CANCELLED: 'ride.cancelled',
  RIDE_STOPS_RESEQUENCED: 'ride.stops_resequenced',

  // shared riding
  SHARED_PASSENGER_REQUESTED: 'ride.shared.passenger_requested',
  SHARED_PASSENGER_ADDED: 'ride.shared.passenger_added',
  SHARED_PASSENGER_REJECTED: 'ride.shared.passenger_rejected',
  SHARED_PASSENGER_REMOVED: 'ride.shared.passenger_removed',

  // driver
  DRIVER_LOCATION: 'driver.location',
  DRIVER_AVAILABILITY_CHANGED: 'driver.availability_changed',
  DRIVER_RIDE_REQUEST: 'driver.ride_request',
  DRIVER_DELIVERY_ASSIGNED: 'driver.delivery_assigned',

  // food
  FOOD_ORDER_ACCEPTED: 'food.order.accepted',
  FOOD_ORDER_PREPARING: 'food.order.preparing',
  FOOD_ORDER_READY: 'food.order.ready',
  FOOD_ORDER_COURIER_ASSIGNED: 'food.order.courier_assigned',
  FOOD_ORDER_PICKED_UP: 'food.order.picked_up',
  FOOD_ORDER_DELIVERING: 'food.order.delivering',
  FOOD_ORDER_DELIVERED: 'food.order.delivered',
  FOOD_ORDER_CANCELLED: 'food.order.cancelled',

  // parcel
  PARCEL_COURIER_ASSIGNED: 'parcel.courier_assigned',
  PARCEL_PICKED_UP: 'parcel.picked_up',
  PARCEL_IN_TRANSIT: 'parcel.in_transit',
  PARCEL_DELIVERED: 'parcel.delivered',
  PARCEL_CANCELLED: 'parcel.cancelled',

  // account
  NOTIFICATION_CREATED: 'notification.created',
} as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/** What every event carries, whatever else it adds. */
export interface RealtimeEnvelope {
  event: RealtimeEvent;
  /** Server clock, so a client can discard an event older than what it has. */
  at: string;
  data: Record<string, unknown>;
}

/**
 * A driver's position, as pushed to the passengers entitled to see it.
 *
 * There is no driver identity in here beyond the ride it belongs to: a
 * passenger watching their own ride needs to know where the car is, not who is
 * driving it in the wider system.
 */
export interface DriverLocationEvent {
  rideId: string;
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedKph: number | null;
  recordedAt: string;
}

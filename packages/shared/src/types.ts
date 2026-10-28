/**
 * Response shapes consumed by the applications.
 *
 * These mirror what the API returns. They are deliberately hand-written rather
 * than generated: the API projects different fields for different viewers, and
 * writing the client's view of that explicitly keeps the difference visible.
 */

// ---------------------------------------------------------------- primitives

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  address: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ServiceType = 'RIDE' | 'SHARED_RIDE' | 'FOOD_DELIVERY' | 'PARCEL';
export type PaymentMethod = 'CASH' | 'WALLET' | 'CARD' | 'ONLINE';
export type PaymentStatus =
  | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
export type SharedRideGenderPreference = 'ANY' | 'SAME_GENDER_ONLY' | 'WOMEN_ONLY' | 'MEN_ONLY';

// --------------------------------------------------------------------- auth

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SafetyPreferences {
  allowSharedRides: boolean;
  genderPreference: SharedRideGenderPreference;
  maxCoPassengers: number | null;
  maxDetourMinutes: number | null;
  allowFrontSeat: boolean;
  shareContactWithCoPax: boolean;
}

export interface Me {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  gender: Gender;
  avatarUrl: string | null;
  createdAt: string;
  roles: string[];
  driverId: string | null;
  sharedRidePrefs: SafetyPreferences | null;
  wallet: { balance: string; currency: string } | null;
}

// -------------------------------------------------------------------- rides

export type RideStatus =
  | 'DRAFT' | 'SEARCHING' | 'SCHEDULED' | 'ACCEPTED' | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export interface VehicleEstimate {
  vehicleTypeId: string;
  code: string;
  name: string;
  seatCapacity: number;
  maxPassengers: number;
  sharedRideEligible: boolean;
  distanceM: number;
  durationS: number;
  etaMinutes: number;
  currency: string;
  soloFare: string;
  sharedFareFrom: string | null;
  sharedSaving: string | null;
}

export interface FareBreakdownLine {
  code: string;
  label: string;
  amount: string;
}

export interface PublicFare {
  currency: string;
  subtotal: string;
  discount: string;
  serviceFee: string;
  tax: string;
  total: string;
  breakdown: FareBreakdownLine[];
}

/** One shared ride the matching engine decided this passenger could join. */
export interface SharedRideOffer {
  rideId: string;
  reference?: string;
  vehicleType: { code: string; name: string } | null;
  vehicle: { make: string; model: string; colour: string } | null;
  driver: { firstName: string; rating: string; trips: number } | null;
  pickupWalkMeters: number;
  dropoffWalkMeters: number;
  estimatedPickupAt: string;
  estimatedDropoffAt: string;
  seatsAvailable: number;
  coPassengerCount: number;
  fare: PublicFare;
  saving: string;
  matchQuality: number;
}

export interface SharedRideSearchResult {
  requestId: string;
  expiresAt: string;
  offers: SharedRideOffer[];
  noMatchReason: string | null;
}

export interface CreatedRide {
  rideId: string;
  reference: string;
  passengerId: string;
  fareQuoteId: string;
  status: RideStatus;
  fare: PublicFare;
  route: { distanceM: number; durationS: number; polyline: string };
}

export interface RideDetail {
  id: string;
  reference: string;
  rideType: 'SOLO' | 'SHARED';
  status: RideStatus;
  scheduledPickupAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  currency: string;
  vehicleType: { code: string; name: string; seatCapacity: number } | null;
  route: { encodedPolyline: string; distanceM: number; durationS: number; version: number } | null;
  seats: { total: number; occupied: number };
  vehicle: { make: string; model: string; colour: string; plateNumber: string } | null;
  driver: {
    firstName: string;
    avatarUrl: string | null;
    rating: string;
    trips: number;
    phone: string | null;
  } | null;
  myLeg: {
    id: string;
    status: string;
    seats: number;
    isSharedJoin: boolean;
    pickup: Place;
    dropoff: Place;
    estimatedPickupAt: string | null;
    estimatedDropoffAt: string | null;
    fare: { total: string; currency: string; isShared: boolean } | null;
    payment: { method: PaymentMethod; status: PaymentStatus } | null;
  } | null;
  coPassengerCount: number;
  myStops: Array<{
    id: string;
    sequence: number;
    type: string;
    status: string;
    address: string;
    latitude: string;
    longitude: string;
    estimatedArrivalAt: string | null;
  }>;
}

export interface RideHistoryItem {
  id: string;
  status: string;
  isSharedJoin: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  createdAt: string;
  droppedOffAt: string | null;
  fareQuote: { passengerTotal: string; currency: string; isShared: boolean } | null;
  ride: {
    id: string;
    reference: string;
    rideType: 'SOLO' | 'SHARED';
    status: RideStatus;
    vehicleType: { code: string; name: string };
  };
}

// --------------------------------------------------------------------- food

export type FoodOrderStatus =
  | 'DRAFT' | 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'REJECTED'
  | 'PREPARING' | 'READY_FOR_PICKUP' | 'ASSIGNED' | 'PICKED_UP'
  | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';

export interface RestaurantSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isAcceptingOrders: boolean;
  prepMinutes: number;
  minOrderAmount: string;
  rating: { average: string; count: number };
  address: string;
  distanceM: number | null;
  withinDeliveryRange: boolean | null;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  available: boolean;
  prepMinutes: number | null;
}

export interface RestaurantDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  isAcceptingOrders: boolean;
  defaultPrepMinutes: number;
  minOrderAmount: string;
  rating: { average: string; count: number };
  addressLine: string;
  latitude: string;
  longitude: string;
  deliveryRadiusM: number;
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
  categories: Array<{ id: string; name: string; sortOrder: number; items: MenuItem[] }>;
}

export interface CartLine {
  id: string;
  menuItemId: string | null;
  name: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  notes: string | null;
  available: boolean;
  priceChanged: boolean;
  currentPrice: string;
}

export interface Cart {
  cartId: string;
  reference: string;
  currency: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    isAcceptingOrders: boolean;
    prepMinutes: number;
  };
  items: CartLine[];
  itemsSubtotal: string;
  minimumOrderAmount: string;
  meetsMinimum: boolean;
  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
  updatedAt: string;
}

export interface PlacedFoodOrder {
  orderId: string;
  reference: string;
  status: FoodOrderStatus;
  placedAt: string;
  currency: string;
  charge: {
    itemsSubtotal: string;
    deliveryFee: string;
    serviceFee: string;
    tax: string;
    discount: string;
    total: string;
  };
  estimatedPrepMinutes: number;
  estimatedDeliveryMinutes: number;
}

export interface FoodOrderDetail {
  id: string;
  reference: string;
  status: FoodOrderStatus;
  restaurant: { id: string; name: string; slug: string; logoUrl: string | null; address: string } & LatLng;
  items: Array<{ name: string; quantity: number; unitPrice: string; lineTotal: string; notes: string | null }>;
  charge: {
    currency: string;
    itemsSubtotal: string;
    deliveryFee: string;
    serviceFee: string;
    tax: string;
    discount: string;
    total: string;
  };
  payment: { method: PaymentMethod; status: PaymentStatus } | null;
  delivery: {
    address: string;
    note: string | null;
    status: string | null;
    distanceM: number | null;
    durationS: number | null;
    polyline: string | null;
  };
  courier: {
    firstName: string;
    avatarUrl: string | null;
    rating: string;
    phone: string | null;
    vehicle: { make: string; model: string; colour: string } | null;
  } | null;
  timeline: Record<string, string | null>;
  progress: Array<{ status: FoodOrderStatus; at: string; note: string | null }>;
  estimatedPrepMinutes: number | null;
  cancellationReason: string | null;
  rejectionReason: string | null;
}

export interface FoodOrderTracking {
  orderId: string;
  reference: string;
  status: FoodOrderStatus;
  restaurantName: string;
  courierFirstName: string | null;
  deliveryStatus: string | null;
  estimatedMinutesRemaining: number | null;
  steps: Array<{ status: FoodOrderStatus; at: string }>;
}

export interface FoodOrderHistoryItem {
  id: string;
  reference: string;
  status: FoodOrderStatus;
  total: string;
  currency: string;
  placedAt: string | null;
  deliveredAt: string | null;
  restaurant: { id: string; name: string; logoUrl: string | null };
  itemLines: number;
}

// ------------------------------------------------------------------- parcel

export type ParcelStatus =
  | 'DRAFT' | 'PENDING_PAYMENT' | 'PLACED' | 'SEARCHING_DRIVER' | 'ASSIGNED'
  | 'HEADING_TO_PICKUP' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED'
  | 'CANCELLED' | 'FAILED';

export interface ParcelType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxWeightKg: string;
  maxLengthCm: number | null;
  minVehicleTypeCode: string | null;
  requiresSignature: boolean;
}

export interface ParcelQuote {
  vehicleTypeId: string;
  vehicleTypeCode: string;
  vehicleTypeName: string;
  distanceM: number;
  durationS: number;
  etaMinutes: number;
  currency: string;
  total: string;
  breakdown: FareBreakdownLine[];
}

export interface CreatedParcel {
  parcelId: string;
  reference: string;
  status: ParcelStatus;
  charge: PublicFare;
  route: { distanceM: number; durationS: number; polyline: string };
  scheduledFor: string | null;
}

export interface ParcelDetail {
  id: string;
  reference: string;
  status: ParcelStatus;
  parcelType: { code: string; name: string; requiresSignature: boolean };
  vehicleType: { code: string; name: string };
  weightKg: string | null;
  declaredValue: string | null;
  notes: string | null;
  pickup: { address: string; contactName: string; contactPhone: string };
  dropoff: { address: string; receiverName: string; receiverPhone: string };
  charge: { total: string; currency: string } | null;
  payment: { method: PaymentMethod; status: PaymentStatus; amount: string; currency: string } | null;
  courier: { firstName: string; avatarUrl: string | null; rating: string; phone: string | null } | null;
  route: { distanceM: number | null; durationS: number | null; polyline: string | null };
  timeline: Record<string, string | null>;
  cancellationReason: string | null;
}

export interface ParcelTrackingEntry {
  id: string;
  status: ParcelStatus;
  note: string | null;
  createdAt: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface ParcelHistoryItem {
  id: string;
  reference: string;
  status: ParcelStatus;
  parcelType: string;
  from: string;
  to: string;
  total: string | null;
  currency: string | null;
  bookedAt: string;
  deliveredAt: string | null;
}

// ------------------------------------------------------------------ account

export interface AccountSummary {
  rides: number;
  foodOrders: number;
  parcels: number;
  unreadNotifications: number;
  wallet: { balance: string; currency: string };
}

export interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string;
  balanceAfter: string;
  description: string | null;
  reference: string | null;
  at: string;
}

export interface WalletView {
  balance: string;
  currency: string;
  frozen: boolean;
  transactions: CursorPage<WalletTransaction> | null;
}

export interface PaymentHistoryItem {
  id: string;
  serviceType: ServiceType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  refunded: string;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  reference: string | null;
  description: string | null;
}

export interface AvailablePromotion {
  code: string;
  name: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED';
  value: string;
  maxDiscount: string | null;
  minOrderAmount: string;
  appliesTo: ServiceType[] | null;
  expiresAt: string;
  usesLeft: number;
}

export interface SavedPlace extends LatLng {
  id: string;
  label: string;
  address: string;
  createdAt?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface PendingRatings {
  rides: Array<{ id: string; reference: string; completedAt: string | null }>;
  foodOrders: Array<{ id: string; reference: string; restaurant: string; completedAt: string | null }>;
  parcels: Array<{ id: string; reference: string; completedAt: string | null }>;
}

// ------------------------------------------------------------------ support

export type SupportTicketStatus =
  | 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED';

export interface SupportTicketSummary {
  id: string;
  reference: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  _count: { messages: number };
}

export interface SupportMessage {
  id: string;
  body: string;
  createdAt: string;
  /** Whether support wrote it. Internal staff notes never reach a customer. */
  fromSupport: boolean;
  authorFirstName: string;
}

export interface SupportTicketDetail {
  id: string;
  reference: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messages: SupportMessage[];
}

/** The staff view: carries internal notes and who the customer is. */
export interface AdminSupportTicket extends Omit<SupportTicketDetail, 'messages'> {
  priority: string;
  assignedToUserId: string | null;
  user: { id: string; firstName: string; lastName: string | null; phone: string; email: string | null };
  messages: Array<{
    id: string;
    body: string;
    internal: boolean;
    createdAt: string;
    authorUserId: string;
    author: { firstName: string; lastName: string | null };
  }>;
}

export interface AdminSupportTicketRow {
  id: string;
  reference: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assignedToUserId: string | null;
  user: { id: string; firstName: string; lastName: string | null; phone: string };
  _count: { messages: number };
}

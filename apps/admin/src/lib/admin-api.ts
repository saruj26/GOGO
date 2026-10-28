import type {
  AdminSupportTicket,
  AdminSupportTicketRow,
  ApiClient,
  OffsetPage,
  RequestOptions,
} from '@rideflow/shared';

type Opts = Pick<RequestOptions, 'signal'>;

/**
 * The admin API surface.
 *
 * Kept separate from the customer client so the two cannot drift into each
 * other: nothing here is reachable without the ADMIN role, and the backend
 * re-checks that on every request rather than trusting anything this code says.
 */
export function createAdminApi(client: ApiClient) {
  return {
    dashboard: (o?: Opts) => client.get<DashboardMetrics>('/admin/metrics/dashboard', o),

    revenueByService: (query: { from?: string; to?: string } = {}, o?: Opts) =>
      client.get<RevenueByService[]>('/admin/metrics/revenue-by-service', { ...o, query }),

    revenueTrend: (days = 14, o?: Opts) =>
      client.get<RevenueTrendPoint[]>('/admin/metrics/revenue-trend', { ...o, query: { days } }),

    users: (query: AdminQuery & { status?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminUser>>('/admin/users', { ...o, query }),

    setUserStatus: (userId: string, body: { status: string; reason?: string }) =>
      client.put<{ userId: string; status: string }>(`/admin/users/${userId}/status`, body),

    drivers: (query: AdminQuery & { approvalStatus?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminDriver>>('/admin/drivers', { ...o, query }),

    approveDriver: (driverId: string, reason?: string) =>
      client.post<unknown>(`/admin/drivers/${driverId}/approve`, { reason }),

    rejectDriver: (driverId: string, reason: string) =>
      client.post<unknown>(`/admin/drivers/${driverId}/reject`, { reason }),

    suspendDriver: (driverId: string, reason: string) =>
      client.post<unknown>(`/admin/drivers/${driverId}/suspend`, { reason }),

    // --- support ---------------------------------------------------------

    supportTickets: (
      query: AdminQuery & {
        status?: string;
        category?: string;
        assignedToUserId?: string;
      } = {},
      o?: Opts,
    ) => client.get<OffsetPage<AdminSupportTicketRow>>('/admin/support/tickets', { ...o, query }),

    supportTicket: (ticketId: string, o?: Opts) =>
      client.get<AdminSupportTicket>(`/admin/support/tickets/${ticketId}`, o),

    replyToTicket: (ticketId: string, body: { body: string; internal?: boolean }) =>
      client.post<{ id: string; internal: boolean }>(
        `/admin/support/tickets/${ticketId}/messages`,
        body,
      ),

    setTicketStatus: (ticketId: string, status: string) =>
      client.put<{ id: string; status: string }>(`/admin/support/tickets/${ticketId}/status`, {
        status,
      }),

    /** Omitting the assignee takes the ticket yourself. */
    assignTicket: (ticketId: string, assignedToUserId?: string) =>
      client.put<{ id: string; assignedToUserId: string | null; status: string }>(
        `/admin/support/tickets/${ticketId}/assignee`,
        { assignedToUserId },
      ),

    vehicleTypes: (o?: Opts) => client.get<AdminVehicleType[]>('/admin/vehicle-types', o),

    rides: (query: AdminQuery & { status?: string; rideType?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminRide>>('/admin/rides', { ...o, query }),

    ride: (rideId: string, o?: Opts) => client.get<AdminRideDetail>(`/admin/rides/${rideId}`, o),

    restaurants: (query: AdminQuery = {}, o?: Opts) =>
      client.get<OffsetPage<AdminRestaurant>>('/admin/restaurants', { ...o, query }),

    setRestaurantStatus: (restaurantId: string, body: { status: string; reason?: string }) =>
      client.put<unknown>(`/admin/restaurants/${restaurantId}/status`, body),

    foodOrders: (query: AdminQuery & { status?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminFoodOrder>>('/admin/food-orders', { ...o, query }),

    parcels: (query: AdminQuery & { status?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminParcel>>('/admin/parcels', { ...o, query }),

    payments: (query: AdminQuery & { status?: string; serviceType?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminPayment> & { totals: { charged: string; refunded: string } }>(
        '/admin/payments',
        { ...o, query },
      ),

    pricingRules: (o?: Opts) => client.get<AdminPricingRule[]>('/admin/pricing-rules', o),

    updatePricingRule: (ruleId: string, body: Record<string, number>) =>
      client.put<{ id: string; version: number }>(`/admin/pricing-rules/${ruleId}`, body),

    promotions: (query: AdminQuery = {}, o?: Opts) =>
      client.get<OffsetPage<AdminPromotion>>('/admin/promotions', { ...o, query }),

    createPromotion: (body: Record<string, unknown>) =>
      client.post<{ id: string; code: string }>('/admin/promotions', body),

    updatePromotion: (promotionId: string, body: Record<string, unknown>) =>
      client.put<unknown>(`/admin/promotions/${promotionId}`, body),

    settings: (category?: string, o?: Opts) =>
      client.get<AdminSetting[]>('/admin/settings', { ...o, query: { category } }),

    updateSetting: (key: string, value: unknown) =>
      client.put<{ key: string; value: unknown }>(`/admin/settings/${key}`, { value }),

    auditLogs: (query: AdminQuery & { action?: string; entityType?: string } = {}, o?: Opts) =>
      client.get<OffsetPage<AdminAuditLog>>('/admin/audit-logs', { ...o, query }),

    auditActions: (o?: Opts) =>
      client.get<Array<{ action: string; count: number }>>('/admin/audit-logs/actions', o),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

/**
 * Shared list query bag. The index signature is what lets each endpoint add its
 * own filter without a bespoke type, while still passing through the client's
 * query serialiser.
 */
export interface AdminQuery {
  page?: number;
  limit?: number;
  q?: string;
  from?: string;
  to?: string;
  [key: string]: string | number | boolean | undefined | null;
}

// ------------------------------------------------------------------- shapes

export interface DashboardMetrics {
  generatedAt: string;
  users: { total: number; newThisWeek: number };
  drivers: { total: number; approved: number; awaitingApproval: number; onlineNow: number };
  rides: { activeNow: number; today: number; sharedToday: number };
  food: { activeNow: number; today: number };
  parcels: { activeNow: number; today: number };
  restaurants: { active: number; awaitingApproval: number };
  money: {
    currency: string;
    commissionToday: string;
    commissionThisMonth: string;
    driverEarningsAwaitingPayout: string;
    driverEarningsPaid: string;
  };
}

export interface RevenueByService {
  serviceType: string;
  transactions: number;
  commission: string;
}

export interface RevenueTrendPoint {
  date: string;
  commission: string;
  transactions: number;
}

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  roles: string[];
  joinedAt: string;
  lastLoginAt: string | null;
  activity: { rides: number; foodOrders: number; parcels: number };
}

export interface AdminDriver {
  id: string;
  name: string;
  phone: string;
  userStatus: string;
  licence: { number: string; expiresAt: string };
  approvalStatus: string;
  rejectionReason: string | null;
  sharedRideOptIn: boolean;
  presence: string;
  lastSeenAt: string | null;
  rating: { average: string; count: number };
  trips: { completed: number; cancelled: number };
  documentCount: number;
  vehicles: Array<{
    plateNumber: string;
    description: string;
    type: string;
    status: string;
    isPrimary: boolean;
  }>;
  joinedAt: string;
}

export interface AdminVehicleType {
  id: string;
  code: string;
  name: string;
  seatCapacity: number;
  maxPassengers: number;
  sharedRideEligible: boolean;
  parcelEligible: boolean;
  foodDeliveryEligible: boolean;
  maxParcelWeightKg: string | null;
  active: boolean;
  vehicles: number;
}

export interface AdminRide {
  id: string;
  reference: string;
  rideType: 'SOLO' | 'SHARED';
  status: string;
  createdAt: string;
  completedAt: string | null;
  vehicleType: string;
  plateNumber: string | null;
  driver: { id: string; name: string; phone: string } | null;
  seats: { total: number; occupied: number; joinable: boolean };
  stops: number;
  distanceM: number | null;
  durationS: number | null;
  passengers: Array<{
    id: string;
    firstName: string;
    status: string;
    joinedExistingRoute: boolean;
    from: string;
    to: string;
    fare: string | null;
  }>;
  money: {
    currency: string;
    passengersPaid: string;
    driverEarned: string;
    platformCommission: string;
  };
}

export interface AdminRideDetail
  extends Omit<AdminRide, 'passengers' | 'money' | 'driver' | 'stops'> {
  currency: string;
  cancelledBy: string | null;
  cancellationReason: string | null;
  vehicle: { plateNumber: string; make: string; model: string; colour: string } | null;
  driver: { id: string; name: string; phone: string; rating: string } | null;
  activeRoute: { encodedPolyline: string; distanceM: number; durationS: number } | null;
  passengers: Array<{
    id: string;
    firstName: string;
    phone: string;
    status: string;
    joinedExistingRoute: boolean;
    seats: number;
    from: string;
    to: string;
    payment: { method: string; status: string } | null;
    money: {
      currency: string;
      gross: string;
      discount: string;
      passengerPaid: string;
      driverEarned: string;
      platformCommission: string;
      shared: boolean;
    } | null;
  }>;
  stops: Array<{ sequence: number; type: string; status: string; address: string }>;
  statusHistory: Array<{ toStatus: string; actorRole: string | null; reason: string | null; createdAt: string }>;
  matching: {
    candidatesEvaluated: number;
    offered: number;
    rejectionsByReason: Record<string, number>;
  };
}

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  status: string;
  isAcceptingOrders: boolean;
  commissionPct: string;
  rating: { average: string; count: number };
  address: string;
  phone: string;
  orders: number;
  menuItems: number;
  staff: number;
  joinedAt: string;
}

export interface AdminFoodOrder {
  id: string;
  reference: string;
  status: string;
  restaurant: { id: string; name: string };
  customer: { firstName: string; phone: string };
  courier: { id: string; firstName: string } | null;
  deliveryStatus: string | null;
  items: number;
  payment: { method: string; status: string } | null;
  money: {
    currency: string;
    items: string;
    delivery: string;
    total: string;
    restaurantCommission: string;
    restaurantPayout: string;
  };
  placedAt: string | null;
  deliveredAt: string | null;
}

export interface AdminParcel {
  id: string;
  reference: string;
  status: string;
  parcelType: string;
  vehicleType: string;
  weightKg: string | null;
  distanceM: number | null;
  from: string;
  to: string;
  customer: { firstName: string; phone: string };
  courier: { id: string; firstName: string } | null;
  payment: { method: string; status: string; amount: string; currency: string } | null;
  money: { customerPaid: string; courierEarned: string; platformCommission: string } | null;
  bookedAt: string;
  assignedAt: string | null;
  deliveredAt: string | null;
}

export interface AdminPayment {
  id: string;
  serviceType: string;
  method: string;
  status: string;
  provider: string;
  amount: string;
  refunded: string;
  currency: string;
  customer: { firstName: string; phone: string };
  transactions: number;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPricingRule {
  id: string;
  serviceType: string;
  vehicleType: { id: string | null; code: string; name: string } | null;
  version: number;
  currency: string;
  effectiveFrom: string;
  passenger: Record<string, string | number>;
  driver: Record<string, string | number>;
}

export interface AdminPromotion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED';
  value: string;
  maxDiscount: string | null;
  minOrderAmount: string;
  appliesTo: string[] | null;
  usage: { used: number; limit: number | null; perUserLimit: number; redemptions: number };
  validFrom: string;
  validTo: string;
  active: boolean;
}

export interface AdminSetting {
  key: string;
  value: unknown;
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  category: string;
  label: string;
  description: string | null;
  min: number | null;
  max: number | null;
  defaultValue: unknown;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string | null; name: string; role: string | null };
  previousState: unknown;
  newState: unknown;
  metadata: unknown;
  ipAddress: string | null;
  at: string;
}

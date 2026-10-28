import type { ApiClient, RequestOptions } from './api-client';
import type {
  AccountSummary,
  SupportTicketDetail,
  SupportTicketStatus,
  SupportTicketSummary,
  AuthTokens,
  AvailablePromotion,
  Cart,
  CreatedParcel,
  CreatedRide,
  CursorPage,
  FoodOrderDetail,
  FoodOrderHistoryItem,
  FoodOrderTracking,
  LatLng,
  Me,
  NotificationItem,
  ParcelDetail,
  ParcelHistoryItem,
  ParcelQuote,
  ParcelTrackingEntry,
  ParcelType,
  PaymentHistoryItem,
  PaymentMethod,
  PendingRatings,
  PlacedFoodOrder,
  Place,
  RestaurantDetail,
  RestaurantSummary,
  RideDetail,
  RideHistoryItem,
  SafetyPreferences,
  SavedPlace,
  SharedRideGenderPreference,
  SharedRideSearchResult,
  VehicleEstimate,
  WalletView,
} from './types';

type Opts = Pick<RequestOptions, 'signal'>;

/**
 * The typed API surface.
 *
 * Every call the applications make lives here, so a component never builds a URL
 * or guesses a response shape, and a backend change surfaces as a type error in
 * exactly one file.
 */
export function createApi(client: ApiClient) {
  return {
    auth: {
      login: (phone: string, password: string) =>
        client.post<AuthTokens>('/auth/login', { phone, password }, { anonymous: true }),

      register: (input: {
        phone: string;
        password: string;
        firstName: string;
        lastName?: string;
        email?: string;
        gender?: string;
      }) => client.post<AuthTokens>('/auth/register', input, { anonymous: true }),

      logout: (refreshToken?: string) => client.post<void>('/auth/logout', { refreshToken }),

      me: (o?: Opts) => client.get<Me>('/auth/me', o),

      updateSafetyPreferences: (input: Partial<SafetyPreferences>) =>
        client.put<SafetyPreferences>('/auth/me/safety-preferences', input),

      /**
       * Updates the profile fields a person owns.
       *
       * Phone is absent deliberately: it is the login identifier and the
       * backend will not move an account onto an unverified number.
       */
      updateProfile: (input: {
        firstName?: string;
        lastName?: string;
        email?: string;
        gender?: string;
        avatarUrl?: string;
      }) => client.put<Me>('/auth/me', input),
    },

    places: {
      search: (q: string, near?: LatLng, o?: Opts) =>
        client.get<{ results: Place[]; attribution: string | null }>('/places/search', {
          ...o,
          query: { q, lat: near?.lat, lng: near?.lng },
        }),

      reverse: (point: LatLng, o?: Opts) =>
        client.get<Place & { attribution: string | null }>('/places/reverse', {
          ...o,
          query: { lat: point.lat, lng: point.lng },
        }),

      saved: (o?: Opts) => client.get<SavedPlace[]>('/places/saved', o),

      save: (input: { label: string; address: string; lat: number; lng: number }) =>
        client.post<SavedPlace>('/places/saved', input),

      removeSaved: (id: string) => client.delete<void>(`/places/saved/${id}`),
    },

    rides: {
      estimate: (input: { pickup: Place; dropoff: Place; scheduledPickupAt?: string }, o?: Opts) =>
        client.post<VehicleEstimate[]>('/rides/estimate', input, o),

      create: (input: {
        rideType: 'SOLO' | 'SHARED';
        vehicleTypeId: string;
        pickup: Place;
        dropoff: Place;
        seats?: number;
        note?: string;
        promotionCode?: string;
        genderPreference?: SharedRideGenderPreference;
        scheduledPickupAt?: string;
      }) => client.post<CreatedRide>('/rides', input),

      /**
       * Asks the backend which existing rides this journey can join.
       * The application never decides compatibility itself.
       */
      searchShared: (
        input: {
          pickup: Place;
          dropoff: Place;
          seats?: number;
          vehicleTypeId?: string;
          genderPreference?: SharedRideGenderPreference;
          scheduledPickupAt?: string;
        },
        o?: Opts,
      ) => client.post<SharedRideSearchResult>('/rides/shared/search', input, o),

      joinShared: (input: { requestId: string; rideId: string; note?: string }) =>
        client.post<{
          ridePassengerId: string;
          rideId: string;
          seats: number;
          fare: string | null;
          currency: string;
          estimatedPickupAt: string | null;
        }>('/rides/shared/join', input),

      get: (rideId: string, o?: Opts) => client.get<RideDetail>(`/rides/${rideId}`, o),

      history: (query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<CursorPage<RideHistoryItem>>('/rides', { ...o, query }),

      cancel: (rideId: string, reason?: string) =>
        client.post<{ rideId: string; cancelled: string }>(`/rides/${rideId}/cancel`, { reason }),
    },

    food: {
      restaurants: (
        query: { q?: string; lat?: number; lng?: number; openOnly?: boolean; cursor?: string; limit?: number } = {},
        o?: Opts,
      ) => client.get<CursorPage<RestaurantSummary>>('/restaurants', { ...o, query }),

      restaurant: (idOrSlug: string, o?: Opts) =>
        client.get<RestaurantDetail>(`/restaurants/${idOrSlug}`, o),

      carts: (o?: Opts) => client.get<Cart[]>('/food/carts', o),

      cart: (restaurantId: string, o?: Opts) =>
        client.get<Cart>(`/food/carts/${restaurantId}`, o),

      addItem: (input: { menuItemId: string; quantity: number; notes?: string }) =>
        client.post<Cart>('/food/carts/items', input),

      updateItem: (cartItemId: string, input: { quantity: number; notes?: string }) =>
        client.put<Cart>(`/food/carts/items/${cartItemId}`, input),

      removeItem: (cartItemId: string) => client.delete<Cart>(`/food/carts/items/${cartItemId}`),

      clearCart: (restaurantId: string) =>
        client.delete<{ cleared: boolean }>(`/food/carts/${restaurantId}`),

      checkout: (
        restaurantId: string,
        input: {
          deliveryAddress: Place;
          paymentMethod: PaymentMethod;
          deliveryNote?: string;
          promotionCode?: string;
        },
      ) => client.post<PlacedFoodOrder>(`/food/carts/${restaurantId}/checkout`, input),

      orders: (query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<CursorPage<FoodOrderHistoryItem>>('/food/orders', { ...o, query }),

      order: (orderId: string, o?: Opts) =>
        client.get<FoodOrderDetail>(`/food/orders/${orderId}`, o),

      tracking: (orderId: string, o?: Opts) =>
        client.get<FoodOrderTracking>(`/food/orders/${orderId}/tracking`, o),

      cancelOrder: (orderId: string, reason?: string) =>
        client.post<{ orderId: string; status: string }>(`/food/orders/${orderId}/cancel`, { reason }),
    },

    parcels: {
      types: (o?: Opts) => client.get<ParcelType[]>('/parcels/types', o),

      estimate: (
        input: {
          pickup: ParcelContactPoint;
          dropoff: ParcelContactPoint;
          parcelTypeId: string;
          weightKg?: number;
          vehicleTypeId?: string;
        },
        o?: Opts,
      ) => client.post<ParcelQuote[]>('/parcels/estimate', input, o),

      create: (input: {
        pickup: ParcelContactPoint;
        dropoff: ParcelContactPoint;
        parcelTypeId: string;
        vehicleTypeId: string;
        paymentMethod: PaymentMethod;
        weightKg?: number;
        declaredValue?: number;
        notes?: string;
        scheduledFor?: string;
        promotionCode?: string;
      }) => client.post<CreatedParcel>('/parcels', input),

      list: (query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<CursorPage<ParcelHistoryItem>>('/parcels', { ...o, query }),

      get: (parcelId: string, o?: Opts) => client.get<ParcelDetail>(`/parcels/${parcelId}`, o),

      tracking: (parcelId: string, query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<
          CursorPage<ParcelTrackingEntry> & {
            parcelId: string;
            reference: string;
            currentStatus: string;
          }
        >(`/parcels/${parcelId}/tracking`, { ...o, query }),

      cancel: (parcelId: string, reason?: string) =>
        client.post<{ parcelId: string; status: string }>(`/parcels/${parcelId}/cancel`, { reason }),
    },

    account: {
      summary: (o?: Opts) => client.get<AccountSummary>('/account/summary', o),

      wallet: (query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<WalletView>('/account/wallet', { ...o, query }),

      payments: (query: { cursor?: string; limit?: number; serviceType?: string } = {}, o?: Opts) =>
        client.get<CursorPage<PaymentHistoryItem>>('/account/payments', { ...o, query }),

      promotions: (o?: Opts) => client.get<AvailablePromotion[]>('/account/promotions', o),
    },

    notifications: {
      list: (query: { cursor?: string; limit?: number; unread?: boolean } = {}, o?: Opts) =>
        client.get<CursorPage<NotificationItem>>('/notifications', { ...o, query }),

      unreadCount: (o?: Opts) => client.get<{ count: number }>('/notifications/unread-count', o),

      markRead: (id: string) => client.post<{ updated: boolean }>(`/notifications/${id}/read`),

      markAllRead: () => client.post<{ updated: number }>('/notifications/read-all'),
    },

    ratings: {
      pending: (o?: Opts) => client.get<PendingRatings>('/ratings/pending', o),

      rateRide: (rideId: string, input: { score: number; comment?: string }) =>
        client.post<{ rated: boolean; score: number }>(`/ratings/rides/${rideId}`, input),

      rateFoodOrder: (orderId: string, input: { score: number; comment?: string }) =>
        client.post<{ rated: boolean; score: number }>(`/ratings/food-orders/${orderId}`, input),

      rateParcel: (parcelId: string, input: { score: number; comment?: string }) =>
        client.post<{ rated: boolean; score: number }>(`/ratings/parcels/${parcelId}`, input),
    },

    support: {
      create: (input: {
        subject: string;
        category: string;
        description: string;
        referenceType?: string;
        referenceId?: string;
      }) => client.post<SupportTicketSummary>('/support/tickets', input),

      list: (query: { cursor?: string; limit?: number } = {}, o?: Opts) =>
        client.get<CursorPage<SupportTicketSummary>>('/support/tickets', { ...o, query }),

      get: (ticketId: string, o?: Opts) =>
        client.get<SupportTicketDetail>(`/support/tickets/${ticketId}`, o),

      reply: (ticketId: string, body: string) =>
        client.post<{ id: string; status: SupportTicketStatus }>(
          `/support/tickets/${ticketId}/messages`,
          { body },
        ),

      close: (ticketId: string) =>
        client.post<{ ticketId: string; status: SupportTicketStatus }>(
          `/support/tickets/${ticketId}/close`,
        ),
    },
  };
}

export interface ParcelContactPoint extends Place {
  contactName: string;
  contactPhone: string;
}

export type Api = ReturnType<typeof createApi>;

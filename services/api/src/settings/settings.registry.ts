import { SettingValueType } from '@prisma/client';

/**
 * The single source of truth for runtime-configurable business rules (§28).
 *
 * Anything the business may plausibly want to change without a deploy belongs
 * here rather than in a code constant. Each entry carries its default, its
 * admissible range and a human label so the admin UI can be generated from the
 * registry instead of being hand-maintained alongside it.
 */
export interface SettingDefinition {
  key: string;
  defaultValue: unknown;
  valueType: SettingValueType;
  category: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
}

export const SETTING_KEYS = {
  // --- shared-ride corridor geometry -------------------------------------
  PICKUP_CORRIDOR_RADIUS_M: 'matching.pickup_corridor_radius_m',
  DROPOFF_CORRIDOR_RADIUS_M: 'matching.dropoff_corridor_radius_m',
  MIN_ROUTE_OVERLAP_PCT: 'matching.min_route_overlap_pct',
  MAX_BEARING_DIFFERENCE_DEG: 'matching.max_bearing_difference_deg',
  DRIVER_SEARCH_RADIUS_M: 'matching.driver_search_radius_m',

  // --- detour ceilings ----------------------------------------------------
  MAX_DETOUR_DISTANCE_PCT: 'matching.max_detour_distance_pct',
  MAX_DETOUR_DISTANCE_M: 'matching.max_detour_distance_m',
  MAX_DETOUR_DURATION_S: 'matching.max_detour_duration_s',
  MAX_EXISTING_PASSENGER_DELAY_S: 'matching.max_existing_passenger_delay_s',

  // --- time compatibility -------------------------------------------------
  PICKUP_TOLERANCE_EARLY_S: 'matching.pickup_tolerance_early_s',
  PICKUP_TOLERANCE_LATE_S: 'matching.pickup_tolerance_late_s',
  MAX_PICKUP_WAIT_S: 'matching.max_pickup_wait_s',

  // --- engine behaviour ---------------------------------------------------
  MAX_CANDIDATES: 'matching.max_candidates',
  SCORE_WEIGHTS: 'matching.score_weights',
  REQUEST_TTL_S: 'matching.request_ttl_s',

  // --- safety -------------------------------------------------------------
  ENFORCE_GENDER_PREFERENCES: 'safety.enforce_gender_preferences',
  REQUIRE_MUTUAL_GENDER_CONSENT: 'safety.require_mutual_gender_consent',
  SHARE_CO_PASSENGER_NAMES: 'safety.share_co_passenger_names',
  APPLY_GENDER_PREFERENCE_TO_DRIVER: 'safety.apply_gender_preference_to_driver',

  // --- rides --------------------------------------------------------------
  SCHEDULING_MAX_DAYS_AHEAD: 'ride.scheduling_max_days_ahead',
  SCHEDULING_MIN_LEAD_MINUTES: 'ride.scheduling_min_lead_minutes',
  QUOTE_TTL_SECONDS: 'ride.quote_ttl_seconds',
  DRIVER_ARRIVAL_GRACE_SECONDS: 'ride.driver_arrival_grace_seconds',

  // --- pricing ------------------------------------------------------------
  SURGE_ENABLED: 'pricing.surge_enabled',
  SURGE_MAX_MULTIPLIER: 'pricing.surge_max_multiplier',
  DEFAULT_CURRENCY: 'pricing.default_currency',

  // --- live location ------------------------------------------------------
  LOCATION_HISTORY_RETENTION_DAYS: 'location.history_retention_days',
  LOCATION_MIN_PING_INTERVAL_S: 'location.min_ping_interval_s',
  LOCATION_STALE_AFTER_S: 'location.stale_after_s',

  // --- delivery -----------------------------------------------------------
  FOOD_MAX_DELIVERY_RADIUS_M: 'food.max_delivery_radius_m',
  FOOD_DEFAULT_PREP_MINUTES: 'food.default_prep_minutes',
  FOOD_MAX_ITEMS_PER_ORDER: 'food.max_items_per_order',
  FOOD_MAX_QUANTITY_PER_ITEM: 'food.max_quantity_per_item',
  FOOD_CANCELLATION_CUTOFF_STATUS: 'food.cancellation_cutoff_status',

  // --- courier assignment (shared by food and parcel) ---------------------
  DELIVERY_SEARCH_RADIUS_M: 'delivery.search_radius_m',
  DELIVERY_MAX_OFFER_CANDIDATES: 'delivery.max_offer_candidates',
  DELIVERY_OFFER_TTL_S: 'delivery.offer_ttl_s',

  // --- parcel -------------------------------------------------------------
  PARCEL_FREE_WEIGHT_KG: 'parcel.free_weight_kg',
  PARCEL_WEIGHT_SURCHARGE_PER_KG: 'parcel.weight_surcharge_per_kg',
  PARCEL_MAX_DECLARED_VALUE: 'parcel.max_declared_value',
  PARCEL_SIGNATURE_SURCHARGE: 'parcel.signature_surcharge',

  // --- auth -----------------------------------------------------------------
  OTP_EXPIRY_SECONDS: 'auth.otp_expiry_seconds',
  OTP_LENGTH: 'auth.otp_length',
  OTP_DEV_MODE_EXPOSE_CODE: 'auth.otp_dev_mode_expose_code',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Relative weights for SOFT preferences only. Hard constraints are never
 * scored — a candidate that fails one is discarded before scoring begins.
 */
export interface ScoreWeights {
  routeOverlap: number;
  pickupDistance: number;
  dropoffDistance: number;
  timeCompatibility: number;
  detour: number;
}

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: SETTING_KEYS.PICKUP_CORRIDOR_RADIUS_M,
    defaultValue: 600,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Pickup corridor radius (m)',
    description:
      'How far a requested pickup may sit from the driver’s planned route and still be considered on-route.',
    min: 50,
    max: 5000,
  },
  {
    key: SETTING_KEYS.DROPOFF_CORRIDOR_RADIUS_M,
    defaultValue: 600,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Drop-off corridor radius (m)',
    description:
      'How far a requested drop-off may sit from the driver’s planned route and still be considered on-route.',
    min: 50,
    max: 5000,
  },
  {
    key: SETTING_KEYS.MIN_ROUTE_OVERLAP_PCT,
    defaultValue: 30,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Minimum route overlap (%)',
    description:
      'The passenger’s journey must coincide with at least this share of the driver’s remaining route.',
    min: 0,
    max: 100,
  },
  {
    key: SETTING_KEYS.MAX_BEARING_DIFFERENCE_DEG,
    defaultValue: 75,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum heading difference (degrees)',
    description:
      'Guards against matching a passenger travelling against the driver’s direction of travel.',
    min: 0,
    max: 180,
  },
  {
    key: SETTING_KEYS.DRIVER_SEARCH_RADIUS_M,
    defaultValue: 20000,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Driver search radius (m)',
    description: 'Maximum distance from the driver’s current position to the requested pickup.',
    min: 500,
    max: 100000,
  },
  {
    key: SETTING_KEYS.MAX_DETOUR_DISTANCE_PCT,
    defaultValue: 25,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum detour (% of route)',
    description: 'Extra distance a new passenger may add, as a share of the current planned route.',
    min: 0,
    max: 200,
  },
  {
    key: SETTING_KEYS.MAX_DETOUR_DISTANCE_M,
    defaultValue: 6000,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum detour (m)',
    description: 'Absolute ceiling on extra distance, applied alongside the percentage ceiling.',
    min: 0,
    max: 100000,
  },
  {
    key: SETTING_KEYS.MAX_DETOUR_DURATION_S,
    defaultValue: 900,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum detour (seconds)',
    description: 'Absolute ceiling on extra travel time caused by adding a passenger.',
    min: 0,
    max: 7200,
  },
  {
    key: SETTING_KEYS.MAX_EXISTING_PASSENGER_DELAY_S,
    defaultValue: 600,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum delay to existing passengers (seconds)',
    description:
      'A new passenger may not push any already-confirmed passenger’s drop-off later than this.',
    min: 0,
    max: 3600,
  },
  {
    key: SETTING_KEYS.PICKUP_TOLERANCE_EARLY_S,
    defaultValue: 300,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Pickup tolerance — early (seconds)',
    description: 'How much earlier than requested the driver may arrive and still be offered.',
    min: 0,
    max: 3600,
  },
  {
    key: SETTING_KEYS.PICKUP_TOLERANCE_LATE_S,
    defaultValue: 900,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Pickup tolerance — late (seconds)',
    description: 'How much later than requested the driver may arrive and still be offered.',
    min: 0,
    max: 7200,
  },
  {
    key: SETTING_KEYS.MAX_PICKUP_WAIT_S,
    defaultValue: 600,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum driver waiting time at pickup (seconds)',
    description: 'How long a driver may be asked to wait at a shared pickup point.',
    min: 0,
    max: 3600,
  },
  {
    key: SETTING_KEYS.MAX_CANDIDATES,
    defaultValue: 20,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Maximum candidate rides evaluated',
    description: 'Caps the shortlist size so a search has a bounded cost under load.',
    min: 1,
    max: 200,
  },
  {
    key: SETTING_KEYS.SCORE_WEIGHTS,
    defaultValue: {
      routeOverlap: 35,
      pickupDistance: 20,
      dropoffDistance: 15,
      timeCompatibility: 20,
      detour: 10,
    } satisfies ScoreWeights,
    valueType: SettingValueType.JSON,
    category: 'matching',
    label: 'Soft-preference score weights',
    description:
      'Relative weights used to rank candidates that have already satisfied every hard constraint.',
  },
  {
    key: SETTING_KEYS.REQUEST_TTL_S,
    defaultValue: 300,
    valueType: SettingValueType.NUMBER,
    category: 'matching',
    label: 'Shared-ride search validity (seconds)',
    description: 'How long a set of offered matches stays bookable before it must be re-searched.',
    min: 30,
    max: 1800,
  },
  {
    key: SETTING_KEYS.ENFORCE_GENDER_PREFERENCES,
    defaultValue: true,
    valueType: SettingValueType.BOOLEAN,
    category: 'safety',
    label: 'Enforce gender matching preferences',
    description:
      'When enabled, a passenger’s gender preference is a hard constraint that cannot be overridden by a better price or ETA.',
  },
  {
    key: SETTING_KEYS.REQUIRE_MUTUAL_GENDER_CONSENT,
    defaultValue: true,
    valueType: SettingValueType.BOOLEAN,
    category: 'safety',
    label: 'Require mutual gender compatibility',
    description:
      'Both the joining passenger and every existing passenger must accept each other, not just the joiner.',
  },
  {
    key: SETTING_KEYS.SHARE_CO_PASSENGER_NAMES,
    defaultValue: false,
    valueType: SettingValueType.BOOLEAN,
    category: 'safety',
    label: 'Show co-passenger names',
    description:
      'When disabled, co-passengers see only an initial and a rating — never full names, phone numbers or gender.',
  },
  {
    key: SETTING_KEYS.APPLY_GENDER_PREFERENCE_TO_DRIVER,
    defaultValue: false,
    valueType: SettingValueType.BOOLEAN,
    category: 'safety',
    label: 'Apply gender preference to the driver as well',
    description:
      'When enabled, a women-only or men-only preference also constrains the driver’s gender, not only co-passengers. Off by default: whether a gender-restricted ride implies a gender-restricted driver is a policy decision for the operator, not a technical default.',
  },
  {
    key: SETTING_KEYS.SCHEDULING_MAX_DAYS_AHEAD,
    defaultValue: 7,
    valueType: SettingValueType.NUMBER,
    category: 'ride',
    label: 'Maximum scheduling horizon (days)',
    description: 'How far ahead a ride may be scheduled.',
    min: 1,
    max: 90,
  },
  {
    key: SETTING_KEYS.SCHEDULING_MIN_LEAD_MINUTES,
    defaultValue: 30,
    valueType: SettingValueType.NUMBER,
    category: 'ride',
    label: 'Minimum scheduling lead time (minutes)',
    description: 'A scheduled ride must be at least this far in the future.',
    min: 0,
    max: 1440,
  },
  {
    key: SETTING_KEYS.QUOTE_TTL_SECONDS,
    defaultValue: 300,
    valueType: SettingValueType.NUMBER,
    category: 'ride',
    label: 'Fare quote validity (seconds)',
    description: 'A quote must be honoured for this long, after which it must be recalculated.',
    min: 30,
    max: 3600,
  },
  {
    key: SETTING_KEYS.DRIVER_ARRIVAL_GRACE_SECONDS,
    defaultValue: 300,
    valueType: SettingValueType.NUMBER,
    category: 'ride',
    label: 'Free waiting time after arrival (seconds)',
    description: 'How long the driver waits at pickup before waiting charges begin.',
    min: 0,
    max: 1800,
  },
  {
    key: SETTING_KEYS.SURGE_ENABLED,
    defaultValue: false,
    valueType: SettingValueType.BOOLEAN,
    category: 'pricing',
    label: 'Demand pricing enabled',
    description: 'When disabled, every quote uses a surge multiplier of exactly 1.',
  },
  {
    key: SETTING_KEYS.SURGE_MAX_MULTIPLIER,
    defaultValue: 2,
    valueType: SettingValueType.NUMBER,
    category: 'pricing',
    label: 'Maximum demand multiplier',
    description: 'Hard ceiling on the surge multiplier regardless of measured demand.',
    min: 1,
    max: 5,
  },
  {
    key: SETTING_KEYS.DEFAULT_CURRENCY,
    defaultValue: 'LKR',
    valueType: SettingValueType.STRING,
    category: 'pricing',
    label: 'Default currency',
    description: 'ISO-4217 code used when a pricing rule does not specify one.',
  },
  {
    key: SETTING_KEYS.LOCATION_HISTORY_RETENTION_DAYS,
    defaultValue: 30,
    valueType: SettingValueType.NUMBER,
    category: 'location',
    label: 'GPS history retention (days)',
    description: 'Driver breadcrumb trails older than this are deleted by the retention job.',
    min: 1,
    max: 365,
  },
  {
    key: SETTING_KEYS.LOCATION_MIN_PING_INTERVAL_S,
    defaultValue: 4,
    valueType: SettingValueType.NUMBER,
    category: 'location',
    label: 'Minimum GPS ping interval (seconds)',
    description: 'Pings arriving faster than this update the live position but are not persisted.',
    min: 1,
    max: 60,
  },
  {
    key: SETTING_KEYS.LOCATION_STALE_AFTER_S,
    defaultValue: 60,
    valueType: SettingValueType.NUMBER,
    category: 'location',
    label: 'Location considered stale after (seconds)',
    description: 'A driver whose last ping is older than this is excluded from dispatch.',
    min: 10,
    max: 900,
  },
  {
    key: SETTING_KEYS.FOOD_MAX_DELIVERY_RADIUS_M,
    defaultValue: 10000,
    valueType: SettingValueType.NUMBER,
    category: 'food',
    label: 'Maximum food delivery radius (m)',
    description: 'Platform-wide ceiling; a restaurant may set a smaller radius but not a larger one.',
    min: 500,
    max: 50000,
  },
  {
    key: SETTING_KEYS.FOOD_DEFAULT_PREP_MINUTES,
    defaultValue: 20,
    valueType: SettingValueType.NUMBER,
    category: 'food',
    label: 'Default preparation time (minutes)',
    description: 'Used when a restaurant has not set its own preparation time.',
    min: 1,
    max: 180,
  },
  {
    key: SETTING_KEYS.FOOD_MAX_ITEMS_PER_ORDER,
    defaultValue: 50,
    valueType: SettingValueType.NUMBER,
    category: 'food',
    label: 'Maximum distinct items in one order',
    description: 'Bounds the size of a single cart so one order cannot become unbounded work.',
    min: 1,
    max: 200,
  },
  {
    key: SETTING_KEYS.FOOD_MAX_QUANTITY_PER_ITEM,
    defaultValue: 20,
    valueType: SettingValueType.NUMBER,
    category: 'food',
    label: 'Maximum quantity of any single item',
    description: 'Guards against a mistyped or hostile quantity.',
    min: 1,
    max: 500,
  },
  {
    key: SETTING_KEYS.FOOD_CANCELLATION_CUTOFF_STATUS,
    defaultValue: 'PREPARING',
    valueType: SettingValueType.STRING,
    category: 'food',
    label: 'Customer cancellation cut-off',
    description:
      'The first order status at which a customer may no longer cancel without contacting support. Food already being cooked cannot be un-cooked.',
  },
  {
    key: SETTING_KEYS.DELIVERY_SEARCH_RADIUS_M,
    defaultValue: 8000,
    valueType: SettingValueType.NUMBER,
    category: 'delivery',
    label: 'Courier search radius (m)',
    description:
      'How far from a collection point the platform will look for an available courier.',
    min: 500,
    max: 50000,
  },
  {
    key: SETTING_KEYS.DELIVERY_MAX_OFFER_CANDIDATES,
    defaultValue: 10,
    valueType: SettingValueType.NUMBER,
    category: 'delivery',
    label: 'Maximum couriers offered a job',
    description: 'Caps how many couriers see one job, so a search has a bounded cost.',
    min: 1,
    max: 100,
  },
  {
    key: SETTING_KEYS.DELIVERY_OFFER_TTL_S,
    defaultValue: 60,
    valueType: SettingValueType.NUMBER,
    category: 'delivery',
    label: 'Courier offer validity (seconds)',
    description: 'How long a job stays on a courier’s screen before it is re-offered.',
    min: 10,
    max: 600,
  },
  {
    key: SETTING_KEYS.PARCEL_FREE_WEIGHT_KG,
    defaultValue: 5,
    valueType: SettingValueType.NUMBER,
    category: 'parcel',
    label: 'Weight included in the base fare (kg)',
    description: 'Weight up to this figure carries no surcharge.',
    min: 0,
    max: 200,
  },
  {
    key: SETTING_KEYS.PARCEL_WEIGHT_SURCHARGE_PER_KG,
    defaultValue: 0,
    valueType: SettingValueType.NUMBER,
    category: 'parcel',
    label: 'Weight surcharge per kg beyond the included weight',
    description:
      'Charged per whole kilogram above the included weight. Zero by default — set it only if the business charges for weight.',
    min: 0,
    max: 10000,
  },
  {
    key: SETTING_KEYS.PARCEL_SIGNATURE_SURCHARGE,
    defaultValue: 0,
    valueType: SettingValueType.NUMBER,
    category: 'parcel',
    label: 'Surcharge for parcels requiring a signature',
    description: 'Applied when the parcel class requires proof of receipt.',
    min: 0,
    max: 10000,
  },
  {
    key: SETTING_KEYS.PARCEL_MAX_DECLARED_VALUE,
    defaultValue: 100000,
    valueType: SettingValueType.NUMBER,
    category: 'parcel',
    label: 'Maximum declared parcel value',
    description: 'Bookings declaring more than this are refused and must be handled manually.',
    min: 0,
    max: 100000000,
  },
  {
    key: SETTING_KEYS.OTP_EXPIRY_SECONDS,
    defaultValue: 300,
    valueType: SettingValueType.NUMBER,
    category: 'auth',
    label: 'OTP code validity (seconds)',
    description: 'How long a phone verification code stays valid after being requested.',
    min: 60,
    max: 1800,
  },
  {
    key: SETTING_KEYS.OTP_LENGTH,
    defaultValue: 6,
    valueType: SettingValueType.NUMBER,
    category: 'auth',
    label: 'OTP code length (digits)',
    description: 'Number of digits in a phone verification code.',
    min: 4,
    max: 8,
  },
  {
    key: SETTING_KEYS.OTP_DEV_MODE_EXPOSE_CODE,
    defaultValue: true,
    valueType: SettingValueType.BOOLEAN,
    category: 'auth',
    label: 'Expose OTP code in the API response (dev mode)',
    description:
      'No SMS gateway is configured yet, so the code is returned directly to the client and logged. Turn this off the moment a real SMS provider is wired in — it must never be on in production.',
  },
];

export const SETTING_DEFINITION_BY_KEY = new Map(
  SETTING_DEFINITIONS.map((d) => [d.key, d] as const),
);

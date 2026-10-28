-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "SharedRideGenderPreference" AS ENUM ('ANY', 'SAME_GENDER_ONLY', 'WOMEN_ONLY', 'MEN_ONLY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'DRIVER', 'USER', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "DriverApprovalStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DriverDocumentType" AS ENUM ('NATIONAL_ID', 'DRIVING_LICENCE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'POLICE_CLEARANCE', 'PROFILE_PHOTO', 'VEHICLE_PHOTO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DriverPresence" AS ENUM ('OFFLINE', 'ONLINE', 'ON_TRIP', 'BREAK');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('RIDE', 'SHARED_RIDE', 'FOOD_DELIVERY', 'PARCEL');

-- CreateEnum
CREATE TYPE "RideType" AS ENUM ('SOLO', 'SHARED');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('DRAFT', 'SEARCHING', 'SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RidePassengerStatus" AS ENUM ('REQUESTED', 'OFFERED', 'CONFIRMED', 'AWAITING_PICKUP', 'ONBOARD', 'DROPPED_OFF', 'CANCELLED', 'REJECTED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'DROPOFF', 'WAYPOINT');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'ARRIVED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('USER', 'DRIVER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MatchRejectionReason" AS ENUM ('NONE', 'CAPACITY_FULL', 'GENDER_PREFERENCE_CONFLICT', 'PICKUP_OFF_ROUTE', 'DROPOFF_OFF_ROUTE', 'WRONG_DIRECTION', 'INVALID_STOP_ORDER', 'DETOUR_EXCEEDED', 'TIME_INCOMPATIBLE', 'DRIVER_UNAVAILABLE', 'VEHICLE_NOT_SHARED_ELIGIBLE', 'RIDE_NOT_JOINABLE', 'SAFETY_POLICY', 'SELF_MATCH');

-- CreateEnum
CREATE TYPE "MatchRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'NO_MATCH', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'WALLET', 'CARD', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('AUTHORIZE', 'CAPTURE', 'CHARGE', 'REFUND', 'VOID', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FoodOrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'REJECTED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'HEADING_TO_PICKUP', 'AT_PICKUP', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT,
    "phone" VARCHAR(20) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80),
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "date_of_birth" DATE,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(3),
    "phone_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" "RoleCode" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_ride_preferences" (
    "user_id" UUID NOT NULL,
    "allow_shared_rides" BOOLEAN NOT NULL DEFAULT true,
    "gender_preference" "SharedRideGenderPreference" NOT NULL DEFAULT 'ANY',
    "max_co_passengers" INTEGER,
    "max_detour_minutes" INTEGER,
    "allow_front_seat" BOOLEAN NOT NULL DEFAULT true,
    "share_contact_with_co_pax" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shared_ride_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "address_line" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "licence_number" VARCHAR(40) NOT NULL,
    "licence_expiry" DATE NOT NULL,
    "approval_status" "DriverApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "rejection_reason" TEXT,
    "shared_ride_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "completed_trips" INTEGER NOT NULL DEFAULT 0,
    "cancelled_trips" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "type" "DriverDocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" DATE,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "seat_capacity" INTEGER NOT NULL,
    "max_passengers" INTEGER NOT NULL,
    "shared_ride_eligible" BOOLEAN NOT NULL DEFAULT false,
    "parcel_eligible" BOOLEAN NOT NULL DEFAULT false,
    "food_delivery_eligible" BOOLEAN NOT NULL DEFAULT false,
    "max_parcel_weight_kg" DECIMAL(6,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" VARCHAR(20) NOT NULL,
    "make" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "year" INTEGER NOT NULL,
    "colour" VARCHAR(30) NOT NULL,
    "seat_capacity" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_vehicle" (
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "driver_vehicle_pkey" PRIMARY KEY ("driver_id","vehicle_id")
);

-- CreateTable
CREATE TABLE "driver_availability" (
    "driver_id" UUID NOT NULL,
    "presence" "DriverPresence" NOT NULL DEFAULT 'OFFLINE',
    "active_vehicle_id" UUID,
    "accepts_shared" BOOLEAN NOT NULL DEFAULT false,
    "accepts_food" BOOLEAN NOT NULL DEFAULT false,
    "accepts_parcel" BOOLEAN NOT NULL DEFAULT false,
    "went_online_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_availability_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "driver_locations_current" (
    "driver_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "heading_deg" DECIMAL(5,2),
    "speed_kph" DECIMAL(6,2),
    "accuracy_m" DECIMAL(7,2),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_locations_current_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "driver_location_history" (
    "id" BIGSERIAL NOT NULL,
    "driver_id" UUID NOT NULL,
    "ride_id" UUID,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "heading_deg" DECIMAL(5,2),
    "speed_kph" DECIMAL(6,2),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_location_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(20) NOT NULL,
    "ride_type" "RideType" NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'SEARCHING',
    "driver_id" UUID,
    "vehicle_id" UUID,
    "vehicle_type_id" UUID NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "seats_occupied" INTEGER NOT NULL DEFAULT 0,
    "joinable" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_pickup_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "CancelledBy",
    "cancellation_reason" TEXT,
    "active_route_id" UUID,
    "planned_distance_m" INTEGER,
    "planned_duration_s" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_passengers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "RidePassengerStatus" NOT NULL DEFAULT 'REQUESTED',
    "seats_requested" INTEGER NOT NULL DEFAULT 1,
    "is_shared_join" BOOLEAN NOT NULL DEFAULT false,
    "pickup_address" TEXT NOT NULL,
    "pickup_latitude" DECIMAL(10,7) NOT NULL,
    "pickup_longitude" DECIMAL(10,7) NOT NULL,
    "pickup_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("pickup_longitude"::double precision, "pickup_latitude"::double precision), 4326)::geography) STORED,
    "dropoff_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(10,7) NOT NULL,
    "dropoff_longitude" DECIMAL(10,7) NOT NULL,
    "dropoff_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("dropoff_longitude"::double precision, "dropoff_latitude"::double precision), 4326)::geography) STORED,
    "requested_pickup_at" TIMESTAMPTZ(3),
    "estimated_pickup_at" TIMESTAMPTZ(3),
    "estimated_dropoff_at" TIMESTAMPTZ(3),
    "boarded_at" TIMESTAMPTZ(3),
    "dropped_off_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "CancelledBy",
    "cancellation_reason" TEXT,
    "gender_preference" "SharedRideGenderPreference" NOT NULL DEFAULT 'ANY',
    "gender_snapshot" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "note" TEXT,
    "fare_quote_id" UUID,
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "ride_passenger_id" UUID,
    "sequence" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "status" "StopStatus" NOT NULL DEFAULT 'PENDING',
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "estimated_arrival_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ride_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "encoded_polyline" TEXT NOT NULL,
    "geometry" geography(LineString, 4326),
    "distance_m" INTEGER NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "legs" JSONB,
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "from_status" "RideStatus",
    "to_status" "RideStatus" NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "RoleCode",
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_ride_match_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "vehicle_type_id" UUID,
    "status" "MatchRequestStatus" NOT NULL DEFAULT 'OPEN',
    "pickup_address" TEXT NOT NULL,
    "pickup_latitude" DECIMAL(10,7) NOT NULL,
    "pickup_longitude" DECIMAL(10,7) NOT NULL,
    "pickup_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("pickup_longitude"::double precision, "pickup_latitude"::double precision), 4326)::geography) STORED,
    "dropoff_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(10,7) NOT NULL,
    "dropoff_longitude" DECIMAL(10,7) NOT NULL,
    "dropoff_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("dropoff_longitude"::double precision, "dropoff_latitude"::double precision), 4326)::geography) STORED,
    "requested_pickup_at" TIMESTAMPTZ(3),
    "seats_requested" INTEGER NOT NULL DEFAULT 1,
    "gender_preference" "SharedRideGenderPreference" NOT NULL DEFAULT 'ANY',
    "gender_snapshot" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "settings_snapshot" JSONB,
    "matched_ride_passenger_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shared_ride_match_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_ride_match_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "rejection_reason" "MatchRejectionReason" NOT NULL DEFAULT 'NONE',
    "pickup_distance_m" INTEGER,
    "dropoff_distance_m" INTEGER,
    "pickup_route_fraction" DECIMAL(8,7),
    "dropoff_route_fraction" DECIMAL(8,7),
    "route_overlap_pct" DECIMAL(5,2),
    "additional_distance_m" INTEGER,
    "additional_duration_s" INTEGER,
    "estimated_pickup_at" TIMESTAMPTZ(3),
    "pickup_time_delta_s" INTEGER,
    "score_breakdown" JSONB,
    "total_score" DECIMAL(6,2),
    "quoted_fare" DECIMAL(14,2),
    "quoted_saving" DECIMAL(14,2),
    "driver_additional_earning" DECIMAL(14,2),
    "fare_quote_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_ride_match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "vehicle_type_id" UUID,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "base_fare" DECIMAL(14,2) NOT NULL,
    "per_km_fare" DECIMAL(14,2) NOT NULL,
    "per_minute_fare" DECIMAL(14,2) NOT NULL,
    "minimum_fare" DECIMAL(14,2) NOT NULL,
    "booking_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "waiting_per_minute_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "free_waiting_minutes" INTEGER NOT NULL DEFAULT 5,
    "shared_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "max_passenger_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "service_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cancellation_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "free_cancellation_seconds" INTEGER NOT NULL DEFAULT 120,
    "platform_commission_pct" DECIMAL(5,2) NOT NULL,
    "shared_passenger_driver_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "additional_stop_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minimum_driver_earning" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "pricing_rule_id" UUID NOT NULL,
    "pricing_rule_version" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "distance_m" INTEGER NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "waiting_minutes" INTEGER NOT NULL DEFAULT 0,
    "additional_stops" INTEGER NOT NULL DEFAULT 0,
    "surge_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "gross_fare" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "promotion_id" UUID,
    "service_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "passenger_total" DECIMAL(14,2) NOT NULL,
    "driver_gross" DECIMAL(14,2) NOT NULL,
    "platform_commission" DECIMAL(14,2) NOT NULL,
    "driver_stop_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "driver_bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "driver_net" DECIMAL(14,2) NOT NULL,
    "components" JSONB NOT NULL,
    "inputs" JSONB,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fare_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "refunded_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "provider" VARCHAR(30) NOT NULL,
    "provider_ref" TEXT,
    "idempotency_key" TEXT,
    "authorized_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "provider_ref" TEXT,
    "provider_response" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_id" UUID NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_earnings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "ride_id" UUID,
    "ride_passenger_id" UUID,
    "food_order_id" UUID,
    "parcel_order_id" UUID,
    "fare_quote_id" UUID,
    "gross_amount" DECIMAL(14,2) NOT NULL,
    "commission_amount" DECIMAL(14,2) NOT NULL,
    "stop_fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adjustment_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "is_shared_increment" BOOLEAN NOT NULL DEFAULT false,
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_commissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "earning_id" UUID NOT NULL,
    "service_type" "ServiceType" NOT NULL,
    "rate_pct" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "max_discount" DECIMAL(14,2),
    "min_order_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "service_types" "ServiceType"[],
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "promotion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference_type" VARCHAR(40) NOT NULL,
    "reference_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_type" "ServiceType" NOT NULL,
    "ride_id" UUID,
    "food_order_id" UUID,
    "parcel_order_id" UUID,
    "author_user_id" UUID NOT NULL,
    "subject_user_id" UUID,
    "restaurant_id" UUID,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" VARCHAR(60) NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "phone" VARCHAR(20) NOT NULL,
    "email" CITEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "status" "RestaurantStatus" NOT NULL DEFAULT 'PENDING',
    "is_accepting_orders" BOOLEAN NOT NULL DEFAULT false,
    "default_prep_minutes" INTEGER NOT NULL DEFAULT 20,
    "commission_pct" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "min_order_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "address_line" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "delivery_radius_m" INTEGER NOT NULL DEFAULT 8000,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_users" (
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'STAFF',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_users_pkey" PRIMARY KEY ("restaurant_id","user_id")
);

-- CreateTable
CREATE TABLE "restaurant_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "opens_at" VARCHAR(5) NOT NULL,
    "closes_at" VARCHAR(5) NOT NULL,

    CONSTRAINT "restaurant_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "image_url" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "prep_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "FoodOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "delivery_address" TEXT NOT NULL,
    "delivery_latitude" DECIMAL(10,7) NOT NULL,
    "delivery_longitude" DECIMAL(10,7) NOT NULL,
    "delivery_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("delivery_longitude"::double precision, "delivery_latitude"::double precision), 4326)::geography) STORED,
    "delivery_note" TEXT,
    "items_subtotal" DECIMAL(14,2) NOT NULL,
    "delivery_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'LKR',
    "restaurant_commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "restaurant_payout" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fare_quote_id" UUID,
    "payment_id" UUID,
    "promotion_id" UUID,
    "scheduled_for" TIMESTAMPTZ(3),
    "placed_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "prep_minutes" INTEGER,
    "ready_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "CancelledBy",
    "cancellation_reason" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "name_snapshot" VARCHAR(120) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "food_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "from_status" "FoodOrderStatus",
    "to_status" "FoodOrderStatus" NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "RoleCode",
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "assigned_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "distance_m" INTEGER,
    "duration_s" INTEGER,
    "encoded_polyline" TEXT,
    "proof_photo_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "food_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "max_weight_kg" DECIMAL(6,2) NOT NULL,
    "max_length_cm" INTEGER,
    "min_vehicle_type_code" VARCHAR(30),
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parcel_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "parcel_type_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "driver_id" UUID,
    "status" "ParcelStatus" NOT NULL DEFAULT 'DRAFT',
    "pickup_address" TEXT NOT NULL,
    "pickup_latitude" DECIMAL(10,7) NOT NULL,
    "pickup_longitude" DECIMAL(10,7) NOT NULL,
    "pickup_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("pickup_longitude"::double precision, "pickup_latitude"::double precision), 4326)::geography) STORED,
    "pickup_contact_name" VARCHAR(80) NOT NULL,
    "pickup_contact_phone" VARCHAR(20) NOT NULL,
    "dropoff_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(10,7) NOT NULL,
    "dropoff_longitude" DECIMAL(10,7) NOT NULL,
    "dropoff_location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("dropoff_longitude"::double precision, "dropoff_latitude"::double precision), 4326)::geography) STORED,
    "receiver_name" VARCHAR(80) NOT NULL,
    "receiver_phone" VARCHAR(20) NOT NULL,
    "weight_kg" DECIMAL(6,2),
    "declared_value" DECIMAL(14,2),
    "notes" TEXT,
    "distance_m" INTEGER,
    "duration_s" INTEGER,
    "encoded_polyline" TEXT,
    "fare_quote_id" UUID,
    "payment_id" UUID,
    "scheduled_for" TIMESTAMPTZ(3),
    "assigned_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "CancelledBy",
    "cancellation_reason" TEXT,
    "proof_photo_key" TEXT,
    "receiver_signature_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parcel_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_tracking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parcel_order_id" UUID NOT NULL,
    "status" "ParcelStatus" NOT NULL,
    "note" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography) STORED,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "assigned_to_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "value_type" "SettingValueType" NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "label" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "min_value" DECIMAL(14,4),
    "max_value" DECIMAL(14,4),
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "RoleCode",
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" TEXT,
    "previous_state" JSONB,
    "new_state" JSONB,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_user_id_label_key" ON "saved_places"("user_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licence_number_key" ON "drivers"("licence_number");

-- CreateIndex
CREATE INDEX "drivers_approval_status_idx" ON "drivers"("approval_status");

-- CreateIndex
CREATE INDEX "drivers_shared_ride_opt_in_idx" ON "drivers"("shared_ride_opt_in");

-- CreateIndex
CREATE INDEX "driver_documents_status_idx" ON "driver_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driver_id_type_key" ON "driver_documents"("driver_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_code_key" ON "vehicle_types"("code");

-- CreateIndex
CREATE INDEX "vehicle_types_active_sort_order_idx" ON "vehicle_types"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "vehicles_vehicle_type_id_status_idx" ON "vehicles"("vehicle_type_id", "status");

-- CreateIndex
CREATE INDEX "driver_vehicle_vehicle_id_idx" ON "driver_vehicle"("vehicle_id");

-- CreateIndex
CREATE INDEX "driver_availability_presence_idx" ON "driver_availability"("presence");

-- CreateIndex
CREATE INDEX "driver_location_history_driver_id_recorded_at_idx" ON "driver_location_history"("driver_id", "recorded_at");

-- CreateIndex
CREATE INDEX "driver_location_history_ride_id_recorded_at_idx" ON "driver_location_history"("ride_id", "recorded_at");

-- CreateIndex
CREATE INDEX "driver_location_history_recorded_at_idx" ON "driver_location_history"("recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "rides_reference_key" ON "rides"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "rides_active_route_id_key" ON "rides"("active_route_id");

-- CreateIndex
CREATE INDEX "rides_status_joinable_idx" ON "rides"("status", "joinable");

-- CreateIndex
CREATE INDEX "rides_driver_id_status_idx" ON "rides"("driver_id", "status");

-- CreateIndex
CREATE INDEX "rides_scheduled_pickup_at_idx" ON "rides"("scheduled_pickup_at");

-- CreateIndex
CREATE INDEX "rides_created_at_idx" ON "rides"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_passengers_fare_quote_id_key" ON "ride_passengers"("fare_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_passengers_payment_id_key" ON "ride_passengers"("payment_id");

-- CreateIndex
CREATE INDEX "ride_passengers_ride_id_status_idx" ON "ride_passengers"("ride_id", "status");

-- CreateIndex
CREATE INDEX "ride_passengers_user_id_created_at_idx" ON "ride_passengers"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_passengers_status_idx" ON "ride_passengers"("status");

-- CreateIndex
CREATE INDEX "ride_stops_ride_passenger_id_idx" ON "ride_stops"("ride_passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_stops_ride_id_sequence_key" ON "ride_stops"("ride_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ride_routes_ride_id_version_key" ON "ride_routes"("ride_id", "version");

-- CreateIndex
CREATE INDEX "ride_status_history_ride_id_created_at_idx" ON "ride_status_history"("ride_id", "created_at");

-- CreateIndex
CREATE INDEX "shared_ride_match_requests_user_id_created_at_idx" ON "shared_ride_match_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "shared_ride_match_requests_status_expires_at_idx" ON "shared_ride_match_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "shared_ride_match_candidates_request_id_eligible_total_scor_idx" ON "shared_ride_match_candidates"("request_id", "eligible", "total_score");

-- CreateIndex
CREATE UNIQUE INDEX "shared_ride_match_candidates_request_id_ride_id_key" ON "shared_ride_match_candidates"("request_id", "ride_id");

-- CreateIndex
CREATE INDEX "pricing_rules_service_type_active_idx" ON "pricing_rules"("service_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_service_type_vehicle_type_id_version_key" ON "pricing_rules"("service_type", "vehicle_type_id", "version");

-- CreateIndex
CREATE INDEX "fare_quotes_service_type_created_at_idx" ON "fare_quotes"("service_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_created_at_idx" ON "payment_transactions"("payment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "driver_earnings_driver_id_created_at_idx" ON "driver_earnings"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "driver_earnings_driver_id_status_idx" ON "driver_earnings"("driver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_commissions_earning_id_key" ON "platform_commissions"("earning_id");

-- CreateIndex
CREATE INDEX "platform_commissions_service_type_created_at_idx" ON "platform_commissions"("service_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_active_valid_from_valid_to_idx" ON "promotions"("active", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotion_id_user_id_idx" ON "promotion_redemptions"("promotion_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_promotion_id_reference_type_reference_key" ON "promotion_redemptions"("promotion_id", "reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ratings_subject_user_id_created_at_idx" ON "ratings"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ratings_restaurant_id_created_at_idx" ON "ratings"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_active_idx" ON "device_tokens"("user_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_status_is_accepting_orders_idx" ON "restaurants"("status", "is_accepting_orders");

-- CreateIndex
CREATE INDEX "restaurant_users_user_id_idx" ON "restaurant_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_hours_restaurant_id_day_of_week_opens_at_key" ON "restaurant_hours"("restaurant_id", "day_of_week", "opens_at");

-- CreateIndex
CREATE INDEX "menu_categories_restaurant_id_active_sort_order_idx" ON "menu_categories"("restaurant_id", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_restaurant_id_name_key" ON "menu_categories"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_available_idx" ON "menu_items"("restaurant_id", "available");

-- CreateIndex
CREATE INDEX "menu_items_category_id_sort_order_idx" ON "menu_items"("category_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_reference_key" ON "food_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_fare_quote_id_key" ON "food_orders"("fare_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_payment_id_key" ON "food_orders"("payment_id");

-- CreateIndex
CREATE INDEX "food_orders_user_id_created_at_idx" ON "food_orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "food_orders_restaurant_id_status_created_at_idx" ON "food_orders"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "food_orders_status_idx" ON "food_orders"("status");

-- CreateIndex
CREATE INDEX "food_order_items_order_id_idx" ON "food_order_items"("order_id");

-- CreateIndex
CREATE INDEX "food_order_status_history_order_id_created_at_idx" ON "food_order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "food_deliveries_order_id_key" ON "food_deliveries"("order_id");

-- CreateIndex
CREATE INDEX "food_deliveries_driver_id_status_idx" ON "food_deliveries"("driver_id", "status");

-- CreateIndex
CREATE INDEX "food_deliveries_status_idx" ON "food_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_types_code_key" ON "parcel_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_orders_reference_key" ON "parcel_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_orders_fare_quote_id_key" ON "parcel_orders"("fare_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_orders_payment_id_key" ON "parcel_orders"("payment_id");

-- CreateIndex
CREATE INDEX "parcel_orders_user_id_created_at_idx" ON "parcel_orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "parcel_orders_status_idx" ON "parcel_orders"("status");

-- CreateIndex
CREATE INDEX "parcel_orders_driver_id_status_idx" ON "parcel_orders"("driver_id", "status");

-- CreateIndex
CREATE INDEX "parcel_tracking_parcel_order_id_created_at_idx" ON "parcel_tracking"("parcel_order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_user_id_created_at_idx" ON "support_tickets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_settings_category_idx" ON "admin_settings"("category");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_preferences" ADD CONSTRAINT "shared_ride_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle" ADD CONSTRAINT "driver_vehicle_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle" ADD CONSTRAINT "driver_vehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability" ADD CONSTRAINT "driver_availability_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability" ADD CONSTRAINT "driver_availability_active_vehicle_id_fkey" FOREIGN KEY ("active_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations_current" ADD CONSTRAINT "driver_locations_current_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_active_route_id_fkey" FOREIGN KEY ("active_route_id") REFERENCES "ride_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_fare_quote_id_fkey" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_ride_passenger_id_fkey" FOREIGN KEY ("ride_passenger_id") REFERENCES "ride_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_routes" ADD CONSTRAINT "ride_routes_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_match_requests" ADD CONSTRAINT "shared_ride_match_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_match_requests" ADD CONSTRAINT "shared_ride_match_requests_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_match_candidates" ADD CONSTRAINT "shared_ride_match_candidates_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "shared_ride_match_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_match_candidates" ADD CONSTRAINT "shared_ride_match_candidates_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_ride_match_candidates" ADD CONSTRAINT "shared_ride_match_candidates_fare_quote_id_fkey" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_ride_passenger_id_fkey" FOREIGN KEY ("ride_passenger_id") REFERENCES "ride_passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_food_order_id_fkey" FOREIGN KEY ("food_order_id") REFERENCES "food_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_parcel_order_id_fkey" FOREIGN KEY ("parcel_order_id") REFERENCES "parcel_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_fare_quote_id_fkey" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_commissions" ADD CONSTRAINT "platform_commissions_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "driver_earnings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_food_order_id_fkey" FOREIGN KEY ("food_order_id") REFERENCES "food_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_parcel_order_id_fkey" FOREIGN KEY ("parcel_order_id") REFERENCES "parcel_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_users" ADD CONSTRAINT "restaurant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_hours" ADD CONSTRAINT "restaurant_hours_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_fare_quote_id_fkey" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_order_status_history" ADD CONSTRAINT "food_order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_parcel_type_id_fkey" FOREIGN KEY ("parcel_type_id") REFERENCES "parcel_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_fare_quote_id_fkey" FOREIGN KEY ("fare_quote_id") REFERENCES "fare_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_orders" ADD CONSTRAINT "parcel_orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_tracking" ADD CONSTRAINT "parcel_tracking_parcel_order_id_fkey" FOREIGN KEY ("parcel_order_id") REFERENCES "parcel_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- HAND-WRITTEN EXTENSIONS TO THE PRISMA-GENERATED SCHEMA
--
-- Everything below expresses guarantees Prisma's schema language cannot:
--   1. spatial indexes for the shared-ride matching engine
--   2. financial and domain CHECK invariants
--   3. partial / conditional unique indexes that prevent overbooking and
--      double-dispatch
--   4. triggers that keep updated_at and stop ordering correct even when rows
--      are written through raw SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. SPATIAL INDEXES
--    The matching engine's candidate shortlist is driven by ST_DWithin against
--    ride_routes.geometry, so that index is the hot path.
-- ---------------------------------------------------------------------------
CREATE INDEX "ride_routes_geometry_gist" ON "ride_routes" USING GIST ("geometry");
CREATE INDEX "driver_locations_current_location_gist" ON "driver_locations_current" USING GIST ("location");
CREATE INDEX "ride_passengers_pickup_location_gist" ON "ride_passengers" USING GIST ("pickup_location");
CREATE INDEX "ride_passengers_dropoff_location_gist" ON "ride_passengers" USING GIST ("dropoff_location");
CREATE INDEX "shared_ride_match_requests_pickup_gist" ON "shared_ride_match_requests" USING GIST ("pickup_location");
CREATE INDEX "shared_ride_match_requests_dropoff_gist" ON "shared_ride_match_requests" USING GIST ("dropoff_location");
CREATE INDEX "restaurants_location_gist" ON "restaurants" USING GIST ("location");
CREATE INDEX "food_orders_delivery_location_gist" ON "food_orders" USING GIST ("delivery_location");
CREATE INDEX "parcel_orders_pickup_location_gist" ON "parcel_orders" USING GIST ("pickup_location");
CREATE INDEX "saved_places_location_gist" ON "saved_places" USING GIST ("location");
CREATE INDEX "ride_stops_location_gist" ON "ride_stops" USING GIST ("location");

-- Trigram index for restaurant search without a full table scan.
CREATE INDEX "restaurants_name_trgm" ON "restaurants" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "menu_items_name_trgm" ON "menu_items" USING GIN ("name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. COORDINATE SANITY
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION valid_lat(v numeric) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT v IS NULL OR (v >= -90 AND v <= 90) $$;
CREATE OR REPLACE FUNCTION valid_lng(v numeric) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT v IS NULL OR (v >= -180 AND v <= 180) $$;

ALTER TABLE "saved_places"               ADD CONSTRAINT "saved_places_coords_valid"        CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "driver_locations_current"   ADD CONSTRAINT "driver_loc_current_coords_valid"  CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "driver_location_history"    ADD CONSTRAINT "driver_loc_history_coords_valid"  CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "ride_stops"                 ADD CONSTRAINT "ride_stops_coords_valid"          CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "restaurants"                ADD CONSTRAINT "restaurants_coords_valid"         CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "parcel_tracking"            ADD CONSTRAINT "parcel_tracking_coords_valid"     CHECK (valid_lat("latitude") AND valid_lng("longitude"));
ALTER TABLE "ride_passengers"            ADD CONSTRAINT "ride_passengers_coords_valid"
  CHECK (valid_lat("pickup_latitude") AND valid_lng("pickup_longitude") AND valid_lat("dropoff_latitude") AND valid_lng("dropoff_longitude"));
ALTER TABLE "shared_ride_match_requests" ADD CONSTRAINT "match_requests_coords_valid"
  CHECK (valid_lat("pickup_latitude") AND valid_lng("pickup_longitude") AND valid_lat("dropoff_latitude") AND valid_lng("dropoff_longitude"));
ALTER TABLE "parcel_orders"              ADD CONSTRAINT "parcel_orders_coords_valid"
  CHECK (valid_lat("pickup_latitude") AND valid_lng("pickup_longitude") AND valid_lat("dropoff_latitude") AND valid_lng("dropoff_longitude"));
ALTER TABLE "food_orders"                ADD CONSTRAINT "food_orders_coords_valid"
  CHECK (valid_lat("delivery_latitude") AND valid_lng("delivery_longitude"));

-- ---------------------------------------------------------------------------
-- 3. CAPACITY INVARIANT — the backstop against overbooking a shared ride.
--    Seat allocation always happens inside a transaction that holds a row lock
--    on the rides row (SELECT ... FOR UPDATE). This CHECK guarantees that even
--    if that discipline is ever broken, the database refuses the write.
-- ---------------------------------------------------------------------------
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_total_positive"     CHECK ("seats_total" > 0);
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_within_capacity"    CHECK ("seats_occupied" >= 0 AND "seats_occupied" <= "seats_total");
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_seats_positive" CHECK ("seats_requested" > 0);
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_sequence_non_negative" CHECK ("sequence" >= 0);
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_capacity_sane"
  CHECK ("seat_capacity" > 0 AND "max_passengers" > 0 AND "max_passengers" <= "seat_capacity");
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_capacity_positive" CHECK ("seat_capacity" > 0);

-- ---------------------------------------------------------------------------
-- 4. FINANCIAL INVARIANTS
--    Passenger total and driver net are computed independently by the pricing
--    engine; these constraints assert that each side actually reconciles with
--    its own components, so a coding error cannot silently mis-pay a driver.
-- ---------------------------------------------------------------------------
ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_non_negative"
  CHECK ("gross_fare" >= 0 AND "discount_total" >= 0 AND "service_fee" >= 0 AND "tax_total" >= 0
     AND "passenger_total" >= 0 AND "driver_gross" >= 0 AND "platform_commission" >= 0 AND "driver_net" >= 0
     AND "distance_m" >= 0 AND "duration_s" >= 0 AND "surge_multiplier" > 0);

ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_passenger_total_reconciles"
  CHECK ("passenger_total" = "gross_fare" - "discount_total" + "service_fee" + "tax_total");

ALTER TABLE "fare_quotes" ADD CONSTRAINT "fare_quotes_driver_net_reconciles"
  CHECK ("driver_net" = "driver_gross" - "platform_commission" + "driver_stop_fees" + "driver_bonus");

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_net_reconciles"
  CHECK ("net_amount" = "gross_amount" - "commission_amount" + "stop_fee_amount" + "bonus_amount" + "adjustment_amount");
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_non_negative"
  CHECK ("gross_amount" >= 0 AND "commission_amount" >= 0 AND "net_amount" >= 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_bounded"
  CHECK ("refunded_amount" >= 0 AND "refunded_amount" <= "amount");
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_balance_non_negative" CHECK ("balance_after" >= 0);

ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_amounts_non_negative"
  CHECK ("base_fare" >= 0 AND "per_km_fare" >= 0 AND "per_minute_fare" >= 0 AND "minimum_fare" >= 0
     AND "booking_fee" >= 0 AND "waiting_per_minute_fee" >= 0 AND "cancellation_fee" >= 0
     AND "additional_stop_fee" >= 0 AND "minimum_driver_earning" >= 0 AND "free_waiting_minutes" >= 0);
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_percentages_bounded"
  CHECK ("shared_discount_pct" BETWEEN 0 AND 100 AND "max_passenger_discount_pct" BETWEEN 0 AND 100
     AND "service_fee_pct" BETWEEN 0 AND 100 AND "tax_pct" BETWEEN 0 AND 100
     AND "platform_commission_pct" BETWEEN 0 AND 100 AND "shared_passenger_driver_share_pct" BETWEEN 0 AND 100);

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_window_valid" CHECK ("valid_to" > "valid_from");
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_valid"
  CHECK ("value" > 0 AND ("type" <> 'PERCENT' OR "value" <= 100));
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_limits_valid"
  CHECK ("per_user_limit" > 0 AND ("usage_limit" IS NULL OR "usage_limit" > 0) AND "used_count" >= 0);

ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "food_order_items" ADD CONSTRAINT "food_order_items_line_total_reconciles"
  CHECK ("line_total" = "unit_price" * "quantity");
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_totals_non_negative"
  CHECK ("items_subtotal" >= 0 AND "delivery_fee" >= 0 AND "service_fee" >= 0 AND "discount_total" >= 0
     AND "tax_total" >= 0 AND "total" >= 0);
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_total_reconciles"
  CHECK ("total" = "items_subtotal" + "delivery_fee" + "service_fee" + "tax_total" - "discount_total");

ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "parcel_types" ADD CONSTRAINT "parcel_types_weight_positive" CHECK ("max_weight_kg" > 0);
ALTER TABLE "restaurant_hours" ADD CONSTRAINT "restaurant_hours_day_valid" CHECK ("day_of_week" BETWEEN 0 AND 6);
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 5);
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_single_subject"
  CHECK (num_nonnulls("ride_id", "food_order_id", "parcel_order_id") = 1);
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_commission_bounded" CHECK ("commission_pct" BETWEEN 0 AND 100);
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_rating_bounded" CHECK ("rating_average" BETWEEN 0 AND 5);

-- ---------------------------------------------------------------------------
-- 5. CONDITIONAL UNIQUENESS
-- ---------------------------------------------------------------------------

-- Soft-deleted users/vehicles must not block re-registration of the identifier.
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_phone_key";
DROP INDEX IF EXISTS "vehicles_plate_number_key";
CREATE UNIQUE INDEX "users_email_active_key" ON "users" ("email") WHERE "deleted_at" IS NULL AND "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_phone_active_key" ON "users" ("phone") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "vehicles_plate_active_key" ON "vehicles" ("plate_number") WHERE "deleted_at" IS NULL;

-- A driver may hold at most one live ride at a time. This is what stops a
-- second dispatch racing onto a driver already mid-trip.
CREATE UNIQUE INDEX "rides_one_active_per_driver"
  ON "rides" ("driver_id")
  WHERE "driver_id" IS NOT NULL
    AND "status" IN ('ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS');

-- A passenger may not hold two live legs on the same ride.
CREATE UNIQUE INDEX "ride_passengers_one_live_per_ride_user"
  ON "ride_passengers" ("ride_id", "user_id")
  WHERE "status" NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW');

-- A passenger can only be physically onboard one vehicle at a time.
CREATE UNIQUE INDEX "ride_passengers_one_onboard_per_user"
  ON "ride_passengers" ("user_id")
  WHERE "status" = 'ONBOARD';

-- Exactly one primary vehicle per driver.
CREATE UNIQUE INDEX "driver_vehicle_one_primary"
  ON "driver_vehicle" ("driver_id")
  WHERE "is_primary" AND "removed_at" IS NULL;

-- Exactly one open pricing rule per (service type, vehicle type). NULLS NOT
-- DISTINCT so the vehicle-type-agnostic rule is also singular.
CREATE UNIQUE INDEX "pricing_rules_one_active"
  ON "pricing_rules" ("service_type", "vehicle_type_id") NULLS NOT DISTINCT
  WHERE "active" AND "effective_to" IS NULL;

-- A driver has at most one unfinished parcel assignment.
CREATE UNIQUE INDEX "parcel_orders_one_active_per_driver"
  ON "parcel_orders" ("driver_id")
  WHERE "driver_id" IS NOT NULL
    AND "status" IN ('ASSIGNED', 'HEADING_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT');

-- ---------------------------------------------------------------------------
-- 6. SUPPORTING INDEXES FOR HOT QUERIES
-- ---------------------------------------------------------------------------

-- Shared-ride candidate shortlist: joinable rides with a free seat.
CREATE INDEX "rides_shared_candidates"
  ON "rides" ("vehicle_type_id", "scheduled_pickup_at")
  WHERE "joinable" AND "ride_type" = 'SHARED'
    AND "status" IN ('SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS');

-- Driver earnings aggregation by period.
CREATE INDEX "driver_earnings_period" ON "driver_earnings" ("driver_id", "created_at" DESC, "status");

-- Unread notification badge.
CREATE INDEX "notifications_unread" ON "notifications" ("user_id", "created_at" DESC) WHERE "read_at" IS NULL;

-- Online drivers available for dispatch.
CREATE INDEX "driver_availability_dispatchable"
  ON "driver_availability" ("presence", "accepts_shared", "accepts_food", "accepts_parcel")
  WHERE "presence" = 'ONLINE';

-- ---------------------------------------------------------------------------
-- 7. updated_at MAINTENANCE
--    Prisma's @updatedAt only applies to writes made through Prisma Client.
--    The matching and dispatch paths use raw SQL, so the database maintains it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t || '_touch_updated_at', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. STOP-ORDER INVARIANT
--    A passenger must always be collected before they are dropped off. The
--    optimiser is responsible for producing a valid order; this deferred
--    constraint makes an invalid order impossible to commit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_stop_order() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  offending uuid;
BEGIN
  SELECT p.ride_passenger_id INTO offending
  FROM (
    SELECT s.ride_passenger_id,
           max(s.sequence) FILTER (WHERE s.type = 'PICKUP')  AS pickup_seq,
           max(s.sequence) FILTER (WHERE s.type = 'DROPOFF') AS dropoff_seq
    FROM ride_stops s
    WHERE s.ride_passenger_id IS NOT NULL
      AND s.status <> 'SKIPPED'
    GROUP BY s.ride_passenger_id
  ) p
  WHERE p.pickup_seq IS NOT NULL
    AND p.dropoff_seq IS NOT NULL
    AND p.pickup_seq >= p.dropoff_seq
  LIMIT 1;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'stop order invalid: passenger % is dropped off before pickup', offending
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ride_stops_order_check
  AFTER INSERT OR UPDATE ON "ride_stops"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_stop_order();

-- ---------------------------------------------------------------------------
-- 9. LOCATION HISTORY RETENTION
--    GPS breadcrumbs are bounded; the scheduled pruner calls this.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_driver_location_history(retain_days integer)
RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  removed bigint;
BEGIN
  DELETE FROM driver_location_history
  WHERE recorded_at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

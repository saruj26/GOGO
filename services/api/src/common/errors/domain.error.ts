import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable failure codes. Clients switch on `code`; `message` is the
 * user-facing string. Neither ever carries a stack trace, a SQL fragment or a
 * provider response.
 */
export enum DomainErrorCode {
  // ride & dispatch
  NO_DRIVERS_AVAILABLE = 'NO_DRIVERS_AVAILABLE',
  NO_SHARED_RIDES_AVAILABLE = 'NO_SHARED_RIDES_AVAILABLE',
  RIDE_NOT_JOINABLE = 'RIDE_NOT_JOINABLE',
  SEATS_UNAVAILABLE = 'SEATS_UNAVAILABLE',
  GENDER_PREFERENCE_CONFLICT = 'GENDER_PREFERENCE_CONFLICT',
  ROUTE_NOT_COMPATIBLE = 'ROUTE_NOT_COMPATIBLE',
  DETOUR_EXCEEDED = 'DETOUR_EXCEEDED',
  TIME_INCOMPATIBLE = 'TIME_INCOMPATIBLE',
  INVALID_RIDE_STATE = 'INVALID_RIDE_STATE',
  DRIVER_UNAVAILABLE = 'DRIVER_UNAVAILABLE',
  QUOTE_EXPIRED = 'QUOTE_EXPIRED',
  CANCELLATION_NOT_ALLOWED = 'CANCELLATION_NOT_ALLOWED',

  // routing & maps
  ROUTING_PROVIDER_UNAVAILABLE = 'ROUTING_PROVIDER_UNAVAILABLE',
  LOCATION_UNAVAILABLE = 'LOCATION_UNAVAILABLE',

  // pricing & payments
  PRICING_RULE_MISSING = 'PRICING_RULE_MISSING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  INSUFFICIENT_WALLET_BALANCE = 'INSUFFICIENT_WALLET_BALANCE',
  PROMOTION_INVALID = 'PROMOTION_INVALID',

  // food & parcel
  RESTAURANT_UNAVAILABLE = 'RESTAURANT_UNAVAILABLE',
  MENU_ITEM_UNAVAILABLE = 'MENU_ITEM_UNAVAILABLE',
  ORDER_NOT_MODIFIABLE = 'ORDER_NOT_MODIFIABLE',
  PARCEL_VEHICLE_UNAVAILABLE = 'PARCEL_VEHICLE_UNAVAILABLE',

  // access
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
}

export class DomainError extends HttpException {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity: string): DomainError {
    return new DomainError(
      DomainErrorCode.NOT_FOUND,
      `${entity} not found`,
      HttpStatus.NOT_FOUND,
    );
  }

  static forbidden(message = 'You do not have access to this resource'): DomainError {
    return new DomainError(DomainErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: DomainErrorCode, message: string): DomainError {
    return new DomainError(code, message, HttpStatus.CONFLICT);
  }
}

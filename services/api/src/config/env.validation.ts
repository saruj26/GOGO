import { Type, plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum MapProvider {
  Google = 'google',
  Osrm = 'osrm',
  /// Deterministic great-circle estimator. Development and tests only — it is
  /// explicitly rejected when NODE_ENV=production.
  Haversine = 'haversine',
}

/**
 * Fail-fast validation of process configuration. The application refuses to
 * boot on a missing or malformed variable rather than failing later at the
 * first request that needs it.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 4000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  DIRECT_DATABASE_URL?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '30d';

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsEnum(MapProvider)
  MAP_PROVIDER: MapProvider = MapProvider.Haversine;

  @IsString()
  @IsOptional()
  MAP_API_KEY?: string;

  @IsString()
  @IsOptional()
  OSRM_BASE_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  // Absent means the "Continue with Google" button stays hidden — no client
  // ID means no working OAuth flow, and a hidden button beats a broken one.
  @IsString()
  @IsOptional()
  GOOGLE_OAUTH_CLIENT_ID?: string;

  // --- push notifications -------------------------------------------------
  // Absent means push is off: notifications are still recorded and delivered
  // in-app and over the realtime socket, but nothing reaches a closed app.

  @IsString()
  @IsOptional()
  PUSH_PROVIDER?: string;

  /** A Firebase service-account JSON document. Never logged or returned. */
  @IsString()
  @IsOptional()
  PUSH_FCM_SERVICE_ACCOUNT?: string;

  // --- payments -----------------------------------------------------------
  // Absent means online card payment is unavailable and the backend refuses
  // the method outright rather than accepting a charge it cannot take.

  @IsString()
  @IsOptional()
  PAYMENT_PROVIDER?: string;

  @IsString()
  @IsOptional()
  PAYMENT_API_KEY?: string;

  @IsString()
  @IsOptional()
  PAYMENT_SECRET?: string;

  /** Verifies that an incoming webhook really came from the provider. */
  @IsString()
  @IsOptional()
  PAYMENT_WEBHOOK_SECRET?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    // Only property names and constraint messages are surfaced — never values,
    // so a malformed DATABASE_URL cannot leak credentials into the logs.
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${detail}`);
  }

  if (config.NODE_ENV === NodeEnv.Production) {
    if (config.MAP_PROVIDER === MapProvider.Haversine) {
      throw new Error(
        'MAP_PROVIDER=haversine is a development estimator and must not be used in production',
      );
    }
    if (config.MAP_PROVIDER === MapProvider.Google && !config.MAP_API_KEY) {
      throw new Error('MAP_API_KEY is required when MAP_PROVIDER=google');
    }
    if (config.MAP_PROVIDER === MapProvider.Osrm && !config.OSRM_BASE_URL) {
      throw new Error('OSRM_BASE_URL is required when MAP_PROVIDER=osrm');
    }

    // A payment provider that is named but not fully configured is worse than
    // none: it would look available and fail at the moment of payment.
    if (config.PAYMENT_PROVIDER && config.PAYMENT_PROVIDER !== 'none') {
      if (!config.PAYMENT_API_KEY || !config.PAYMENT_SECRET) {
        throw new Error(
          'PAYMENT_API_KEY and PAYMENT_SECRET are required when PAYMENT_PROVIDER is set',
        );
      }
      if (!config.PAYMENT_WEBHOOK_SECRET) {
        throw new Error(
          'PAYMENT_WEBHOOK_SECRET is required when PAYMENT_PROVIDER is set: without it a webhook cannot be verified and anyone could mark a payment paid',
        );
      }
    }

    if (config.PUSH_PROVIDER === 'fcm' && !config.PUSH_FCM_SERVICE_ACCOUNT) {
      throw new Error('PUSH_FCM_SERVICE_ACCOUNT is required when PUSH_PROVIDER=fcm');
    }
  }

  return config;
}

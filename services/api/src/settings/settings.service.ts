import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, SettingValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import {
  SETTING_DEFINITIONS,
  SETTING_DEFINITION_BY_KEY,
  SETTING_KEYS,
  ScoreWeights,
  SettingKey,
} from './settings.registry';

/** The complete, typed set of rules a single matching run is evaluated against. */
export interface MatchingSettings {
  pickupCorridorRadiusM: number;
  dropoffCorridorRadiusM: number;
  minRouteOverlapPct: number;
  maxBearingDifferenceDeg: number;
  driverSearchRadiusM: number;
  maxDetourDistancePct: number;
  maxDetourDistanceM: number;
  maxDetourDurationS: number;
  maxExistingPassengerDelayS: number;
  pickupToleranceEarlyS: number;
  pickupToleranceLateS: number;
  maxPickupWaitS: number;
  maxCandidates: number;
  scoreWeights: ScoreWeights;
  requestTtlS: number;
  enforceGenderPreferences: boolean;
  requireMutualGenderConsent: boolean;
  applyGenderPreferenceToDriver: boolean;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Settings change rarely and are read on every matching run, so they are
   * cached briefly. The TTL bounds how long a stale value can survive after an
   * admin edit on another instance; edits made through this instance clear the
   * entry immediately.
   */
  private static readonly CACHE_TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  /**
   * Inserts any registry entry the database does not yet have. Existing rows
   * are left untouched so an administrator's edits are never reverted by a
   * deploy.
   */
  async ensureDefaults(): Promise<number> {
    const existing = await this.prisma.adminSetting.findMany({ select: { key: true } });
    const known = new Set(existing.map((r) => r.key));
    const missing = SETTING_DEFINITIONS.filter((d) => !known.has(d.key));

    if (missing.length === 0) {
      return 0;
    }

    await this.prisma.adminSetting.createMany({
      data: missing.map((d) => ({
        key: d.key,
        value: d.defaultValue as Prisma.InputJsonValue,
        valueType: d.valueType,
        category: d.category,
        label: d.label,
        description: d.description,
        minValue: d.min ?? null,
        maxValue: d.max ?? null,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Seeded ${missing.length} default admin setting(s)`);
    return missing.length;
  }

  async getRaw<T>(key: SettingKey): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const row = await this.prisma.adminSetting.findUnique({ where: { key } });
    const value = row ? row.value : SETTING_DEFINITION_BY_KEY.get(key)?.defaultValue;

    if (value === undefined) {
      throw new Error(`Unknown admin setting: ${key}`);
    }

    this.cache.set(key, { value, expiresAt: Date.now() + SettingsService.CACHE_TTL_MS });
    return value as T;
  }

  async getNumber(key: SettingKey): Promise<number> {
    const value = await this.getRaw<unknown>(key);
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`Admin setting ${key} is not numeric`);
    }
    return n;
  }

  async getBoolean(key: SettingKey): Promise<boolean> {
    return Boolean(await this.getRaw<unknown>(key));
  }

  async getString(key: SettingKey): Promise<string> {
    return String(await this.getRaw<unknown>(key));
  }

  /**
   * Loads every matching rule in one pass. The result is snapshotted onto the
   * match request so a later settings change cannot make a past decision
   * unexplainable.
   */
  async getMatchingSettings(): Promise<MatchingSettings> {
    const [
      pickupCorridorRadiusM,
      dropoffCorridorRadiusM,
      minRouteOverlapPct,
      maxBearingDifferenceDeg,
      driverSearchRadiusM,
      maxDetourDistancePct,
      maxDetourDistanceM,
      maxDetourDurationS,
      maxExistingPassengerDelayS,
      pickupToleranceEarlyS,
      pickupToleranceLateS,
      maxPickupWaitS,
      maxCandidates,
      requestTtlS,
      scoreWeights,
      enforceGenderPreferences,
      requireMutualGenderConsent,
      applyGenderPreferenceToDriver,
    ] = await Promise.all([
      this.getNumber(SETTING_KEYS.PICKUP_CORRIDOR_RADIUS_M),
      this.getNumber(SETTING_KEYS.DROPOFF_CORRIDOR_RADIUS_M),
      this.getNumber(SETTING_KEYS.MIN_ROUTE_OVERLAP_PCT),
      this.getNumber(SETTING_KEYS.MAX_BEARING_DIFFERENCE_DEG),
      this.getNumber(SETTING_KEYS.DRIVER_SEARCH_RADIUS_M),
      this.getNumber(SETTING_KEYS.MAX_DETOUR_DISTANCE_PCT),
      this.getNumber(SETTING_KEYS.MAX_DETOUR_DISTANCE_M),
      this.getNumber(SETTING_KEYS.MAX_DETOUR_DURATION_S),
      this.getNumber(SETTING_KEYS.MAX_EXISTING_PASSENGER_DELAY_S),
      this.getNumber(SETTING_KEYS.PICKUP_TOLERANCE_EARLY_S),
      this.getNumber(SETTING_KEYS.PICKUP_TOLERANCE_LATE_S),
      this.getNumber(SETTING_KEYS.MAX_PICKUP_WAIT_S),
      this.getNumber(SETTING_KEYS.MAX_CANDIDATES),
      this.getNumber(SETTING_KEYS.REQUEST_TTL_S),
      this.getRaw<ScoreWeights>(SETTING_KEYS.SCORE_WEIGHTS),
      this.getBoolean(SETTING_KEYS.ENFORCE_GENDER_PREFERENCES),
      this.getBoolean(SETTING_KEYS.REQUIRE_MUTUAL_GENDER_CONSENT),
      this.getBoolean(SETTING_KEYS.APPLY_GENDER_PREFERENCE_TO_DRIVER),
    ]);

    return {
      pickupCorridorRadiusM,
      dropoffCorridorRadiusM,
      minRouteOverlapPct,
      maxBearingDifferenceDeg,
      driverSearchRadiusM,
      maxDetourDistancePct,
      maxDetourDistanceM,
      maxDetourDurationS,
      maxExistingPassengerDelayS,
      pickupToleranceEarlyS,
      pickupToleranceLateS,
      maxPickupWaitS,
      maxCandidates,
      requestTtlS,
      scoreWeights,
      enforceGenderPreferences,
      requireMutualGenderConsent,
      applyGenderPreferenceToDriver,
    };
  }

  async list(category?: string) {
    return this.prisma.adminSetting.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  /**
   * Updates a setting, validating against the registry's declared bounds. The
   * previous value is returned so the caller can write an audit record.
   */
  async update(
    key: string,
    value: unknown,
    actorUserId: string,
  ): Promise<{ previous: unknown; current: unknown }> {
    const definition = SETTING_DEFINITION_BY_KEY.get(key);
    if (!definition) {
      throw DomainError.notFound(`Setting "${key}"`);
    }

    this.assertValid(definition.valueType, value, definition.min, definition.max, key);

    const existing = await this.prisma.adminSetting.findUnique({ where: { key } });

    const updated = await this.prisma.adminSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        valueType: definition.valueType,
        category: definition.category,
        label: definition.label,
        description: definition.description,
        minValue: definition.min ?? null,
        maxValue: definition.max ?? null,
        updatedByUserId: actorUserId,
      },
      update: { value: value as Prisma.InputJsonValue, updatedByUserId: actorUserId },
    });

    this.cache.delete(key);
    return { previous: existing?.value ?? definition.defaultValue, current: updated.value };
  }

  private assertValid(
    type: SettingValueType,
    value: unknown,
    min: number | undefined,
    max: number | undefined,
    key: string,
  ): void {
    const fail = (message: string): never => {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, message);
    };

    switch (type) {
      case SettingValueType.NUMBER: {
        const n = Number(value);
        if (!Number.isFinite(n)) fail(`${key} must be a number`);
        if (min !== undefined && n < min) fail(`${key} must be at least ${min}`);
        if (max !== undefined && n > max) fail(`${key} must be at most ${max}`);
        break;
      }
      case SettingValueType.BOOLEAN:
        if (typeof value !== 'boolean') fail(`${key} must be true or false`);
        break;
      case SettingValueType.STRING:
        if (typeof value !== 'string' || value.length === 0) fail(`${key} must be a non-empty string`);
        break;
      case SettingValueType.JSON:
        if (value === null || typeof value !== 'object') fail(`${key} must be a JSON object`);
        break;
    }
  }

  /** Test seam: clears memoised values so a test can change settings mid-run. */
  clearCache(): void {
    this.cache.clear();
  }
}

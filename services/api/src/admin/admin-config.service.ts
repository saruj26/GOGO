import { Injectable } from '@nestjs/common';
import { Prisma, RoleCode, ServiceType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OffsetPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_DEFINITIONS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import {
  AdminAuditLogListDto, AdminListDto, CreatePromotionDto,
  UpdatePricingRuleDto, UpdatePromotionDto,
} from './dto/admin.dto';

// A dozen round trips to a managed database in another region routinely
// exceed Prisma's 5-second default; see rides.service.ts's TRANSACTION_OPTIONS.
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/**
 * Configuration: pricing, promotions, platform settings and the audit trail.
 *
 * The recurring principle is that the platform owns anything that could be
 * abused. A promotion's redemption counter is not writable. A pricing change
 * supersedes a rule rather than editing it, so a historical fare can always be
 * recomputed from the version that produced it.
 */
@Injectable()
export class AdminConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- pricing

  async pricingRules() {
    const rules = await this.prisma.pricingRule.findMany({
      where: { active: true, effectiveTo: null },
      orderBy: [{ serviceType: 'asc' }, { vehicleTypeId: 'asc' }],
      include: { vehicleType: { select: { code: true, name: true, sortOrder: true } } },
    });

    return rules.map((rule) => ({
      id: rule.id,
      serviceType: rule.serviceType,
      vehicleType: rule.vehicleType
        ? { id: rule.vehicleTypeId, code: rule.vehicleType.code, name: rule.vehicleType.name }
        : null,
      version: rule.version,
      currency: rule.currency,
      effectiveFrom: rule.effectiveFrom,
      passenger: {
        baseFare: rule.baseFare.toFixed(2),
        perKmFare: rule.perKmFare.toFixed(2),
        perMinuteFare: rule.perMinuteFare.toFixed(2),
        minimumFare: rule.minimumFare.toFixed(2),
        bookingFee: rule.bookingFee.toFixed(2),
        waitingPerMinuteFee: rule.waitingPerMinuteFee.toFixed(2),
        freeWaitingMinutes: rule.freeWaitingMinutes,
        sharedDiscountPct: rule.sharedDiscountPct.toFixed(2),
        maxPassengerDiscountPct: rule.maxPassengerDiscountPct.toFixed(2),
        serviceFeePct: rule.serviceFeePct.toFixed(2),
        taxPct: rule.taxPct.toFixed(2),
        cancellationFee: rule.cancellationFee.toFixed(2),
        freeCancellationSeconds: rule.freeCancellationSeconds,
      },
      driver: {
        platformCommissionPct: rule.platformCommissionPct.toFixed(2),
        sharedPassengerDriverSharePct: rule.sharedPassengerDriverSharePct.toFixed(2),
        additionalStopFee: rule.additionalStopFee.toFixed(2),
        minimumDriverEarning: rule.minimumDriverEarning.toFixed(2),
      },
    }));
  }

  /**
   * Changes pricing by superseding the current rule with a new version.
   *
   * The old row is closed rather than edited, so every historical `fare_quotes`
   * row still points at the exact numbers that produced it. The two writes
   * happen in one transaction because `pricing_rules_one_active` permits exactly
   * one open rule per service and vehicle class.
   */
  async updatePricingRule(ruleId: string, dto: UpdatePricingRuleDto, actorUserId: string) {
    const current = await this.prisma.pricingRule.findFirst({
      where: { id: ruleId, active: true, effectiveTo: null },
    });

    if (!current) {
      throw DomainError.notFound('Pricing rule');
    }

    if (Object.keys(dto).length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Nothing to change.');
    }

    const next = await this.prisma.$transaction(async (tx) => {
      await tx.pricingRule.update({
        where: { id: ruleId },
        data: { active: false, effectiveTo: new Date() },
      });

      return tx.pricingRule.create({
        data: {
          serviceType: current.serviceType,
          vehicleTypeId: current.vehicleTypeId,
          version: current.version + 1,
          active: true,
          currency: current.currency,
          baseFare: dto.baseFare ?? current.baseFare,
          perKmFare: dto.perKmFare ?? current.perKmFare,
          perMinuteFare: dto.perMinuteFare ?? current.perMinuteFare,
          minimumFare: dto.minimumFare ?? current.minimumFare,
          bookingFee: dto.bookingFee ?? current.bookingFee,
          waitingPerMinuteFee: dto.waitingPerMinuteFee ?? current.waitingPerMinuteFee,
          freeWaitingMinutes: dto.freeWaitingMinutes ?? current.freeWaitingMinutes,
          sharedDiscountPct: dto.sharedDiscountPct ?? current.sharedDiscountPct,
          maxPassengerDiscountPct: dto.maxPassengerDiscountPct ?? current.maxPassengerDiscountPct,
          serviceFeePct: dto.serviceFeePct ?? current.serviceFeePct,
          taxPct: dto.taxPct ?? current.taxPct,
          cancellationFee: dto.cancellationFee ?? current.cancellationFee,
          freeCancellationSeconds:
            dto.freeCancellationSeconds ?? current.freeCancellationSeconds,
          platformCommissionPct: dto.platformCommissionPct ?? current.platformCommissionPct,
          sharedPassengerDriverSharePct:
            dto.sharedPassengerDriverSharePct ?? current.sharedPassengerDriverSharePct,
          additionalStopFee: dto.additionalStopFee ?? current.additionalStopFee,
          minimumDriverEarning: dto.minimumDriverEarning ?? current.minimumDriverEarning,
          createdByUserId: actorUserId,
        },
        select: { id: true, version: true, serviceType: true, vehicleTypeId: true },
      });
    }, TRANSACTION_OPTIONS);

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.pricing.update',
      entityType: 'PricingRule',
      entityId: next.id,
      previousState: { ruleId, version: current.version },
      newState: { ruleId: next.id, version: next.version, changes: dto },
    });

    return next;
  }

  // ---------------------------------------------------------- promotions

  async promotions(dto: AdminListDto): Promise<OffsetPage<unknown>> {
    const where: Prisma.PromotionWhereInput = dto.q
      ? {
          OR: [
            { code: { contains: dto.q.toUpperCase() } },
            { name: { contains: dto.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: [{ active: 'desc' }, { validTo: 'desc' }],
        select: {
          id: true, code: true, name: true, description: true, type: true, value: true,
          maxDiscount: true, minOrderAmount: true, serviceTypes: true, usageLimit: true,
          perUserLimit: true, usedCount: true, validFrom: true, validTo: true, active: true,
          _count: { select: { redemptions: true } },
        },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      items: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        type: p.type,
        value: p.value.toFixed(2),
        maxDiscount: p.maxDiscount?.toFixed(2) ?? null,
        minOrderAmount: p.minOrderAmount.toFixed(2),
        appliesTo: p.serviceTypes.length > 0 ? p.serviceTypes : null,
        usage: {
          used: p.usedCount,
          limit: p.usageLimit,
          perUserLimit: p.perUserLimit,
          redemptions: p._count.redemptions,
        },
        validFrom: p.validFrom,
        validTo: p.validTo,
        active: p.active,
      })),
      total,
      page: dto.page,
      limit: dto.limit,
      totalPages: Math.max(1, Math.ceil(total / dto.limit)),
    };
  }

  async createPromotion(dto: CreatePromotionDto, actorUserId: string) {
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);

    if (validTo <= validFrom) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The end date must be after the start.');
    }

    if (dto.type === 'PERCENT' && dto.value > 100) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A percentage discount cannot exceed 100.',
      );
    }

    try {
      const promotion = await this.prisma.promotion.create({
        data: {
          code: dto.code.toUpperCase(),
          name: dto.name,
          description: dto.description,
          type: dto.type,
          value: dto.value,
          maxDiscount: dto.maxDiscount,
          minOrderAmount: dto.minOrderAmount ?? 0,
          serviceTypes: dto.serviceTypes ?? [],
          usageLimit: dto.usageLimit,
          perUserLimit: dto.perUserLimit ?? 1,
          validFrom,
          validTo,
          active: true,
          // `usedCount` is not settable: it starts at zero and only the
          // redemption path moves it.
        },
        select: { id: true, code: true },
      });

      await this.audit.record({
        actorUserId,
        actorRole: RoleCode.ADMIN,
        action: 'admin.promotion.create',
        entityType: 'Promotion',
        entityId: promotion.id,
        newState: { ...dto, code: promotion.code },
      });

      return promotion;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          `A promotion with the code ${dto.code.toUpperCase()} already exists.`,
        );
      }
      throw error;
    }
  }

  async updatePromotion(promotionId: string, dto: UpdatePromotionDto, actorUserId: string) {
    const existing = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { active: true, usageLimit: true, usedCount: true, validTo: true },
    });
    if (!existing) throw DomainError.notFound('Promotion');

    if (dto.usageLimit !== undefined && dto.usageLimit < existing.usedCount) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `This promotion has already been used ${existing.usedCount} times; the limit cannot be lower.`,
      );
    }

    const updated = await this.prisma.promotion.update({
      where: { id: promotionId },
      data: {
        name: dto.name,
        description: dto.description,
        active: dto.active,
        usageLimit: dto.usageLimit,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
      select: { id: true, code: true, active: true },
    });

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.promotion.update',
      entityType: 'Promotion',
      entityId: promotionId,
      previousState: existing,
      newState: dto as Record<string, unknown>,
    });

    return updated;
  }

  // ------------------------------------------------------------ settings

  /** Every runtime rule, with the bounds the UI should enforce. */
  async platformSettings(category?: string) {
    const rows = await this.settings.list(category);
    const definitions = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      valueType: row.valueType,
      category: row.category,
      label: row.label,
      description: row.description,
      min: row.minValue === null ? null : Number(row.minValue),
      max: row.maxValue === null ? null : Number(row.maxValue),
      defaultValue: definitions.get(row.key)?.defaultValue ?? null,
      updatedAt: row.updatedAt,
    }));
  }

  async updateSetting(key: string, value: unknown, actorUserId: string) {
    const { previous, current } = await this.settings.update(key, value, actorUserId);

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'admin.setting.update',
      entityType: 'AdminSetting',
      entityId: key,
      previousState: { value: previous },
      newState: { value: current },
    });

    return { key, value: current };
  }

  // ---------------------------------------------------------- audit logs

  /**
   * The audit trail.
   *
   * Records are returned as written. They contain business state — statuses,
   * amounts, identifiers — and never a credential, a token or a password,
   * because nothing of that kind is ever passed to the audit service.
   */
  async auditLogs(dto: AdminAuditLogListDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(dto.action ? { action: { contains: dto.action } } : {}),
      ...(dto.entityType ? { entityType: dto.entityType } : {}),
      ...(dto.from || dto.to
        ? {
            createdAt: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
      ...(dto.q ? { entityId: { contains: dto.q } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, action: true, entityType: true, entityId: true,
          actorRole: true, previousState: true, newState: true, metadata: true,
          ipAddress: true, createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.actor
          ? {
              id: row.actor.id,
              name: [row.actor.firstName, row.actor.lastName].filter(Boolean).join(' '),
              role: row.actorRole,
            }
          : { id: null, name: 'System', role: row.actorRole },
        previousState: row.previousState,
        newState: row.newState,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        at: row.createdAt,
      })),
      total,
      page: dto.page,
      limit: dto.limit,
      totalPages: Math.max(1, Math.ceil(total / dto.limit)),
    };
  }

  /** Distinct action names, so the log filter can be a list rather than free text. */
  async auditActions() {
    const rows = await this.prisma.auditLog.groupBy({
      by: ['action'],
      _count: true,
      orderBy: { action: 'asc' },
    });

    return rows.map((row) => ({ action: row.action, count: row._count }));
  }

  /** Vehicle classes, for the pricing screen. */
  async vehicleTypes() {
    const types = await this.prisma.vehicleType.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, code: true, name: true, seatCapacity: true, maxPassengers: true,
        sharedRideEligible: true, parcelEligible: true, foodDeliveryEligible: true,
        maxParcelWeightKg: true, active: true, sortOrder: true,
        _count: { select: { vehicles: true } },
      },
    });

    return types.map((t) => ({
      ...t,
      maxParcelWeightKg: t.maxParcelWeightKg?.toFixed(2) ?? null,
      vehicles: t._count.vehicles,
    }));
  }
}

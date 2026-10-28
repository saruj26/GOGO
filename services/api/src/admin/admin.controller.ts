import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DriverApprovalStatus, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminConfigService } from './admin-config.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminOperationsService } from './admin-operations.service';
import {
  AdminAuditLogListDto, AdminDriverListDto, AdminFoodOrderListDto, AdminListDto,
  AdminParcelListDto, AdminPaymentListDto, AdminRideListDto, AdminUserListDto,
  CreatePromotionDto, DriverDecisionDto, SetRestaurantStatusDto, SetUserStatusDto,
  UpdatePricingRuleDto, UpdatePromotionDto, UpdateSettingDto,
} from './dto/admin.dto';

/**
 * The administration surface.
 *
 * `@Roles(ADMIN)` gates the whole controller, and the guard reads the caller's
 * roles from the database on every request rather than trusting the token — so
 * revoking somebody's admin role takes effect immediately, not whenever their
 * access token happens to expire.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleCode.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly operations: AdminOperationsService,
    private readonly config: AdminConfigService,
  ) {}

  // ----------------------------------------------------------- dashboard

  @Get('metrics/dashboard')
  @ApiOperation({ summary: 'Live operational figures, aggregated from real rows' })
  dashboard() {
    return this.metrics.dashboard();
  }

  @Get('metrics/revenue-by-service')
  @ApiOperation({ summary: 'Commission and volume per service line' })
  revenueByService(@Query('from') from?: string, @Query('to') to?: string) {
    return this.metrics.revenueByService(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('metrics/revenue-trend')
  @ApiOperation({ summary: 'Daily commission for the last N days' })
  revenueTrend(@Query('days') days?: string) {
    return this.metrics.revenueTrend(days ? Number(days) : 14);
  }

  // --------------------------------------------------------------- users

  @Get('users')
  @ApiOperation({ summary: 'Customers and staff' })
  users(@Query() dto: AdminUserListDto) {
    return this.operations.users(dto);
  }

  @Put('users/:userId/status')
  @ApiOperation({
    summary: 'Suspend or reactivate an account',
    description: 'Suspending also revokes every active session immediately.',
  })
  setUserStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.operations.setUserStatus(userId, dto, admin.id);
  }

  // ------------------------------------------------------------- drivers

  @Get('drivers')
  @ApiOperation({ summary: 'Drivers, with approval state and vehicles' })
  drivers(@Query() dto: AdminDriverListDto) {
    return this.operations.drivers(dto);
  }

  @Post('drivers/:driverId/approve')
  @ApiOperation({ summary: 'Approve a driver' })
  approveDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: DriverDecisionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.operations.decideDriver(driverId, DriverApprovalStatus.APPROVED, dto, admin.id);
  }

  @Post('drivers/:driverId/reject')
  @ApiOperation({ summary: 'Reject an application. A reason is required.' })
  rejectDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: DriverDecisionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.operations.decideDriver(driverId, DriverApprovalStatus.REJECTED, dto, admin.id);
  }

  @Post('drivers/:driverId/suspend')
  @ApiOperation({
    summary: 'Suspend a driver',
    description: 'Takes them offline in the same transaction so no further work is dispatched.',
  })
  suspendDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: DriverDecisionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.operations.decideDriver(driverId, DriverApprovalStatus.SUSPENDED, dto, admin.id);
  }

  @Get('vehicle-types')
  @ApiOperation({ summary: 'Vehicle classes and their capabilities' })
  vehicleTypes() {
    return this.config.vehicleTypes();
  }

  // --------------------------------------------------------------- rides

  @Get('rides')
  @ApiOperation({ summary: 'Rides, solo and shared' })
  rides(@Query() dto: AdminRideListDto) {
    return this.operations.rides(dto);
  }

  @Get('rides/:rideId')
  @ApiOperation({
    summary: 'One ride in full',
    description:
      'Includes passengers, stops, money per passenger and a summary of how shared matching went. Individual candidate scores are not exposed.',
  })
  ride(@Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.operations.ride(rideId);
  }

  // ---------------------------------------------------------------- food

  @Get('restaurants')
  @ApiOperation({ summary: 'Restaurants on the platform' })
  restaurants(@Query() dto: AdminListDto) {
    return this.operations.restaurants(dto);
  }

  @Put('restaurants/:restaurantId/status')
  @ApiOperation({ summary: 'Approve, suspend or close a restaurant' })
  setRestaurantStatus(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() dto: SetRestaurantStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.operations.setRestaurantStatus(restaurantId, dto, admin.id);
  }

  @Get('food-orders')
  @ApiOperation({ summary: 'Food orders, with the restaurant split' })
  foodOrders(@Query() dto: AdminFoodOrderListDto) {
    return this.operations.foodOrders(dto);
  }

  // -------------------------------------------------------------- parcel

  @Get('parcels')
  @ApiOperation({ summary: 'Parcel deliveries' })
  parcels(@Query() dto: AdminParcelListDto) {
    return this.operations.parcels(dto);
  }

  // ------------------------------------------------------------ payments

  @Get('payments')
  @ApiOperation({ summary: 'Payments, with charged and refunded totals' })
  payments(@Query() dto: AdminPaymentListDto) {
    return this.operations.payments(dto);
  }

  // ------------------------------------------------------------- pricing

  @Get('pricing-rules')
  @ApiOperation({ summary: 'The pricing rules currently in force' })
  pricingRules() {
    return this.config.pricingRules();
  }

  @Put('pricing-rules/:ruleId')
  @ApiOperation({
    summary: 'Change pricing',
    description:
      'Supersedes the rule with a new version rather than editing it, so every historical fare can still be recomputed from the version that produced it.',
  })
  updatePricingRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdatePricingRuleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.config.updatePricingRule(ruleId, dto, admin.id);
  }

  // ---------------------------------------------------------- promotions

  @Get('promotions')
  @ApiOperation({ summary: 'Promotions and their usage' })
  promotions(@Query() dto: AdminListDto) {
    return this.config.promotions(dto);
  }

  @Post('promotions')
  @ApiOperation({ summary: 'Create a promotion' })
  createPromotion(@Body() dto: CreatePromotionDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.config.createPromotion(dto, admin.id);
  }

  @Put('promotions/:promotionId')
  @ApiOperation({
    summary: 'Update a promotion',
    description: 'The redemption counter is maintained by the platform and cannot be set here.',
  })
  updatePromotion(
    @Param('promotionId', ParseUUIDPipe) promotionId: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.config.updatePromotion(promotionId, dto, admin.id);
  }

  // ------------------------------------------------------------ settings

  @Get('settings')
  @ApiOperation({ summary: 'Runtime business rules, with their admissible bounds' })
  settings(@Query('category') category?: string) {
    return this.config.platformSettings(category);
  }

  @Put('settings/:key')
  @ApiOperation({ summary: 'Change a runtime rule' })
  updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.config.updateSetting(key, dto.value, admin.id);
  }

  // ---------------------------------------------------------- audit logs

  @Get('audit-logs')
  @ApiOperation({ summary: 'Who changed what, and when' })
  auditLogs(@Query() dto: AdminAuditLogListDto) {
    return this.config.auditLogs(dto);
  }

  @Get('audit-logs/actions')
  @ApiOperation({ summary: 'Distinct action names, for filtering' })
  auditActions() {
    return this.config.auditActions();
  }
}

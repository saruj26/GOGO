import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { FoodDeliveryService } from './food-delivery.service';

/**
 * Courier-facing food delivery operations.
 *
 * Every method resolves the driver from the verified token; a driver id in a
 * request body would be ignored even if one were sent.
 */
@ApiTags('food-deliveries')
@ApiBearerAuth()
@Roles(RoleCode.DRIVER)
@Controller('food/deliveries')
export class FoodDeliveryController {
  constructor(private readonly deliveries: FoodDeliveryService) {}

  @Get('available')
  @ApiOperation({ summary: 'Food jobs you could take right now' })
  available(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.availableJobs(this.driverId(user));
  }

  @Get('current')
  @ApiOperation({ summary: 'The job you are working, with collection and delivery details' })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.currentJob(this.driverId(user));
  }

  @Get('history')
  @ApiOperation({ summary: 'Your completed deliveries' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.deliveries.history(this.driverId(user), pagination);
  }

  @Post(':deliveryId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Take this delivery',
    description:
      'Claimed atomically. If another courier claims it in the same moment, exactly one succeeds and the other is told so.',
  })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.accept(this.driverId(user), deliveryId, user.id);
  }

  @Post(':deliveryId/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Give up a job you cannot do',
    description:
      'Only before collection. The order returns to waiting for a courier; the customer’s food is unaffected.',
  })
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() body: { reason?: string },
  ) {
    return this.deliveries.release(this.driverId(user), deliveryId, user.id, body?.reason);
  }

  @Post(':deliveryId/heading-to-pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report that you are on the way to the restaurant' })
  heading(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.headingToPickup(this.driverId(user), deliveryId, user.id);
  }

  @Post(':deliveryId/arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report arrival at the restaurant' })
  arrived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.arrivedAtPickup(this.driverId(user), deliveryId, user.id);
  }

  @Post(':deliveryId/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm you have collected the food' })
  pickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.confirmPickup(this.driverId(user), deliveryId, user.id);
  }

  @Post(':deliveryId/delivering')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report that you are on the way to the customer' })
  delivering(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.startDelivering(this.driverId(user), deliveryId, user.id);
  }

  @Post(':deliveryId/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the delivery',
    description:
      'Settles the customer’s payment and records your earning and the platform’s commission from the quote agreed at checkout.',
  })
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.deliveries.completeDelivery(this.driverId(user), deliveryId, user.id);
  }

  private driverId(user: AuthenticatedUser): string {
    if (!user.driverId) {
      throw DomainError.forbidden('This account is not registered as a driver.');
    }
    return user.driverId;
  }
}

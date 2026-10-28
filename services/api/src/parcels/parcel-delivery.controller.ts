import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { LatLng } from '../common/utils/geo';
import { FailParcelDto } from './dto/parcels.dto';
import { ParcelDeliveryService } from './parcel-delivery.service';

interface OptionalLocationBody {
  lat?: number;
  lng?: number;
}

@ApiTags('parcel-deliveries')
@ApiBearerAuth()
@Roles(RoleCode.DRIVER)
@Controller('parcels/jobs')
export class ParcelDeliveryController {
  constructor(private readonly deliveries: ParcelDeliveryService) {}

  @Get('available')
  @ApiOperation({ summary: 'Parcel jobs you could take, matched to your vehicle' })
  available(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.availableJobs(this.driverId(user));
  }

  @Get('current')
  @ApiOperation({ summary: 'The parcel you are carrying' })
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.currentJob(this.driverId(user));
  }

  @Get('history')
  @ApiOperation({ summary: 'Your completed parcel jobs' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.deliveries.history(this.driverId(user), pagination);
  }

  @Post(':parcelId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Take this parcel',
    description: 'Claimed atomically; simultaneous claims resolve to exactly one winner.',
  })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
  ) {
    return this.deliveries.accept(this.driverId(user), parcelId, user.id);
  }

  @Post(':parcelId/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Give up a parcel you cannot collect',
    description: 'Only before collection. The parcel returns to the pool for another courier.',
  })
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() body: { reason?: string },
  ) {
    return this.deliveries.release(this.driverId(user), parcelId, user.id, body?.reason);
  }

  @Post(':parcelId/heading-to-pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report that you are on the way to collect' })
  heading(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() body: OptionalLocationBody,
  ) {
    return this.deliveries.headingToPickup(
      this.driverId(user),
      parcelId,
      user.id,
      this.location(body),
    );
  }

  @Post(':parcelId/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm you have the parcel' })
  pickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() body: OptionalLocationBody,
  ) {
    return this.deliveries.confirmPickup(
      this.driverId(user),
      parcelId,
      user.id,
      this.location(body),
    );
  }

  @Post(':parcelId/in-transit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report that you are on the way to the receiver' })
  transit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() body: OptionalLocationBody,
  ) {
    return this.deliveries.startTransit(
      this.driverId(user),
      parcelId,
      user.id,
      this.location(body),
    );
  }

  @Post(':parcelId/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the delivery',
    description:
      'Settles the sender’s payment and records your earning and the platform’s commission.',
  })
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() body: OptionalLocationBody,
  ) {
    return this.deliveries.completeDelivery(
      this.driverId(user),
      parcelId,
      user.id,
      this.location(body),
    );
  }

  @Post(':parcelId/fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report that the parcel could not be delivered',
    description:
      'The payment is left open for support to resolve — a courier is not the right party to decide who is owed what.',
  })
  fail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: FailParcelDto,
  ) {
    return this.deliveries.reportFailure(this.driverId(user), parcelId, user.id, dto.reason);
  }

  /** Identity comes from the verified token; a driver id in a body is ignored. */
  private driverId(user: AuthenticatedUser): string {
    if (!user.driverId) {
      throw DomainError.forbidden('This account is not registered as a driver.');
    }
    return user.driverId;
  }

  private location(body: OptionalLocationBody): LatLng | undefined {
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') return undefined;
    return { lat: body.lat, lng: body.lng };
  }
}

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CancelledBy, RideStatus, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { RideLifecycleService } from './ride-lifecycle.service';
import { RidesQueryService } from './rides-query.service';
import { RidesService } from './rides.service';
import {
  CancelRideDto,
  CreateRideDto,
  DeclarePlannedJourneyDto,
  EstimateRideDto,
  JoinSharedRideDto,
  SearchSharedRidesDto,
} from './dto/rides.dto';

@ApiTags('rides')
@ApiBearerAuth()
@Controller('rides')
export class RidesController {
  constructor(
    private readonly rides: RidesService,
    private readonly lifecycle: RideLifecycleService,
    private readonly query: RidesQueryService,
  ) {}

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fare and ETA for every eligible vehicle class',
    description:
      'Fares are calculated server-side. A client may not supply a fare, and one sent in a request body is ignored.',
  })
  estimate(@Body() dto: EstimateRideDto) {
    return this.rides.estimate(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Book a solo or shared ride' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRideDto) {
    return this.rides.createRide(user.id, dto);
  }

  @Post('shared/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find shared rides already travelling your route',
    description:
      'Runs the route-aware matching engine. Safety preferences are applied as hard constraints and cannot be overridden by price or proximity.',
  })
  searchShared(@CurrentUser() user: AuthenticatedUser, @Body() dto: SearchSharedRidesDto) {
    return this.rides.searchSharedRides(user.id, dto);
  }

  @Post('shared/join')
  @ApiOperation({
    summary: 'Join a shared ride you were offered',
    description:
      'Re-verifies capacity and safety under an exclusive lock on the ride. Two passengers racing for a last seat are serialised, and exactly one succeeds.',
  })
  joinShared(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinSharedRideDto) {
    return this.rides.joinSharedRide(user.id, {
      requestId: dto.requestId,
      rideId: dto.rideId,
      note: dto.note,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Your trip history' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.query.history(user.id, pagination);
  }

  @Roles(RoleCode.DRIVER)
  @Post('driver/planned-journey')
  @ApiOperation({
    summary: 'Declare a journey you are making and offer the empty seats',
    description:
      'The waypoints you declare become the corridor passengers are matched against, so the route you intend to drive is preserved as passengers are added.',
  })
  declareJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeclarePlannedJourneyDto,
  ) {
    return this.rides.declarePlannedJourney(this.driverId(user), dto);
  }

  @Roles(RoleCode.DRIVER)
  @Get('driver/active')
  @ApiOperation({ summary: 'The ride you are currently working, if any' })
  activeRide(@CurrentUser() user: AuthenticatedUser) {
    return this.query.activeForDriver(this.driverId(user));
  }

  @Roles(RoleCode.DRIVER)
  @Get('driver/available')
  @ApiOperation({
    summary: 'Open ride requests you could accept',
    description:
      'Lists exactly what accept() would allow, so the driver application never offers work the accept call would refuse.',
  })
  availableRides(@CurrentUser() user: AuthenticatedUser) {
    return this.query.availableForDriver(this.driverId(user));
  }

  @Roles(RoleCode.DRIVER)
  @Get('driver/shared-requests')
  @ApiOperation({
    summary: 'Shared passengers waiting for your decision',
    description:
      'Each entry carries the extra distance, the extra time and the extra earning the matching engine computed for it. None of that is recalculated by the client.',
  })
  pendingSharedPassengers(@CurrentUser() user: AuthenticatedUser) {
    return this.rides.pendingSharedPassengers(this.driverId(user));
  }

  @Roles(RoleCode.DRIVER)
  @Get('driver/assigned')
  @ApiOperation({ summary: 'Rides assigned to you' })
  assigned(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationDto,
    @Query('status') status?: RideStatus,
  ) {
    return this.query.driverHistory(this.driverId(user), pagination, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One ride, projected for who is asking' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.query.findOne(id, user);
  }

  @Get(':id/route')
  @ApiOperation({ summary: 'The ride’s current route geometry' })
  route(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.query.route(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a ride, or withdraw from a shared one',
    description:
      'A passenger withdrawing from a shared ride releases their seats; the journey continues for everyone else.',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelRideDto,
  ) {
    const isDriver = user.roles.includes(RoleCode.DRIVER) && user.driverId !== null;

    return this.lifecycle.cancel({
      rideId: id,
      actorUserId: user.id,
      actorRole: isDriver ? RoleCode.DRIVER : RoleCode.USER,
      cancelledBy: isDriver ? CancelledBy.DRIVER : CancelledBy.USER,
      reason: dto.reason,
    });
  }

  // =======================================================================
  // DRIVER ACTIONS
  // =======================================================================

  @Roles(RoleCode.DRIVER)
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a ride request' })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.accept(this.driverId(user), id, user.id);
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/shared-passengers/:ridePassengerId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Take a shared passenger onto this ride',
    description:
      'Re-checks ownership, capacity, safety and ride state under the ride’s row lock, then confirms the passenger and replans the stop sequence. Accepting twice is a no-op rather than an error.',
  })
  acceptSharedPassenger(
    @Param('id', ParseUUIDPipe) rideId: string,
    @Param('ridePassengerId', ParseUUIDPipe) ridePassengerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rides.acceptSharedPassenger({
      driverId: this.driverId(user),
      rideId,
      ridePassengerId,
      actorUserId: user.id,
    });
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/shared-passengers/:ridePassengerId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decline a shared passenger',
    description:
      'Releases the held seat and re-opens the passenger’s search. No stop was added for them, so the journey is unchanged.',
  })
  rejectSharedPassenger(
    @Param('id', ParseUUIDPipe) rideId: string,
    @Param('ridePassengerId', ParseUUIDPipe) ridePassengerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelRideDto,
  ) {
    return this.rides.rejectSharedPassenger({
      driverId: this.driverId(user),
      rideId,
      ridePassengerId,
      actorUserId: user.id,
      reason: dto?.reason,
    });
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/arriving')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report that you are on the way to the pickup' })
  arriving(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.markArriving(id, user.id);
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report arrival at the pickup point' })
  arrived(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.markArrived(id, user.id);
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the trip' })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.start(id, user.id);
  }

  @Roles(RoleCode.DRIVER)
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete the trip and settle every passenger',
    description:
      'Each passenger is charged from their own persisted quote, and a separate driver earning with its own commission record is written for each.',
  })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lifecycle.complete(id, user.id);
  }

  private driverId(user: AuthenticatedUser): string {
    if (!user.driverId) {
      throw DomainError.forbidden('This account is not registered as a driver.');
    }
    return user.driverId;
  }
}

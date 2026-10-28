import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EarningStatus, RoleCode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { DomainError } from '../common/errors/domain.error';
import { DriversService } from './drivers.service';
import { DriverLocationPingDto, UpdateAvailabilityDto } from './dto/drivers.dto';

@ApiTags('drivers')
@ApiBearerAuth()
@Roles(RoleCode.DRIVER)
@Controller('drivers/me')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @ApiOperation({
    summary: 'Your driver profile: approval, availability, vehicles and documents',
    description:
      'What the driver application needs before a driver can go online or accept work. Document storage keys are never returned.',
  })
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.drivers.profile(this.driverId(user));
  }

  @Post('location')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Report the vehicle’s current position',
    description:
      'Updates the single live-position row and, at most once per configured interval, appends to the retained breadcrumb trail.',
  })
  location(@CurrentUser() user: AuthenticatedUser, @Body() dto: DriverLocationPingDto) {
    return this.drivers.recordLocation(this.driverId(user), dto);
  }

  @Put('availability')
  @ApiOperation({ summary: 'Go online or offline, and set what work you accept' })
  availability(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAvailabilityDto) {
    return this.drivers.updateAvailability(this.driverId(user), dto);
  }

  @Get('earnings/summary')
  @ApiOperation({ summary: 'Aggregated earnings, including the uplift from shared passengers' })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.drivers.earningsSummary(
      this.driverId(user),
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Individual earning records' })
  earnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: CursorPaginationDto,
    @Query('status') status?: EarningStatus,
  ) {
    return this.drivers.earnings(this.driverId(user), pagination, status);
  }

  private driverId(user: AuthenticatedUser): string {
    if (!user.driverId) {
      throw DomainError.forbidden('This account is not registered as a driver.');
    }
    return user.driverId;
  }
}

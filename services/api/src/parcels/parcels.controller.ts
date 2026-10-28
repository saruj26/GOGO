import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationDto } from '../common/dto/pagination.dto';
import { CancelParcelDto, CreateParcelDto, EstimateParcelDto } from './dto/parcels.dto';
import { ParcelsQueryService } from './parcels-query.service';
import { ParcelsService } from './parcels.service';

@ApiTags('parcels')
@ApiBearerAuth()
@Controller('parcels')
export class ParcelsController {
  constructor(
    private readonly parcels: ParcelsService,
    private readonly query: ParcelsQueryService,
  ) {}

  @Get('types')
  @ApiOperation({ summary: 'The parcel classes you can book' })
  types() {
    return this.parcels.parcelTypes();
  }

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Price a parcel journey',
    description:
      'Returns a quote for every vehicle class that can legally carry the parcel. Compatibility is decided server-side from the parcel class and weight.',
  })
  estimate(@Body() dto: EstimateParcelDto) {
    return this.parcels.estimate(dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Book a parcel delivery',
    description:
      'The price is recalculated server-side at booking; a client cannot propose an amount.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateParcelDto) {
    return this.parcels.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Your parcel history' })
  history(@CurrentUser() user: AuthenticatedUser, @Query() pagination: CursorPaginationDto) {
    return this.query.history(user.id, pagination);
  }

  @Get(':parcelId')
  @ApiOperation({ summary: 'One parcel' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
  ) {
    return this.query.findOne(parcelId, user);
  }

  @Get(':parcelId/tracking')
  @ApiOperation({
    summary: 'Tracking history',
    description: 'Recorded coordinates are returned to the sender and to admin only.',
  })
  tracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.query.tracking(parcelId, user, pagination);
  }

  @Post(':parcelId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a parcel',
    description:
      'Permitted until the courier has collected it. Wallet payments are refunded in the same transaction.',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: CancelParcelDto,
  ) {
    return this.parcels.cancel(user.id, parcelId, dto.reason);
  }
}

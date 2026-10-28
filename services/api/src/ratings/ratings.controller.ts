import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SubmitRatingDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

@ApiTags('ratings')
@ApiBearerAuth()
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Completed trips and orders you have not rated yet' })
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.ratings.pending(user.id);
  }

  @Post('rides/:rideId')
  @ApiOperation({ summary: 'Rate a completed ride' })
  rateRide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.ratings.rateRide(user.id, rideId, dto);
  }

  @Post('food-orders/:orderId')
  @ApiOperation({ summary: 'Rate a delivered food order' })
  rateFoodOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.ratings.rateFoodOrder(user.id, orderId, dto);
  }

  @Post('parcels/:parcelId')
  @ApiOperation({ summary: 'Rate a delivered parcel' })
  rateParcel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.ratings.rateParcel(user.id, parcelId, dto);
  }
}

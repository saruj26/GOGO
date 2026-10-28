import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { BrowseRestaurantsDto } from './dto/restaurants.dto';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse or search restaurants',
    description:
      'Supplying a position ranks results by real distance and states whether each restaurant delivers to it.',
  })
  browse(@Query() dto: BrowseRestaurantsDto) {
    return this.restaurants.browse(dto);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'One restaurant with its full menu' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.restaurants.findOne(idOrSlug);
  }
}

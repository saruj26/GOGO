import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../auth/auth.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlacesService } from './places.service';
import { ReverseGeocodeDto, SavePlaceDto, SearchPlacesDto } from './dto/places.dto';
import { SavedPlacesService } from './saved-places.service';

@ApiTags('places')
@ApiBearerAuth()
@Controller('places')
export class PlacesController {
  constructor(
    private readonly places: PlacesService,
    private readonly saved: SavedPlacesService,
  ) {}

  @Get('search')
  // Geocoding is metered — by a vendor bill or by OpenStreetMap's usage policy.
  // The client debounces; this is the backstop.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search for an address' })
  async search(@Query() dto: SearchPlacesDto) {
    const near = dto.lat !== undefined && dto.lng !== undefined
      ? { lat: dto.lat, lng: dto.lng }
      : undefined;

    const results = await this.places.search(dto.q, near);

    return {
      results: results.map((r) => ({
        address: r.address,
        lat: r.location.lat,
        lng: r.location.lng,
        placeId: r.providerPlaceId ?? null,
      })),
      attribution: this.places.attribution,
    };
  }

  @Get('reverse')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Name the address at a point on the map' })
  async reverse(@Query() dto: ReverseGeocodeDto) {
    const result = await this.places.reverse({ lat: dto.lat, lng: dto.lng });

    return {
      address: result?.address ?? `${dto.lat.toFixed(5)}, ${dto.lng.toFixed(5)}`,
      lat: result?.location.lat ?? dto.lat,
      lng: result?.location.lng ?? dto.lng,
      attribution: this.places.attribution,
    };
  }

  @Get('saved')
  @ApiOperation({ summary: 'Your saved places' })
  listSaved(@CurrentUser() user: AuthenticatedUser) {
    return this.saved.list(user.id);
  }

  @Post('saved')
  @ApiOperation({ summary: 'Save a place' })
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SavePlaceDto) {
    return this.saved.create(user.id, dto);
  }

  @Delete('saved/:placeId')
  @ApiOperation({ summary: 'Remove a saved place' })
  removeSaved(
    @CurrentUser() user: AuthenticatedUser,
    @Param('placeId', ParseUUIDPipe) placeId: string,
  ) {
    return this.saved.remove(user.id, placeId);
  }
}

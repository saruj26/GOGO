import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapProvider } from '../config/env.validation';
import { LatLng } from '../common/utils/geo';
import { ROUTING_PROVIDER, RoutingProvider, GeocodeResult } from '../routing/routing.types';
import { NominatimGeocodingProvider } from './nominatim.provider';

interface CacheEntry {
  value: GeocodeResult[];
  expiresAt: number;
}

/**
 * Address search and reverse lookup for the client applications.
 *
 * The configured map provider is used when it can geocode. Google can; the
 * development straight-line estimator cannot, and OSRM has no geocoder at all,
 * so those fall back to keyless OpenStreetMap lookups. The client never needs to
 * know which is in use — it gets addresses either way, with an attribution
 * string to display when one is required.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly fallback: NominatimGeocodingProvider;
  private readonly cache = new Map<string, CacheEntry>();

  private static readonly CACHE_TTL_MS = 300_000;
  private static readonly CACHE_MAX_ENTRIES = 300;

  constructor(
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    private readonly config: ConfigService,
  ) {
    this.fallback = new NominatimGeocodingProvider(config.get<string>('GEOCODER_CONTACT_EMAIL'));
  }

  /** True when the configured map provider does its own geocoding. */
  private get providerGeocodes(): boolean {
    return this.config.get<MapProvider>('MAP_PROVIDER') === MapProvider.Google;
  }

  get attribution(): string | null {
    return this.providerGeocodes ? null : this.fallback.attribution;
  }

  async search(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];

    const key = `${trimmed.toLowerCase()}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }

    const results = this.providerGeocodes
      ? await this.routing.geocode(trimmed, near)
      : await this.fallback.geocode(trimmed, near, this.config.get<string>('GEOCODER_COUNTRIES'));

    this.remember(key, results);
    return results;
  }

  async reverse(point: LatLng): Promise<GeocodeResult | null> {
    if (this.providerGeocodes) {
      return this.routing.reverseGeocode(point);
    }

    try {
      return await this.fallback.reverseGeocode(point);
    } catch {
      // A pin without a name is still a usable pin — fall back to coordinates
      // rather than failing the whole booking flow.
      return {
        address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
        location: point,
      };
    }
  }

  private remember(key: string, value: GeocodeResult[]): void {
    if (this.cache.size >= PlacesService.CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + PlacesService.CACHE_TTL_MS });
  }
}

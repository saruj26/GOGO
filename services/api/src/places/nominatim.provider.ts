import { Logger } from '@nestjs/common';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { LatLng } from '../common/utils/geo';
import { GeocodeResult } from '../routing/routing.types';

const SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const REQUEST_TIMEOUT_MS = 6_000;

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  addresstype?: string;
}

/**
 * Keyless geocoding over OpenStreetMap's Nominatim service.
 *
 * This exists so address search works in a deployment that has no commercial
 * map key. It is NOT a production geocoder: Nominatim's usage policy caps
 * traffic at roughly one request per second and requires attribution, so a real
 * deployment configures `MAP_PROVIDER=google` and gets Google's geocoder
 * instead.
 *
 * Results are cached briefly, and requests are debounced by the client, to stay
 * within that policy during development.
 */
export class NominatimGeocodingProvider {
  readonly name = 'nominatim';
  readonly attribution = '© OpenStreetMap contributors';

  private readonly logger = new Logger(NominatimGeocodingProvider.name);

  constructor(private readonly contactEmail?: string) {}

  async geocode(query: string, near?: LatLng, countryCodes?: string): Promise<GeocodeResult[]> {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '8');
    url.searchParams.set('addressdetails', '0');

    if (countryCodes) {
      url.searchParams.set('countrycodes', countryCodes);
    }

    if (near) {
      // Biases results toward the user without excluding anything outside the box.
      const d = 0.9;
      url.searchParams.set(
        'viewbox',
        `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
      );
    }

    const places = await this.request<NominatimPlace[]>(url);

    return places.map((place) => ({
      address: place.display_name,
      location: { lat: Number(place.lat), lng: Number(place.lon) },
      providerPlaceId: String(place.place_id),
    }));
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const url = new URL(REVERSE_ENDPOINT);
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('format', 'jsonv2');

    const place = await this.request<NominatimPlace | { error: string }>(url);

    if (!place || 'error' in place) return null;

    return {
      address: place.display_name,
      location: { lat: Number(place.lat), lng: Number(place.lon) },
      providerPlaceId: String(place.place_id),
    };
  }

  private async request<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Nominatim's policy requires an identifying User-Agent.
          'User-Agent': `RideFlowPlatform/1.0${this.contactEmail ? ` (${this.contactEmail})` : ''}`,
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim responded ${response.status}`);
        throw new DomainError(
          DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
          'Address search is temporarily unavailable. You can drop a pin on the map instead.',
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.warn(
        `Nominatim request failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new DomainError(
        DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
        'Address search is temporarily unavailable. You can drop a pin on the map instead.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

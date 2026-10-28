import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapProvider } from '../config/env.validation';
import { GoogleRoutingProvider } from './providers/google.provider';
import { HaversineRoutingProvider } from './providers/haversine.provider';
import { OsrmRoutingProvider } from './providers/osrm.provider';
import { ROUTING_PROVIDER, RoutingProvider } from './routing.types';
import { RoutingService } from './routing.service';

/**
 * Resolves the configured map provider once, at boot. Everything downstream
 * depends on the RoutingProvider interface, never on a concrete vendor.
 */
export const routingProviderFactory = (config: ConfigService): RoutingProvider => {
  const logger = new Logger('RoutingModule');
  const provider = config.get<MapProvider>('MAP_PROVIDER', MapProvider.Haversine);

  switch (provider) {
    case MapProvider.Google:
      return new GoogleRoutingProvider(config.getOrThrow<string>('MAP_API_KEY'));
    case MapProvider.Osrm:
      return new OsrmRoutingProvider(config.getOrThrow<string>('OSRM_BASE_URL'));
    case MapProvider.Haversine:
    default:
      logger.warn(
        'Using the straight-line routing estimator. Fares and ETAs derived from it are approximations and it is not permitted in production.',
      );
      return new HaversineRoutingProvider();
  }
};

@Global()
@Module({
  providers: [
    { provide: ROUTING_PROVIDER, useFactory: routingProviderFactory, inject: [ConfigService] },
    RoutingService,
  ],
  exports: [ROUTING_PROVIDER, RoutingService],
})
export class RoutingModule {}

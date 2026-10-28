import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { RideLifecycleService } from './ride-lifecycle.service';
import { RidesController } from './rides.controller';
import { RidesQueryService } from './rides-query.service';
import { RidesRepository } from './rides.repository';
import { RidesService } from './rides.service';

@Module({
  imports: [PricingModule, MatchingModule, NotificationsModule],
  controllers: [RidesController],
  providers: [RidesService, RideLifecycleService, RidesQueryService, RidesRepository],
  exports: [RidesService, RideLifecycleService, RidesRepository],
})
export class RidesModule {}

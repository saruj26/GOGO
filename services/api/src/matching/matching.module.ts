import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { MatchingRepository } from './matching.repository';
import { MatchingService } from './matching.service';

@Module({
  imports: [PricingModule],
  providers: [MatchingService, MatchingRepository],
  exports: [MatchingService, MatchingRepository],
})
export class MatchingModule {}

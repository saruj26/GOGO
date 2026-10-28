import { Global, Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';

@Global()
@Module({
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}

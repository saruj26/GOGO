import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { PricingModule } from '../pricing/pricing.module';
import { ParcelDeliveryController } from './parcel-delivery.controller';
import { ParcelDeliveryService } from './parcel-delivery.service';
import { ParcelsController } from './parcels.controller';
import { ParcelsQueryService } from './parcels-query.service';
import { ParcelsService } from './parcels.service';

@Module({
  imports: [PricingModule, DeliveriesModule],
  controllers: [ParcelsController, ParcelDeliveryController],
  providers: [ParcelsService, ParcelDeliveryService, ParcelsQueryService],
  exports: [ParcelsService],
})
export class ParcelsModule {}

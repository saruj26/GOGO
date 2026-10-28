import { Global, Module } from '@nestjs/common';
import { DeliveryAssignmentService } from './delivery-assignment.service';

/**
 * Courier eligibility, shared by food and parcel. Global because both delivery
 * verticals need it and neither owns it.
 */
@Global()
@Module({
  providers: [DeliveryAssignmentService],
  exports: [DeliveryAssignmentService],
})
export class DeliveriesModule {}

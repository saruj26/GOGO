import { Module, forwardRef } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { PricingModule } from '../pricing/pricing.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { CartService } from './cart.service';
import { FoodController } from './food.controller';
import { FoodDeliveryController } from './food-delivery.controller';
import { FoodDeliveryService } from './food-delivery.service';
import { FoodOrdersService } from './food-orders.service';
import { FoodQueryService } from './food-query.service';
import { RestaurantOrdersService } from './restaurant-orders.service';

@Module({
  imports: [PricingModule, DeliveriesModule, forwardRef(() => RestaurantsModule)],
  controllers: [FoodController, FoodDeliveryController],
  providers: [
    CartService,
    FoodOrdersService,
    FoodQueryService,
    FoodDeliveryService,
    RestaurantOrdersService,
  ],
  exports: [FoodOrdersService, RestaurantOrdersService],
})
export class FoodModule {}

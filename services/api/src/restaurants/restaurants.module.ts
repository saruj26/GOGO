import { Module, forwardRef } from '@nestjs/common';
import { FoodModule } from '../food/food.module';
import { MenuService } from './menu.service';
import { RestaurantPortalController } from './restaurant-portal.controller';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

@Module({
  // The portal exposes restaurant-side order actions, which live in the food
  // module; the food module needs restaurant lookups. The cycle is explicit and
  // resolved with forwardRef rather than by duplicating either side.
  imports: [forwardRef(() => FoodModule)],
  controllers: [RestaurantsController, RestaurantPortalController],
  providers: [RestaurantsService, MenuService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { validateEnv } from './config/env.validation';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { DriversModule } from './drivers/drivers.module';
import { FoodModule } from './food/food.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ParcelsModule } from './parcels/parcels.module';
import { PlacesModule } from './places/places.module';
import { RatingsModule } from './ratings/ratings.module';
import { PaymentsModule } from './payments/payments.module';
import { PromotionsModule } from './promotions/promotions.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MatchingModule } from './matching/matching.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RidesModule } from './rides/rides.module';
import { RoutingModule } from './routing/routing.module';
import { SettingsModule } from './settings/settings.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),

    PrismaModule,

    RealtimeModule,
    SettingsModule,
    SupportModule,
    RoutingModule,
    AuditModule,
    NotificationsModule,
    PaymentsModule,
    PromotionsModule,
    DeliveriesModule,

    AuthModule,
    PricingModule,
    MatchingModule,
    RidesModule,
    DriversModule,
    RestaurantsModule,
    FoodModule,
    ParcelsModule,
    PlacesModule,
    AccountModule,
    RatingsModule,
    AdminModule,
  ],
  providers: [
    // Order matters: authenticate, then authorise, then rate limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

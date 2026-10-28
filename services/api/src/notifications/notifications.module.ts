import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { pushProviderFactory } from './push/push.factory';
import { PUSH_PROVIDER } from './push/push.types';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatchService,
    { provide: PUSH_PROVIDER, useFactory: pushProviderFactory, inject: [ConfigService] },
  ],
  exports: [NotificationsService, NotificationDispatchService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { AdminConfigService } from './admin-config.service';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminOperationsService } from './admin-operations.service';

@Module({
  controllers: [AdminController],
  providers: [AdminMetricsService, AdminOperationsService, AdminConfigService],
})
export class AdminModule {}

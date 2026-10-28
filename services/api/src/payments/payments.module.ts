import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsService } from './payments.service';
import { paymentProviderFactory } from './providers/payment.factory';
import { PAYMENT_PROVIDER } from './providers/payment.types';
import { WalletService } from './wallet.service';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [PaymentWebhooksController],
  providers: [
    PaymentsService,
    WalletService,
    PaymentWebhooksService,
    { provide: PAYMENT_PROVIDER, useFactory: paymentProviderFactory, inject: [ConfigService] },
  ],
  exports: [PaymentsService, WalletService, PaymentWebhooksService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}

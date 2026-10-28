import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from './payment.types';
import { UnconfiguredPaymentProvider } from './unconfigured.provider';

/**
 * Chooses the payment vendor once, at boot.
 *
 * No vendor adapter ships with this build. That is a deliberate gap rather than
 * an oversight: writing one against a vendor whose sandbox we have never called
 * would produce code that compiles, passes its own mocks, and has never been
 * proved to move money. The interface, the webhook path, the idempotency table
 * and the security rules are all here and tested; the adapter is the piece that
 * needs a real account behind it.
 */
export const paymentProviderFactory = (config: ConfigService): PaymentProvider => {
  const logger = new Logger('PaymentProvider');
  const provider = (config.get<string>('PAYMENT_PROVIDER') ?? 'none').toLowerCase();

  if (provider !== 'none' && provider !== '') {
    logger.error(
      `PAYMENT_PROVIDER=${provider} is set but no adapter for it is compiled into this build. Card and online payments stay refused.`,
    );
  }

  return new UnconfiguredPaymentProvider();
};

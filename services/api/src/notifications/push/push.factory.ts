import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmPushProvider } from './fcm.provider';
import { PushProvider } from './push.types';
import { UnconfiguredPushProvider } from './unconfigured.provider';

/**
 * Chooses the push vendor once, at boot.
 *
 * A misconfigured provider degrades to "not configured" rather than stopping
 * the platform from starting: notifications are still recorded and still
 * delivered in-app, and the log says plainly that push is off.
 */
export const pushProviderFactory = (config: ConfigService): PushProvider => {
  const logger = new Logger('PushProvider');
  const provider = (config.get<string>('PUSH_PROVIDER') ?? 'none').toLowerCase();

  if (provider === 'fcm') {
    const account = config.get<string>('PUSH_FCM_SERVICE_ACCOUNT');

    if (!account) {
      logger.error('PUSH_PROVIDER=fcm but PUSH_FCM_SERVICE_ACCOUNT is not set.');
      return new UnconfiguredPushProvider();
    }

    try {
      const configured = FcmPushProvider.fromJson(account);
      logger.log('Push notifications will be delivered through FCM.');
      return configured;
    } catch (error) {
      // The message is safe to log; the credential it came from is not, and
      // the adapter is careful never to include it.
      logger.error(
        `FCM is configured but unusable: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return new UnconfiguredPushProvider();
    }
  }

  return new UnconfiguredPushProvider();
};

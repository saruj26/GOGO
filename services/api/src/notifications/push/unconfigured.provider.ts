import { Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushResult } from './push.types';

/**
 * What runs when no push credentials are configured.
 *
 * It does not pretend. Nothing is delivered, `isConfigured` is false, and the
 * caller records the notification as unsent — so the in-app list is still
 * correct and nobody is told a phone was buzzed when it was not.
 */
export class UnconfiguredPushProvider implements PushProvider {
  private readonly logger = new Logger('PushProvider');

  readonly name = 'unconfigured';
  readonly isConfigured = false;

  private warned = false;

  async send(message: PushMessage): Promise<PushResult> {
    if (!this.warned) {
      this.logger.warn(
        'No push provider is configured. Notifications are recorded and delivered in-app and over the realtime socket, but nothing is pushed to a closed app.',
      );
      this.warned = true;
    }

    // No token is reported invalid: they are perfectly good tokens that simply
    // had nowhere to be sent.
    return { delivered: 0, invalidTokens: [] };
  }
}

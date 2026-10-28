import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { PushMessage, PushProvider, PushResult } from './push.types';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

/**
 * Firebase Cloud Messaging, HTTP v1.
 *
 * The v1 API is per-token, so a multi-device send is a small fan-out rather
 * than one call. That is deliberate on Google's side: it is what lets the
 * response say which individual token is dead, which is the only way to stop
 * accumulating tokens for apps that were uninstalled years ago.
 *
 * Credentials come from a service-account JSON in the environment and are never
 * logged, never returned, and never sent to a client.
 */
export class FcmPushProvider implements PushProvider {
  private readonly logger = new Logger('FcmPushProvider');

  readonly name = 'fcm';
  readonly isConfigured = true;

  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly account: ServiceAccount) {
    if (!account.client_email || !account.private_key || !account.project_id) {
      throw new Error('FCM service account is missing required fields');
    }
  }

  static fromJson(raw: string): FcmPushProvider {
    let parsed: ServiceAccount;

    try {
      parsed = JSON.parse(raw) as ServiceAccount;
    } catch {
      // Deliberately does not echo the value: it is a private key.
      throw new Error('PUSH_FCM_SERVICE_ACCOUNT is not valid JSON');
    }

    return new FcmPushProvider(parsed);
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (message.tokens.length === 0) return { delivered: 0, invalidTokens: [] };

    const token = await this.authorise();
    const invalidTokens: string[] = [];
    let delivered = 0;

    await Promise.all(
      message.tokens.map(async (deviceToken) => {
        try {
          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: deviceToken,
                  notification: { title: message.title, body: message.body },
                  data: message.data,
                  android: {
                    priority: 'HIGH',
                    collapseKey: message.collapseKey,
                  },
                  apns: {
                    headers: message.collapseKey
                      ? { 'apns-collapse-id': message.collapseKey }
                      : undefined,
                  },
                },
              }),
            },
          );

          if (response.ok) {
            delivered += 1;
            return;
          }

          // 404 UNREGISTERED and 400 INVALID_ARGUMENT on the token mean the
          // app is gone from that device. Anything else is transient and the
          // token is kept.
          if (response.status === 404 || response.status === 403) {
            invalidTokens.push(deviceToken);
            return;
          }

          this.logger.warn(`FCM refused a message with status ${response.status}`);
        } catch (error) {
          this.logger.warn(
            `FCM send failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }),
    );

    return { delivered, invalidTokens };
  }

  /**
   * Exchanges the service account for an OAuth2 access token, cached until
   * shortly before it expires.
   */
  private async authorise(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (this.accessToken && this.accessToken.expiresAt > now + 60) {
      return this.accessToken.value;
    }

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: this.account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const unsigned = `${encode(header)}.${encode(claims)}`;
    const signature = createSign('RSA-SHA256')
      .update(unsigned)
      .sign(this.account.private_key, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });

    if (!response.ok) {
      // No body echo: an OAuth error can contain the assertion.
      throw new Error(`Could not obtain an FCM access token (${response.status})`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };

    this.accessToken = {
      value: body.access_token,
      expiresAt: now + body.expires_in,
    };

    return body.access_token;
  }
}

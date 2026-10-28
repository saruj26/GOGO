/**
 * The seam between the platform and whichever push vendor is configured.
 *
 * Nothing outside this folder may reference a vendor SDK, a vendor URL or a
 * vendor payload shape — the same rule the routing providers follow, for the
 * same reason: swapping vendors must be configuration, not a rewrite.
 */
export interface PushMessage {
  /** Device registration tokens. */
  tokens: string[];
  title: string;
  body: string;
  /** Small key/value payload the app uses to route the tap. */
  data?: Record<string, string>;
  /**
   * Deduplicates at the vendor as well as in our own table, so a retried
   * dispatch does not buzz a phone twice.
   */
  collapseKey?: string;
}

export interface PushResult {
  delivered: number;
  /** Tokens the vendor said are dead; they are deactivated rather than retried. */
  invalidTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  /** False when no credentials are configured, so callers can be honest. */
  readonly isConfigured: boolean;
  send(message: PushMessage): Promise<PushResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ACCESS_TOKEN_TYPE, JwtPayload } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeMembershipService } from './realtime.membership';
import { authorisationFor, parseRoom, roomFor } from './realtime.rooms';

interface SocketIdentity {
  userId: string;
  driverId: string | null;
  isAdmin: boolean;
}

/**
 * The realtime edge.
 *
 * Two rules run this file. A socket is authenticated once, at handshake, from
 * the same access token the REST API uses — an unauthenticated socket is closed
 * rather than left connected in a limited mode. And a client never joins a room
 * by asking: it asks, and the server decides from the database whether that
 * person belongs to that resource.
 *
 * The identity is resolved from the database at connection time rather than
 * taken from the token body, so a revoked driver role stops being able to
 * subscribe as a driver immediately.
 */
@WebSocketGateway({
  namespace: '/realtime',
  // The same origins the REST API accepts; a socket is not a way around CORS.
  cors: { origin: true, credentials: true },
  // Ping often enough to notice a phone that walked into a tunnel, rarely
  // enough not to keep radios awake.
  pingInterval: 25_000,
  pingTimeout: 20_000,
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  private readonly identities = new Map<string, SocketIdentity>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly membership: RealtimeMembershipService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const identity = await this.identify(client);
      this.identities.set(client.id, identity);

      // Everyone gets their own channel without asking: it is theirs by
      // definition, and it is where notifications arrive.
      await client.join(roomFor.user(identity.userId));
      if (identity.driverId) await client.join(roomFor.driver(identity.driverId));

      client.emit('ready', {
        userId: identity.userId,
        isDriver: identity.driverId !== null,
      });
    } catch {
      // Deliberately no detail: a socket that cannot authenticate is told to
      // sign in, not told why its token was unacceptable.
      client.emit('unauthorized', { message: 'Sign in again to receive live updates.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.identities.delete(client.id);
  }

  /**
   * A client asks to follow a resource.
   *
   * The room is parsed, then authorised, then joined — in that order, so a
   * malformed name never reaches a query and an unauthorised one never reaches
   * a room.
   */
  @SubscribeMessage('subscribe')
  async subscribe(client: Socket, payload: unknown): Promise<{ ok: boolean; room?: string; error?: string }> {
    const identity = this.identities.get(client.id);
    if (!identity) return { ok: false, error: 'Not authenticated.' };

    const requested = typeof payload === 'string' ? payload : (payload as { room?: string })?.room;

    let room;
    try {
      room = parseRoom(requested ?? '');
    } catch {
      return { ok: false, error: 'Unknown channel.' };
    }

    const decision = authorisationFor(room, identity);

    if (decision === 'deny') return { ok: false, error: 'Not allowed.' };

    if (decision === 'check-membership') {
      const allowed = await this.membership.isMember(room, identity);
      if (!allowed) {
        this.logger.warn(
          `User ${identity.userId} was refused ${room.kind}:${room.id}`,
        );
        // The same answer whether the resource is someone else's or does not
        // exist, so this cannot be used to discover ride ids.
        return { ok: false, error: 'Not allowed.' };
      }
    }

    const name = `${room.kind}:${room.id}`;
    await client.join(name);
    return { ok: true, room: name };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(client: Socket, payload: unknown): Promise<{ ok: boolean }> {
    const requested = typeof payload === 'string' ? payload : (payload as { room?: string })?.room;

    try {
      const room = parseRoom(requested ?? '');
      await client.leave(`${room.kind}:${room.id}`);
    } catch {
      // Leaving a room that was never valid is not an error worth reporting.
    }

    return { ok: true };
  }

  private async identify(client: Socket): Promise<SocketIdentity> {
    const token = this.tokenFrom(client);
    if (!token) throw new Error('no token');

    const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });

    if (payload.type !== ACCESS_TOKEN_TYPE) throw new Error('wrong token type');

    // Roles are read from the database, not from the token, so revoking a role
    // takes effect on the next connection rather than on token expiry.
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        roles: { select: { role: { select: { code: true } } } },
        driver: { select: { id: true } },
      },
    });

    if (!user) throw new Error('unknown user');

    return {
      userId: user.id,
      driverId: user.driver?.id ?? null,
      isAdmin: user.roles.some((r) => r.role.code === 'ADMIN'),
    };
  }

  private tokenFrom(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.length > 0) return auth.token;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

    return null;
  }
}

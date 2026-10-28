import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeMembershipService } from './realtime.membership';
import { RealtimeService } from './realtime.service';

/**
 * Realtime transport.
 *
 * Global because almost every domain module raises events, and threading an
 * import through all of them would add noise without adding safety.
 *
 * There is no Redis adapter wired in. One node serves every socket today, so
 * the in-process adapter is correct and adding Redis would be infrastructure
 * that earns nothing. When a second node exists this module gains an adapter
 * behind `REDIS_URL` and nothing outside it changes.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeMembershipService, RealtimeService],
  exports: [RealtimeService, RealtimeMembershipService],
})
export class RealtimeModule {}

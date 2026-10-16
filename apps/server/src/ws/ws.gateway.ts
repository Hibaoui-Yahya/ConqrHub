import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../core/auth/services/token.service';
import { JwtPayload, JwtType } from '../core/auth/dto/jwt-payload';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WsService } from './ws.service';
import { getSpaceRoomName, getUserRoomName } from './ws.utils';
import * as cookie from 'cookie';
import { HubSessionValidator } from '../core/auth/services/hub-session-validator.service';
import {
  AllowedOrigins,
  allowedOriginsFromEnv,
  originOf,
} from '../common/security/allowed-origins';
import {
  SESSIONS_REVOKED_EVENT,
  SessionsRevokedEvent,
} from '../core/session/session-events';

/** A connected socket re-proves its session at least this often. */
const SESSION_RECHECK_MS = 30_000;

const sessionRoom = (sessionId: string) => `session-${sessionId}`;

@WebSocketGateway({
  cors: {
    credentials: true,
    // Fail-open guard: if APP_URL is missing/unparseable, accept any
    // origin rather than blocking every WebSocket upgrade. See main.ts
    // for the rationale.
    origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
      if (!origin) return cb(null, true);
      const rawAppUrl = process.env.APP_URL;
      if (!rawAppUrl) return cb(null, true); // fail-open
      let allowedOrigin: string | null = null;
      try {
        allowedOrigin = new URL(rawAppUrl).origin;
      } catch {
        return cb(null, true); // fail-open on unparseable APP_URL
      }
      if (origin === allowedOrigin) return cb(null, true);
      const subdomainHost = process.env.SUBDOMAIN_HOST;
      if (subdomainHost) {
        try {
          const host = new URL(origin).host;
          if (host === subdomainHost || host.endsWith('.' + subdomainHost)) {
            return cb(null, true);
          }
        } catch {
          /* fall through */
        }
      }
      return cb(new Error('Origin not allowed by CORS'));
    },
  },
  transports: ['websocket'],
})
export class WsGateway
  implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WsGateway.name);
  private readonly origins: AllowedOrigins = allowedOriginsFromEnv();
  private recheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private tokenService: TokenService,
    private spaceMemberRepo: SpaceMemberRepo,
    private wsService: WsService,
    private sessionValidator: HubSessionValidator,
  ) {}

  afterInit(server: Server): void {
    this.wsService.setServer(server);
    // Catch revocations that emit no event (deactivation, password reset,
    // session cleanup): every socket on this instance re-proves its session.
    this.recheckTimer = setInterval(
      () => void this.recheckConnectedSessions(),
      SESSION_RECHECK_MS,
    );
    this.recheckTimer.unref?.();
  }

  async handleConnection(client: Socket, ...args: any[]): Promise<void> {
    try {
      // The upgrade carries the session cookie, so a page on another site
      // could open a socket as the victim (cross-site WebSocket hijacking).
      // CORS options do not cover a raw WebSocket upgrade: check explicitly.
      if (!this.isTrustedOrigin(client)) {
        throw new Error('Origin not allowed');
      }
      const cookies = cookie.parse(client.handshake.headers.cookie ?? '');
      const token: JwtPayload = await this.tokenService.verifyJwt(
        cookies['authToken'],
        JwtType.ACCESS,
      );
      // Same authority as the API guard: live session, active user.
      await this.sessionValidator.validate(token, { requireSession: false });

      const userId = token.sub;
      const workspaceId = token.workspaceId;

      client.data.userId = userId;
      client.data.workspaceId = workspaceId;
      client.data.sessionId = token.sessionId ?? null;
      client.data.validatedAt = Date.now();

      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);

      const userRoom = getUserRoomName(userId);
      const workspaceRoom = `workspace-${workspaceId}`;
      const spaceRooms = userSpaceIds.map((id) => getSpaceRoomName(id));
      const rooms = [userRoom, workspaceRoom, ...spaceRooms];
      if (token.sessionId) rooms.push(sessionRoom(token.sessionId));

      client.join(rooms);
    } catch (err) {
      client.emit('Unauthorized');
      client.disconnect();
    }
  }

  @SubscribeMessage('message')
  async handleMessage(client: Socket, data: any): Promise<void> {
    if (!(await this.ensureSessionStillValid(client))) return;
    if (this.wsService.isTreeEvent(data)) {
      await this.wsService.handleTreeEvent(client, data);
    }
  }

  /** Drops every socket of the revoked sessions on this instance at once. */
  @OnEvent(SESSIONS_REVOKED_EVENT)
  async onSessionsRevoked(event: SessionsRevokedEvent): Promise<void> {
    if (!this.server) return;
    try {
      for (const id of event.sessionIds ?? []) {
        this.server.in(sessionRoom(id)).disconnectSockets(true);
      }
      if (event.all || event.allExcept) {
        const sockets = await this.server
          .in(getUserRoomName(event.userId))
          .fetchSockets();
        for (const socket of sockets) {
          if (event.allExcept && socket.data?.sessionId === event.allExcept) {
            continue;
          }
          socket.disconnect(true);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Could not drop revoked sockets: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private isTrustedOrigin(client: Socket): boolean {
    const origin = originOf(client.handshake.headers.origin);
    // Browsers always send Origin on a WebSocket upgrade; non-browser
    // clients cannot be forged by a third-party page.
    if (!origin) return true;
    const host = client.handshake.headers.host;
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      return true;
    }
    return this.origins.isAllowed(origin);
  }

  /** Re-proves the session when the last proof is older than the recheck window. */
  private async ensureSessionStillValid(client: Socket): Promise<boolean> {
    if (Date.now() - (client.data?.validatedAt ?? 0) < SESSION_RECHECK_MS) {
      return true;
    }
    return this.revalidate(client);
  }

  private async revalidate(client: Socket): Promise<boolean> {
    try {
      await this.sessionValidator.validate(
        {
          sub: client.data.userId,
          workspaceId: client.data.workspaceId,
          sessionId: client.data.sessionId ?? undefined,
        },
        { requireSession: false },
      );
      client.data.validatedAt = Date.now();
      return true;
    } catch (err) {
      // An outage is not a revocation: keep the socket, retry next round.
      if ((err as { status?: number })?.status === 503) return true;
      client.emit('Unauthorized');
      client.disconnect(true);
      return false;
    }
  }

  private async recheckConnectedSessions(): Promise<void> {
    if (!this.server) return;
    try {
      const sockets = await this.server.local.fetchSockets();
      for (const socket of sockets) {
        if (Date.now() - (socket.data?.validatedAt ?? 0) >= SESSION_RECHECK_MS) {
          await this.revalidate(socket as unknown as Socket);
        }
      }
    } catch (err) {
      this.logger.debug(`Session recheck skipped: ${(err as Error)?.message ?? err}`);
    }
  }

  /*
  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, @MessageBody() roomName: string): void {
    // if room is a space, check if user has permissions
    //client.join(roomName);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, @MessageBody() roomName: string): void {
    client.leave(roomName);
  }
 */

  onModuleDestroy() {
    if (this.recheckTimer) clearInterval(this.recheckTimer);
    if (this.server) {
      this.server.close();
    }
  }
}

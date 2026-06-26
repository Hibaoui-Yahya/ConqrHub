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
import { OnModuleDestroy } from '@nestjs/common';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WsService } from './ws.service';
import { getSpaceRoomName, getUserRoomName } from './ws.utils';
import * as cookie from 'cookie';

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

  constructor(
    private tokenService: TokenService,
    private spaceMemberRepo: SpaceMemberRepo,
    private wsService: WsService,
  ) {}

  afterInit(server: Server): void {
    this.wsService.setServer(server);
  }

  async handleConnection(client: Socket, ...args: any[]): Promise<void> {
    try {
      const cookies = cookie.parse(client.handshake.headers.cookie);
      const token: JwtPayload = await this.tokenService.verifyJwt(
        cookies['authToken'],
        JwtType.ACCESS,
      );

      const userId = token.sub;
      const workspaceId = token.workspaceId;

      client.data.userId = userId;

      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);

      const userRoom = getUserRoomName(userId);
      const workspaceRoom = `workspace-${workspaceId}`;
      const spaceRooms = userSpaceIds.map((id) => getSpaceRoomName(id));

      client.join([userRoom, workspaceRoom, ...spaceRooms]);
    } catch (err) {
      client.emit('Unauthorized');
      client.disconnect();
    }
  }

  @SubscribeMessage('message')
  async handleMessage(client: Socket, data: any): Promise<void> {
    if (this.wsService.isTreeEvent(data)) {
      await this.wsService.handleTreeEvent(client, data);
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
    if (this.server) {
      this.server.close();
    }
  }
}

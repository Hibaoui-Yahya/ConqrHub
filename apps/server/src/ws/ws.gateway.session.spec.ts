import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WsGateway } from './ws.gateway';

function fakeSocket(headers: Record<string, string>) {
  return {
    handshake: { headers },
    data: {} as Record<string, any>,
    joined: [] as string[],
    emitted: [] as string[],
    disconnected: false,
    join(rooms: string[]) {
      this.joined.push(...rooms);
    },
    emit(event: string) {
      this.emitted.push(event);
    },
    disconnect() {
      this.disconnected = true;
    },
  };
}

function setup(opts: { validate?: jest.Mock } = {}) {
  process.env.APP_URL = 'https://ltc.conqrhub.com';
  const tokenService = {
    verifyJwt: jest.fn(async () => ({
      sub: 'u1',
      workspaceId: 'w1',
      sessionId: 's1',
      type: 'access',
    })),
  };
  const validate =
    opts.validate ?? jest.fn(async () => ({ user: {}, session: {} }));
  const gateway = new WsGateway(
    tokenService as any,
    { getUserSpaceIds: jest.fn(async () => ['sp1']) } as any,
    { isTreeEvent: () => false } as any,
    { validate } as any,
  );
  return { gateway, validate };
}

const goodHeaders = {
  origin: 'https://ltc.conqrhub.com',
  host: 'ltc.conqrhub.com',
  cookie: 'authToken=t',
};

describe('WsGateway session security', () => {
  it('joins the user, workspace, space and session rooms for a live session', async () => {
    const { gateway } = setup();
    const socket = fakeSocket(goodHeaders);
    await gateway.handleConnection(socket as any);
    expect(socket.disconnected).toBe(false);
    expect(socket.joined).toEqual(
      expect.arrayContaining(['workspace-w1', 'session-s1']),
    );
  });

  it('refuses a cross-site upgrade carrying the cookie (WebSocket hijacking)', async () => {
    const { gateway, validate } = setup();
    const socket = fakeSocket({
      ...goodHeaders,
      origin: 'https://evil.example',
    });
    await gateway.handleConnection(socket as any);
    expect(socket.disconnected).toBe(true);
    expect(validate).not.toHaveBeenCalled();
  });

  it('refuses a signed token whose session was revoked', async () => {
    const { gateway } = setup({
      validate: jest.fn(async () => {
        throw new UnauthorizedException();
      }),
    });
    const socket = fakeSocket(goodHeaders);
    await gateway.handleConnection(socket as any);
    expect(socket.disconnected).toBe(true);
    expect(socket.emitted).toContain('Unauthorized');
  });

  it('drops a connected socket whose session is revoked at the next check, but not on an outage', async () => {
    const validate = jest.fn(async () => ({ user: {}, session: {} }));
    const { gateway } = setup({ validate });
    const socket = fakeSocket(goodHeaders);
    await gateway.handleConnection(socket as any);

    socket.data.validatedAt = 0;
    validate.mockRejectedValueOnce(new ServiceUnavailableException());
    await gateway.handleMessage(socket as any, {});
    expect(socket.disconnected).toBe(false);

    socket.data.validatedAt = 0;
    validate.mockRejectedValueOnce(new UnauthorizedException());
    await gateway.handleMessage(socket as any, {});
    expect(socket.disconnected).toBe(true);
  });
});

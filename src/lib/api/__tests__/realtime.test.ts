import { beforeEach, describe, expect, it, vi } from 'vitest';
const { socket, io } = vi.hoisted(() => {
  const socket = { connected: true, auth: {}, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connect: vi.fn() };
  return { socket, io: vi.fn(() => socket) };
});
vi.mock('socket.io-client', () => ({ io }));

describe('realtime authentication', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); });
  const response = (id: string, token: string) => ({ accessToken: token, refreshToken: 'refresh', expiresIn: 900, tokenType: 'Bearer', user: { id, email: null, phone: null, emailVerified: true, phoneVerified: false, metadata: {}, createdAt: '' } });

  it('reconnects an already connected socket after token rotation', async () => {
    const session = await import('../session');
    session.setSession(response('patient', 'old'));
    const realtime = await import('../realtime');
    realtime.getSocket();
    session.setSession(response('patient', 'new'), 'TOKEN_REFRESHED');
    expect(socket.auth).toEqual({ token: 'new' });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('clears the previous user appointment rooms at logout', async () => {
    const session = await import('../session');
    session.setSession(response('patient', 'old'));
    const realtime = await import('../realtime');
    realtime.subscribeAppointment('private-appointment');
    session.clearSession();
    session.setSession(response('other', 'other-token'));
    realtime.getSocket();
    socket.emit.mockClear();
    const callbacks = socket.on.mock.calls.filter(([name]) => name === 'ready');
    callbacks.at(-1)![1]();
    expect(socket.emit).not.toHaveBeenCalledWith('subscribe:appointment', 'private-appointment');
  });
});

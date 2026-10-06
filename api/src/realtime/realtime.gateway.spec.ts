import type { EventEmitter } from 'node:events';
import type { Client } from 'pg';
import type { Server } from 'socket.io';
import type { JwtService } from '@nestjs/jwt';
import type { DatabaseService } from '../database/database.service';
import type { MessagingService } from '../messaging/messaging.service';
import type { AccountStatusService } from '../auth/account-status.service';
import { loadConfig } from '../config/config.schema';
import { RealtimeGateway } from './realtime.gateway';
import { startChangeListener } from './change-listener';

jest.mock('./change-listener', () => ({ startChangeListener: jest.fn() }));
describe('LISTEN reconnect lifecycle', () => {
  it('keeps one relay and does not reconnect after shutdown', async () => {
    jest.useFakeTimers();
    const start = jest.mocked(startChangeListener);
    const end = jest.fn().mockResolvedValue(undefined);
    const config = loadConfig({ DATABASE_URL: 'postgresql://unused:unused@localhost/unused', JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456', NODE_ENV: 'test' });
    const gateway = new RealtimeGateway({} as JwtService, {} as DatabaseService, {} as MessagingService, {} as AccountStatusService, config);
    let bus: EventEmitter;
    let lost: (err: Error) => void;
    start.mockImplementation(async (_url, events, onError) => {
      bus = events;
      lost = onError;
      return { end } as unknown as Client;
    });
    const emit = jest.fn();
    gateway.server = { sockets: { sockets: new Map() }, to: () => ({ emit }) } as unknown as Server;
    try {
      await gateway.onModuleInit();
      lost!(new Error('test disconnect'));
      lost!(new Error('duplicate error'));
      await jest.advanceTimersByTimeAsync(5000);
      expect(start).toHaveBeenCalledTimes(2);
      bus!.emit('change', { table: 'profiles', op: 'UPDATE', user_id: 'user', at: '' });
      expect(emit).toHaveBeenCalledTimes(1);
      lost!(new Error('disconnect before shutdown'));
      await gateway.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(10000);
      expect(start).toHaveBeenCalledTimes(2);
      expect(bus!.listenerCount('change')).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

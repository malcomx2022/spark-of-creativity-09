import { EventEmitter } from 'node:events';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Client } from 'pg';
import { Server, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { MessagingService } from '../messaging/messaging.service';
import { startChangeListener, TableChangeEvent } from './change-listener';
import { AccountStatusService } from '../auth/account-status.service';

interface SocketUser {
  id: string;
  practitionerId: string | null;
  isAdmin: boolean;
  expiresAt: number;
}

/** Tables dont les changements sont diffusés à la room `admin` (KYCQueue, PaymentFlowsDashboard, SupportSection…). */
const ADMIN_TABLES = new Set(['practitioners', 'payments', 'practitioner_balances', 'practitioner_payouts', 'support_tickets', 'appointments']);

/**
 * Remplace Supabase Realtime (`postgres_changes` + `presence`) :
 *  - handshake : `auth.token` = JWT d'accès (ou en-tête Authorization) ;
 *  - rooms automatiques : `user:<id>`, `practitioner:<id>`, `admin` ;
 *  - `subscribe:appointment` / `unsubscribe:appointment` après contrôle d'accès ;
 *  - événement `change` { table, op, id, … } relayé depuis LISTEN table_changes ;
 *  - `typing` { appointmentId, isTyping } relayé aux autres participants (ex canal presence).
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly bus = new EventEmitter();
  private listener: Client | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private checking = false;
  private readonly expirationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly onChange = (e: TableChangeEvent) => { void this.relay(e).catch((err) => this.logger.error(err)); };
  readonly stats = { connections: 0, eventsRelayed: 0 };

  constructor(
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly messaging: MessagingService,
    private readonly accounts: AccountStatusService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.REALTIME_ENABLED) return;
    this.bus.on('change', this.onChange);
    this.authTimer = setInterval(() => { void this.checkConnections(); }, this.config.REALTIME_AUTH_CHECK_MS);
    this.authTimer.unref();
    await this.connectListener();
  }

  private async connectListener(): Promise<void> {
    if (this.stopped) return;
    const previous = this.listener;
    this.listener = null;
    await previous?.end().catch(() => undefined);
    const connection: { active?: Client } = {};
    connection.active = await startChangeListener(this.config.DATABASE_URL, this.bus, (err) => {
      if (this.stopped || (connection.active && this.listener !== connection.active)) return;
      this.logger.error(`connexion LISTEN perdue : ${err.message} — reconnexion dans 5 s`);
      this.scheduleReconnect();
    });
    this.listener = connection.active;
    if (this.stopped) await this.listener.end().catch(() => undefined);
    this.logger.log('relais LISTEN table_changes → Socket.IO actif');
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectListener().catch((err) => { this.logger.error(err); this.scheduleReconnect(); });
    }, 5_000);
    this.reconnectTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.authTimer) clearInterval(this.authTimer);
    for (const timer of this.expirationTimers.values()) clearTimeout(timer);
    this.expirationTimers.clear();
    this.bus.off('change', this.onChange);
    await this.listener?.end().catch(() => undefined);
  }

  private async authenticate(socket: Socket): Promise<SocketUser | null> {
    const raw = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.headers.authorization;
    const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw;
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.JWT_ACCESS_SECRET });
      if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
      await this.accounts.assertActive(payload.sub);
      return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
        const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', payload.sub).executeTakeFirst();
        const admin = await trx.selectFrom('user_roles').select('id').where('user_id', '=', payload.sub).executeTakeFirst();
        return { id: payload.sub, practitionerId: practitioner?.id ?? null, isAdmin: !!admin, expiresAt: payload.exp! * 1000 };
      });
    } catch {
      return null;
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    const user = await this.authenticate(socket);
    if (!socket.connected || this.stopped) return;
    if (!user) {
      socket.emit('error', { message: 'Authentification requise' });
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    this.expirationTimers.set(socket.id, setTimeout(() => socket.disconnect(true), Math.min(user.expiresAt - Date.now(), 2_147_483_647)));
    await socket.join(`user:${user.id}`);
    if (user.practitionerId) await socket.join(`practitioner:${user.practitionerId}`);
    if (user.isAdmin) await socket.join('admin');
    this.stats.connections++;
    socket.data.counted = true;
    socket.emit('ready', { userId: user.id, practitionerId: user.practitionerId, isAdmin: user.isAdmin });
  }

  handleDisconnect(socket: Socket): void {
    const timer = this.expirationTimers.get(socket.id);
    if (timer) clearTimeout(timer);
    this.expirationTimers.delete(socket.id);
    if (socket.data.counted) this.stats.connections = Math.max(0, this.stats.connections - 1);
  }

  /** Réévaluation bornée à REALTIME_AUTH_CHECK_MS ; aucun droit dépend du client. */
  private async checkConnections(): Promise<void> {
    if (this.checking || this.stopped || !this.server) return;
    this.checking = true;
    try {
      for (const socket of this.server.sockets.sockets.values()) {
        if (!socket.data.user) continue;
        const user = await this.authenticate(socket);
        if (!socket.connected) continue;
        if (!user) { socket.disconnect(true); continue; }
        const previous = socket.data.user as SocketUser;
        if (previous.isAdmin && !user.isAdmin) await socket.leave('admin');
        if (!previous.isAdmin && user.isAdmin) await socket.join('admin');
        if (previous.practitionerId !== user.practitionerId) {
          if (previous.practitionerId) await socket.leave(`practitioner:${previous.practitionerId}`);
          if (user.practitionerId) await socket.join(`practitioner:${user.practitionerId}`);
        }
        socket.data.user = user;
        for (const room of socket.rooms) {
          if (room.startsWith('appointment:') && !(await this.messaging.canAccess(user.id, room.slice('appointment:'.length)))) await socket.leave(room);
        }
      }
    } catch (err) { this.logger.error(err); }
    finally { this.checking = false; }
  }

  @SubscribeMessage('subscribe:appointment')
  async subscribeAppointment(@ConnectedSocket() socket: Socket, @MessageBody() body: { appointmentId?: string }) {
    const user = socket.data.user as SocketUser | undefined;
    const appointmentId = body?.appointmentId;
    if (!user || !appointmentId) return { ok: false, error: 'appointmentId requis' };
    const allowed = await this.messaging.canAccess(user.id, appointmentId);
    if (!allowed) return { ok: false, error: 'Accès refusé' };
    await socket.join(`appointment:${appointmentId}`);
    return { ok: true, room: `appointment:${appointmentId}` };
  }

  @SubscribeMessage('unsubscribe:appointment')
  async unsubscribeAppointment(@ConnectedSocket() socket: Socket, @MessageBody() body: { appointmentId?: string }) {
    if (body?.appointmentId) await socket.leave(`appointment:${body.appointmentId}`);
    return { ok: true };
  }

  /** Indicateur « en train d'écrire » (ex canal presence `typing:<appointmentId>`). */
  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: Socket, @MessageBody() body: { appointmentId?: string; isTyping?: boolean }) {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !body?.appointmentId || !socket.rooms.has(`appointment:${body.appointmentId}`)) return { ok: false };
    socket.to(`appointment:${body.appointmentId}`).emit('typing', { appointmentId: body.appointmentId, userId: user.id, isTyping: !!body.isTyping, at: new Date().toISOString() });
    return { ok: true };
  }

  /** Diffuse un événement applicatif (notifications système, jobs…) à un utilisateur. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  private async relay(e: TableChangeEvent): Promise<void> {
    if (!this.server) return;
    const rooms = new Set<string>();
    if (e.user_id) rooms.add(`user:${e.user_id}`);
    if (e.patient_id) rooms.add(`user:${e.patient_id}`);
    if (e.practitioner_id) rooms.add(`practitioner:${e.practitioner_id}`);
    if (e.appointment_id) rooms.add(`appointment:${e.appointment_id}`);
    if (e.table === 'appointments' && e.id) rooms.add(`appointment:${e.id}`);
    if (e.table === 'practitioner_balances' && e.id) rooms.add(`practitioner:${e.id}`);
    if (ADMIN_TABLES.has(e.table)) rooms.add('admin');
    if (e.table === 'messages' && e.appointment_id) {
      // Liste des conversations : les deux participants, même sans la conversation ouverte.
      const a = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('appointments').select(['patient_id', 'practitioner_id']).where('id', '=', e.appointment_id!).executeTakeFirst()).catch(() => undefined);
      if (a) {
        rooms.add(`user:${a.patient_id}`);
        rooms.add(`practitioner:${a.practitioner_id}`);
      }
    }
    if (rooms.size === 0) return;
    this.server.to([...rooms]).emit('change', e);
    this.stats.eventsRelayed++;
  }
}

/**
 * Étape 4 — messagerie liée aux rendez-vous, notifications in-app + préférences,
 * abonnements push, passerelle Socket.IO (relais LISTEN table_changes, typing).
 */
import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { io, Socket } from 'socket.io-client';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { DispatchService } from '../src/notifications/dispatch.service';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'true';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const emails = { patient: `msg-pat-${tag}@domicares.test`, practitioner: `msg-prat-${tag}@domicares.test`, other: `msg-oth-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const endpoint = `https://push.example.test/sub/${tag}`;

function waitFor<T>(socket: Socket, event: string, predicate: (payload: T) => boolean, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`événement ${event} non reçu en ${timeoutMs} ms`)); }, timeoutMs);
    const handler = (payload: T) => { if (predicate(payload)) { clearTimeout(timer); socket.off(event, handler); resolve(payload); } };
    socket.on(event, handler);
  });
}
function connect(url: string, token?: string): Promise<Socket> {
  const socket = io(url, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false, forceNew: true });
  return new Promise((resolve, reject) => {
    socket.once('ready', () => resolve(socket));
    socket.once('error', (e: { message: string }) => reject(new Error(e.message)));
    socket.once('disconnect', (reason) => reject(new Error(`déconnecté : ${reason}`)));
    socket.once('connect_error', reject);
  });
}

describe('Messaging, notifications & realtime (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  let baseUrl = '';
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let practitionerId = '';
  let appointmentId = '';
  let messageId = '';
  const sockets: Socket[] = [];

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function open(key: string): Promise<Socket> {
    const s = await connect(baseUrl, tokens[key]);
    sockets.push(s);
    return s;
  }

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    db = app.get(DatabaseService);
    await signup('patient', emails.patient, { phone: `+2299${suffix}5` });
    await signup('practitioner', emails.practitioner, { userType: 'practitioner', practitionerType: 'medecin' });
    await signup('other', emails.other);
    // Rendez-vous déjà confirmé (le flux complet est couvert par appointments-payments.e2e-spec.ts).
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const pr = await trx.insertInto('practitioners').values({ user_id: userIds['practitioner'], name: 'Doc Msg', specialty: 'Généraliste', kyc_status: 'approved', can_accept_missions: true }).returning('id').executeTakeFirstOrThrow();
      practitionerId = pr.id;
      const a = await trx
        .insertInto('appointments')
        .values({ patient_id: userIds['patient'], patient_name: 'User patient', practitioner_id: practitionerId, practitioner_name: 'Doc Msg', specialty: 'Généraliste', date: futureDate(3), time: '09:00', address: 'Cotonou', reason: 'Suivi', status: 'confirmed', payment_amount: 15000 })
        .returning('id')
        .executeTakeFirstOrThrow();
      appointmentId = a.id;
    });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = Object.values(userIds);
      await sql`delete from public.messages where appointment_id = ${appointmentId}`.execute(trx);
      await sql`delete from public.appointments where id = ${appointmentId}`.execute(trx);
      await sql`delete from public.push_subscriptions where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.notification_preferences where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.notifications where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.file_access_logs where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
    });
    await app.close();
  });

  it('la conversation existe pour les deux participants, pas pour un tiers', async () => {
    const patient = await app.inject({ method: 'GET', url: '/api/conversations', headers: auth('patient') });
    expect(patient.statusCode).toBe(200);
    expect(patient.json().conversations).toEqual([expect.objectContaining({ appointment_id: appointmentId, practitioner_name: 'Doc Msg', last_message: 'Aucun message', unread_count: 0 })]);
    const practitioner = await app.inject({ method: 'GET', url: '/api/conversations', headers: auth('practitioner') });
    expect(practitioner.json().conversations.map((c: { appointment_id: string }) => c.appointment_id)).toEqual([appointmentId]);
    const other = await app.inject({ method: 'GET', url: '/api/conversations', headers: auth('other') });
    expect(other.json().conversations).toEqual([]);
    const forbidden = await app.inject({ method: 'GET', url: `/api/conversations/${appointmentId}/messages`, headers: auth('other') });
    expect(forbidden.statusCode).toBe(403);
    const anonymous = await app.inject({ method: 'GET', url: '/api/conversations' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('envoi d’un message → non-lu chez le destinataire, notification push in-app, puis lecture', async () => {
    const empty = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('patient'), payload: { content: '   ' } });
    expect(empty.statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('patient'), payload: { content: 'Bonjour docteur' } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ appointment_id: appointmentId, sender_id: userIds['patient'], content: 'Bonjour docteur', is_read: false });
    messageId = res.json().id;

    const unread = await app.inject({ method: 'GET', url: '/api/conversations/unread-count', headers: auth('practitioner') });
    expect(unread.json()).toEqual({ unread: 1 });
    expect((await app.inject({ method: 'GET', url: '/api/conversations/unread-count', headers: auth('patient') })).json()).toEqual({ unread: 0 });
    const list = await app.inject({ method: 'GET', url: '/api/conversations', headers: auth('practitioner') });
    expect(list.json().conversations[0]).toMatchObject({ last_message: 'Bonjour docteur', unread_count: 1 });

    const notif = await app.inject({ method: 'GET', url: '/api/notifications?unreadOnly=true', headers: auth('practitioner') });
    expect(notif.json()).toEqual([expect.objectContaining({ type: 'message', title: 'Nouveau message de User patient', message: 'Bonjour docteur', is_read: false })]);

    const messages = await app.inject({ method: 'GET', url: `/api/conversations/${appointmentId}/messages`, headers: auth('practitioner') });
    expect(messages.json().map((m: { id: string }) => m.id)).toEqual([messageId]);
    const read = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/read`, headers: auth('practitioner') });
    expect(read.json()).toEqual({ updated: 1 });
    expect((await app.inject({ method: 'GET', url: '/api/conversations/unread-count', headers: auth('practitioner') })).json()).toEqual({ unread: 0 });
    const sendForbidden = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('other'), payload: { content: 'Intrus' } });
    expect(sendForbidden.statusCode).toBe(403);
  });

  it('pièce jointe : dossier message-attachments de l’expéditeur, lisible par le destinataire seulement', async () => {
    const forged = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('practitioner'), payload: { content: '', attachment: { filePath: `documents/${userIds['patient']}/secret.pdf` } } });
    expect(forged.statusCode).toBe(403);
    const upload = await app.inject({ method: 'POST', url: '/api/files/upload-url', headers: auth('practitioner'), payload: { fileName: 'ordonnance.pdf', contentType: 'application/pdf', fileSize: 512, folder: 'message-attachments' } });
    expect(upload.statusCode).toBe(200);
    const filePath: string = upload.json().filePath;
    expect(filePath.startsWith(`message-attachments/${userIds['practitioner']}/`)).toBe(true);
    const sent = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('practitioner'), payload: { content: '', attachment: { filePath, type: 'application/pdf', name: 'ordonnance.pdf', size: 512 } } });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ attachment_url: filePath, attachment_name: 'ordonnance.pdf', attachment_size: 512 });
    const q = `/api/files/url?filePath=${encodeURIComponent(filePath)}`;
    expect((await app.inject({ method: 'GET', url: q, headers: auth('patient') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: q, headers: auth('other') })).statusCode).toBe(403);
    const before = await app.inject({ method: 'GET', url: `/api/conversations/${appointmentId}/messages?before=${encodeURIComponent(sent.json().created_at)}&limit=10`, headers: auth('patient') });
    expect(before.json().map((m: { id: string }) => m.id)).toEqual([messageId]);
  });

  it('notifications : liste, lecture, tout lire, suppression, préférences', async () => {
    const dispatch = app.get(DispatchService);
    // Le patient a déjà reçu la notification « Nouveau message de Doc Msg » (pièce jointe du test précédent).
    expect((await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: auth('patient') })).json()).toEqual({ updated: 1 });
    const r = await dispatch.dispatch({ userId: userIds['patient'], title: 'Rappel', message: 'Votre rendez-vous est demain', type: 'appointment', link: '/dashboard' });
    expect(r.channels.email).toMatchObject({ attempted: true, success: true });
    expect(r.channels.sms).toMatchObject({ attempted: true, success: true });
    expect(r.channels.push).toMatchObject({ attempted: false, skipped: true, error: 'no_subscription' });

    expect((await app.inject({ method: 'GET', url: '/api/notifications/unread-count', headers: auth('patient') })).json()).toEqual({ unread: 1 });
    const markRead = await app.inject({ method: 'POST', url: `/api/notifications/${r.notificationId}/read`, headers: auth('patient') });
    expect(markRead.statusCode).toBe(200);
    expect(markRead.json().is_read).toBe(true);
    const notMine = await app.inject({ method: 'POST', url: `/api/notifications/${r.notificationId}/read`, headers: auth('other') });
    expect(notMine.statusCode).toBe(404);

    await dispatch.dispatch({ userId: userIds['patient'], title: 'Deuxième', message: 'x', channels: [] });
    expect((await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: auth('patient') })).json()).toEqual({ updated: 1 });
    expect((await app.inject({ method: 'DELETE', url: `/api/notifications/${r.notificationId}`, headers: auth('patient') })).json()).toEqual({ deleted: true });
    expect((await app.inject({ method: 'GET', url: '/api/notifications', headers: auth('patient') })).json()).toHaveLength(2);

    const defaults = await app.inject({ method: 'GET', url: '/api/notifications/preferences', headers: auth('patient') });
    expect(defaults.json()).toMatchObject({ email_enabled: true, push_enabled: true });
    const updated = await app.inject({ method: 'PUT', url: '/api/notifications/preferences', headers: auth('patient'), payload: { emailEnabled: false, smsEnabled: false } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ user_id: userIds['patient'], email_enabled: false, sms_enabled: false, push_enabled: true });
    const again = await app.inject({ method: 'PUT', url: '/api/notifications/preferences', headers: auth('patient'), payload: { pushEnabled: false } });
    expect(again.json()).toMatchObject({ email_enabled: false, sms_enabled: false, push_enabled: false });
    const silenced = await dispatch.dispatch({ userId: userIds['patient'], title: 'Silencieux', message: 'x' });
    expect(silenced.channels).toMatchObject({ email: { skipped: true }, sms: { skipped: true }, push: { skipped: true } });
    await app.inject({ method: 'PUT', url: '/api/notifications/preferences', headers: auth('patient'), payload: { pushEnabled: true } });
  });

  it('push : clé VAPID, abonnement (upsert), envoi console, désabonnement', async () => {
    const vapid = await app.inject({ method: 'GET', url: '/api/push/vapid-public-key' });
    expect(vapid.statusCode).toBe(200);
    expect(vapid.json()).toEqual({ publicKey: null });
    const bad = await app.inject({ method: 'POST', url: '/api/push/subscriptions', headers: auth('patient'), payload: { endpoint: 'not-a-url', keys: { p256dh: 'p256dh-key-value', auth: 'auth-key' } } });
    expect(bad.statusCode).toBe(400);
    const sub = await app.inject({ method: 'POST', url: '/api/push/subscriptions', headers: auth('patient'), payload: { endpoint, keys: { p256dh: 'p256dh-key-value', auth: 'auth-key' }, userAgent: 'jest' } });
    expect(sub.statusCode).toBe(201);
    const same = await app.inject({ method: 'POST', url: '/api/push/subscriptions', headers: auth('patient'), payload: { endpoint, keys: { p256dh: 'p256dh-key-value-2', auth: 'auth-key-2' } } });
    expect(same.json().id).toBe(sub.json().id);
    const rows = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('push_subscriptions').select(['p256dh', 'user_agent']).where('user_id', '=', userIds['patient']).execute());
    // Upsert : les clés et le user-agent (ici celui de l'injection Fastify, faute de userAgent explicite) sont rafraîchis.
    expect(rows).toEqual([{ p256dh: 'p256dh-key-value-2', user_agent: 'lightMyRequest' }]);

    const r = await app.get(DispatchService).dispatch({ userId: userIds['patient'], title: 'Push', message: 'Hello', channels: ['push'] });
    expect(r.channels.push).toMatchObject({ attempted: true, success: true });
    expect(r.channels.email.skipped).toBe(true);

    const unsub = await app.inject({ method: 'DELETE', url: '/api/push/subscriptions', headers: auth('patient'), payload: { endpoint } });
    expect(unsub.json()).toEqual({ deleted: 1 });
    expect((await app.inject({ method: 'DELETE', url: '/api/push/subscriptions', headers: auth('patient'), payload: { endpoint } })).json()).toEqual({ deleted: 0 });
  });

  it('Socket.IO : authentification JWT obligatoire, rooms et abonnement à un rendez-vous', async () => {
    await expect(connect(baseUrl)).rejects.toThrow(/Authentification requise|déconnecté/);
    await expect(connect(baseUrl, 'jeton.invalide.xyz')).rejects.toThrow(/Authentification requise|déconnecté/);
    const patient = await open('patient');
    const practitioner = await open('practitioner');
    const other = await open('other');
    const okPatient = await patient.emitWithAck('subscribe:appointment', { appointmentId });
    expect(okPatient).toEqual({ ok: true, room: `appointment:${appointmentId}` });
    expect(await practitioner.emitWithAck('subscribe:appointment', { appointmentId })).toMatchObject({ ok: true });
    expect(await other.emitWithAck('subscribe:appointment', { appointmentId })).toEqual({ ok: false, error: 'Accès refusé' });
    expect(await other.emitWithAck('subscribe:appointment', {})).toMatchObject({ ok: false });
  });

  it('Socket.IO : un message HTTP est relayé en temps réel via LISTEN table_changes', async () => {
    const [patient, practitioner, other] = sockets;
    const otherGot: unknown[] = [];
    other.on('change', (e) => otherGot.push(e));
    const patientChange = waitFor<{ table: string; op: string; appointment_id?: string; id?: string }>(patient, 'change', (e) => e.table === 'messages' && e.op === 'INSERT');
    const practitionerChange = waitFor<{ table: string; op: string }>(practitioner, 'change', (e) => e.table === 'messages' && e.op === 'INSERT');
    const notifChange = waitFor<{ table: string; user_id?: string }>(practitioner, 'change', (e) => e.table === 'notifications' && e.user_id === userIds['practitioner']);
    const res = await app.inject({ method: 'POST', url: `/api/conversations/${appointmentId}/messages`, headers: auth('patient'), payload: { content: 'Temps réel ?' } });
    expect(res.statusCode).toBe(201);
    const e = await patientChange;
    expect(e).toMatchObject({ table: 'messages', op: 'INSERT', id: res.json().id, appointment_id: appointmentId });
    await practitionerChange;
    await notifChange;
    await new Promise((r) => setTimeout(r, 200));
    expect(otherGot).toEqual([]);
  });

  it('Socket.IO : indicateur « en train d’écrire » relayé aux autres participants', async () => {
    const [patient, practitioner, other] = sockets;
    const typing = waitFor<{ appointmentId: string; userId: string; isTyping: boolean }>(practitioner, 'typing', () => true);
    expect(await patient.emitWithAck('typing', { appointmentId, isTyping: true })).toEqual({ ok: true });
    expect(await typing).toMatchObject({ appointmentId, userId: userIds['patient'], isTyping: true });
    expect(await other.emitWithAck('typing', { appointmentId, isTyping: true })).toEqual({ ok: false });
    expect(await patient.emitWithAck('unsubscribe:appointment', { appointmentId })).toEqual({ ok: true });
    expect(await patient.emitWithAck('typing', { appointmentId, isTyping: false })).toEqual({ ok: false });
  });
});

/**
 * Étape 5 — administration : rôles, utilisateurs, statistiques, journal d'audit, activité de recherche,
 * OTP, configuration système, consentements, modération des avis.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.FEDAPAY_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'console';
process.env.REALTIME_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const emails = { root: `adm-root-${tag}@domicares.test`, finance: `adm-fin-${tag}@domicares.test`, patient: `adm-pat-${tag}@domicares.test`, victim: `adm-del-${tag}@domicares.test`, testAccount: `adm-keep-${tag}@test.com`, newAdmin: `adm-new-${tag}@domicares.test` };
const password = 'Motdepasse#2026';
const otpPhone = `+2296${suffix}1`;

describe('Admin (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let newAdminId = '';
  let tempPassword = '';
  let consentVersionId = '';

  const auth = (k: string) => ({ authorization: `Bearer ${tokens[k]}` });
  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  async function login(email: string, pwd: string) {
    return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: pwd } });
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    await signup('root', emails.root);
    await signup('finance', emails.finance);
    await signup('patient', emails.patient, { phone: `+2299${suffix}8` });
    await signup('victim', emails.victim);
    await signup('testAccount', emails.testAccount);
    await db.db.insertInto('user_roles').values([{ user_id: userIds['root'], role: 'super_admin' }, { user_id: userIds['finance'], role: 'finance' }]).execute();
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      const ids = [...Object.values(userIds), newAdminId].filter(Boolean);
      await sql`delete from public.admin_audit_logs where admin_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.consent_versions where id = ${consentVersionId || '00000000-0000-0000-0000-000000000000'}::uuid or created_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.system_config where key = ${'e2e_' + tag}`.execute(trx);
      await sql`delete from public.search_activity_logs where session_id like ${'e2e-' + tag + '%'}`.execute(trx);
      await sql`delete from public.otp_attempts where phone_number = ${otpPhone}`.execute(trx);
      await sql`delete from public.otp_rate_limits where phone_number = ${otpPhone}`.execute(trx);
      await sql`delete from public.user_roles where user_id = any(${ids}::uuid[]) or created_by = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where id = any(${ids}::uuid[])`.execute(trx);
    });
    await app.close();
  });

  it('statistiques publiques et tableau de bord ; rôles de l’utilisateur courant', async () => {
    const pub = await app.inject({ method: 'GET', url: '/api/stats/public' });
    expect(pub.statusCode).toBe(200);
    expect(typeof pub.json().practitioners_count).toBe('number');
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats', headers: auth('patient') })).statusCode).toBe(403);
    const stats = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: auth('finance') });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().patients_count).toBeGreaterThanOrEqual(2);
    const roles = await app.inject({ method: 'GET', url: '/api/admin/me/roles', headers: auth('root') });
    expect(roles.json()).toEqual({ roles: ['super_admin'], isSuperAdmin: true });
  });

  it('gestion des administrateurs : création (mot de passe temporaire), rôle ajouté à un compte existant, réservé au super admin', async () => {
    const forbidden = await app.inject({ method: 'POST', url: '/api/admin/admins', headers: auth('finance'), payload: { email: emails.newAdmin, role: 'ops', fullName: 'Ops Nouveau' } });
    expect(forbidden.statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/admin/admins', headers: auth('root'), payload: { email: emails.newAdmin, role: 'ops', fullName: 'Ops Nouveau', phone: '+22961000000' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().tempPassword).toBeTruthy();
    newAdminId = created.json().userId;
    tempPassword = created.json().tempPassword;
    const loginNew = await login(emails.newAdmin, tempPassword);
    expect(loginNew.statusCode).toBe(200);
    expect(loginNew.json().user.metadata.must_change_password).toBe(true);
    const asNew = await app.inject({ method: 'GET', url: '/api/admin/me/roles', headers: { authorization: `Bearer ${loginNew.json().accessToken}` } });
    expect(asNew.json().roles).toEqual(['ops']);
    const dup = await app.inject({ method: 'POST', url: '/api/admin/admins', headers: auth('root'), payload: { email: emails.newAdmin, role: 'support', fullName: 'Ops Nouveau' } });
    expect(dup.statusCode).toBe(409);
    const existing = await app.inject({ method: 'POST', url: '/api/admin/admins', headers: auth('root'), payload: { email: emails.patient, role: 'support', fullName: 'Patient promu' } });
    expect(existing.statusCode).toBe(201);
    expect(existing.json().tempPassword).toBeUndefined();
    const list = await app.inject({ method: 'GET', url: '/api/admin/admins', headers: auth('root') });
    expect(list.json().map((a: { email: string }) => a.email)).toEqual(expect.arrayContaining([emails.root, emails.finance, emails.newAdmin, emails.patient]));
  });

  it('réinitialisation du mot de passe et retrait des rôles', async () => {
    const reset = await app.inject({ method: 'POST', url: `/api/admin/admins/${newAdminId}/reset-password`, headers: auth('root') });
    expect(reset.statusCode).toBe(200);
    expect((await login(emails.newAdmin, tempPassword)).statusCode).toBe(401);
    expect((await login(emails.newAdmin, reset.json().newPassword)).statusCode).toBe(200);
    const self = await app.inject({ method: 'DELETE', url: `/api/admin/admins/${userIds['root']}`, headers: auth('root'), payload: { reason: 'test' } });
    expect(self.statusCode).toBe(400);
    const revoked = await app.inject({ method: 'DELETE', url: `/api/admin/admins/${userIds['patient']}`, headers: auth('root'), payload: { reason: 'Fin de mission' } });
    expect(revoked.json()).toMatchObject({ success: true, rolesRemoved: ['support'] });
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats', headers: auth('patient') })).statusCode).toBe(403);
    expect((await login(emails.patient, password)).statusCode).toBe(200);
    const audit = await app.inject({ method: 'GET', url: `/api/admin/audit-logs?adminId=${userIds['root']}`, headers: auth('root') });
    expect(audit.json().data.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['create_admin', 'reset_password', 'disable_admin']));
    const filters = await app.inject({ method: 'GET', url: '/api/admin/audit-logs/filters', headers: auth('finance') });
    expect(filters.json().actions).toEqual(expect.arrayContaining(['create_admin']));
    expect(filters.json().stats.today).toBeGreaterThanOrEqual(3);
  });

  it('utilisateurs : liste des patients et praticiens, fiche patient, suppression protégée', async () => {
    const patients = await app.inject({ method: 'GET', url: `/api/admin/users/patients?search=${encodeURIComponent(emails.victim)}`, headers: auth('finance') });
    expect(patients.json().count).toBe(1);
    expect(patients.json().data[0]).toMatchObject({ id: userIds['victim'], email: emails.victim });
    const one = await app.inject({ method: 'GET', url: `/api/admin/users/patients/${userIds['victim']}`, headers: auth('finance') });
    expect(one.json()).toMatchObject({ email: emails.victim, addresses: [], emergency_contacts: [], medical_profile: null });
    expect((await app.inject({ method: 'GET', url: '/api/admin/users/practitioners', headers: auth('finance') })).statusCode).toBe(200);
    const notAllowed = await app.inject({ method: 'DELETE', url: `/api/admin/users/${userIds['victim']}`, headers: auth('finance'), payload: { confirm: 'SUPPRIMER', userType: 'patient' } });
    expect(notAllowed.statusCode).toBe(403);
    const badConfirm = await app.inject({ method: 'DELETE', url: `/api/admin/users/${userIds['victim']}`, headers: auth('root'), payload: { confirm: 'oui' } });
    expect(badConfirm.statusCode).toBe(400);
    const testProtected = await app.inject({ method: 'DELETE', url: `/api/admin/users/${userIds['testAccount']}`, headers: auth('root'), payload: { confirm: 'SUPPRIMER' } });
    expect(testProtected.statusCode).toBe(403);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/admin/users/${userIds['victim']}`, headers: auth('root'), payload: { confirm: 'SUPPRIMER', userType: 'patient' } });
    expect(deleted.statusCode).toBe(200);
    expect(await db.db.selectFrom('users').select('id').where('id', '=', userIds['victim']).executeTakeFirst()).toBeUndefined();
    const audit = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('admin_audit_logs').select('details').where('action', '=', 'delete_patient').where('entity_id', '=', userIds['victim']).executeTakeFirst());
    expect(audit?.details).toMatchObject({ deleted_by: emails.root });
  });

  it('activité de recherche : journalisation anonyme et connectée, statistiques', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/search-activity', payload: { sessionId: `e2e-${tag}-anon`, actionType: 'view_practitioner_details', metadata: { practitioner_name: 'Doc Test' } } });
    expect(anon.statusCode).toBe(202);
    const authed = await app.inject({ method: 'POST', url: '/api/search-activity', headers: auth('patient'), payload: { sessionId: `e2e-${tag}-user`, actionType: 'click_appointment', searchFilters: { category: 'medecin' } } });
    expect(authed.statusCode).toBe(202);
    const list = await app.inject({ method: 'GET', url: '/api/admin/search-activity?days=1&userType=authenticated&limit=100', headers: auth('root') });
    const mine = list.json().data.filter((l: { session_id: string }) => l.session_id.startsWith(`e2e-${tag}`));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ user_id: userIds['patient'], action_type: 'click_appointment' });
    expect(list.json().stats.total).toBeGreaterThanOrEqual(2);
  });

  it('OTP : numéros bloqués, réinitialisation avec audit, suppression d’une tentative', async () => {
    await db.runAs({ role: 'service_role' }, (trx) => trx.insertInto('otp_attempts').values([1, 2, 3].map(() => ({ phone_number: otpPhone, channel: 'sms', status: 'failed' }))).execute());
    const blocked = await app.inject({ method: 'GET', url: '/api/admin/otp/blocked', headers: auth('root') });
    expect(blocked.json().find((b: { phone_number: string }) => b.phone_number === otpPhone)).toMatchObject({ attempts: 3 });
    const attempts = await app.inject({ method: 'GET', url: `/api/admin/otp/attempts?phone=${encodeURIComponent(otpPhone)}`, headers: auth('root') });
    expect(attempts.json().count).toBe(3);
    const del = await app.inject({ method: 'DELETE', url: `/api/admin/otp/attempts/${attempts.json().data[0].id}`, headers: auth('root') });
    expect(del.json().success).toBe(true);
    const stats = await app.inject({ method: 'GET', url: '/api/admin/otp/stats', headers: auth('root') });
    expect(stats.json().total).toBeGreaterThanOrEqual(2);
    const reset = await app.inject({ method: 'POST', url: '/api/admin/otp/reset', headers: auth('root'), payload: { phone: otpPhone } });
    expect(reset.json()).toEqual({ success: true, deleted: 2 });
    const audit = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('admin_audit_logs').select('entity_id').where('action', '=', 'reset_otp_attempts').where('admin_id', '=', userIds['root']).executeTakeFirst());
    expect(audit?.entity_id).toBe(otpPhone);
  });

  it('configuration système et versions de consentement (activation exclusive, version publique)', async () => {
    const key = `e2e_${tag}`;
    const created = await app.inject({ method: 'PUT', url: `/api/admin/system-config/${key}`, headers: auth('finance'), payload: { value: { mode: 'sandbox' }, description: 'test' } });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ key, value: { mode: 'sandbox' } });
    const updated = await app.inject({ method: 'PUT', url: `/api/admin/system-config/${key}`, headers: auth('finance'), payload: { value: { mode: 'live' } } });
    expect(updated.json().value).toEqual({ mode: 'live' });
    const list = await app.inject({ method: 'GET', url: '/api/admin/system-config', headers: auth('finance') });
    expect(list.json().some((c: { key: string }) => c.key === key)).toBe(true);

    const v1 = await app.inject({ method: 'POST', url: '/api/admin/consent-versions', headers: auth('root'), payload: { consentType: 'marketing', version: `${tag}-1`, content: 'Version 1' } });
    expect(v1.statusCode).toBe(201);
    consentVersionId = v1.json().id;
    const v2 = await app.inject({ method: 'POST', url: '/api/admin/consent-versions', headers: auth('root'), payload: { consentType: 'marketing', version: `${tag}-2`, content: 'Version 2' } });
    expect((await app.inject({ method: 'POST', url: '/api/admin/consent-versions', headers: auth('root'), payload: { consentType: 'marketing', version: `${tag}-2`, content: 'dup' } })).statusCode).toBe(409);
    await app.inject({ method: 'POST', url: `/api/admin/consent-versions/${consentVersionId}/activate`, headers: auth('root') });
    const act2 = await app.inject({ method: 'POST', url: `/api/admin/consent-versions/${v2.json().id}/activate`, headers: auth('root') });
    expect(act2.json().is_active).toBe(true);
    const versions = await app.inject({ method: 'GET', url: '/api/admin/consent-versions?type=marketing', headers: auth('root') });
    expect(versions.json().filter((v: { is_active: boolean }) => v.is_active)).toHaveLength(1);
    const active = await app.inject({ method: 'GET', url: '/api/consents/marketing/active' });
    expect(active.json()).toMatchObject({ id: v2.json().id, version: `${tag}-2` });
    const stats = await app.inject({ method: 'GET', url: '/api/admin/consents/stats', headers: auth('root') });
    expect(stats.statusCode).toBe(200);
    const audit = await app.inject({ method: 'GET', url: '/api/admin/audit-logs?entityType=consent_version&limit=10', headers: auth('root') });
    expect(audit.json().data.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['create_consent_version', 'activate_consent_version']));
    await sql`delete from public.consent_versions where id = ${v2.json().id}::uuid`.execute(db.db);
  });

  it('opérations : rendez-vous du jour, modération d’un avis, usage API', async () => {
    const today = await app.inject({ method: 'GET', url: '/api/admin/operations/appointments', headers: auth('root') });
    expect(today.statusCode).toBe(200);
    expect(Array.isArray(today.json())).toBe(true);
    const reviews = await app.inject({ method: 'GET', url: '/api/admin/operations/reviews', headers: auth('root') });
    expect(reviews.statusCode).toBe(200);
    expect(typeof reviews.json().count).toBe('number');
    const missing = await app.inject({ method: 'POST', url: '/api/admin/operations/reviews/00000000-0000-0000-0000-000000000000/moderate', headers: auth('root'), payload: { isHidden: true, reason: 'spam' } });
    expect(missing.statusCode).toBe(404);
    const usage = await app.inject({ method: 'GET', url: '/api/admin/api/usage', headers: auth('root') });
    expect(usage.json()).toMatchObject({ fedapay: expect.any(Object), twilio: expect.any(Object), storage: expect.any(Object) });
  });
});

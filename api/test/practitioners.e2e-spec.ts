/**
 * Étape 2 — praticiens, fichiers, KYC (base PostgreSQL réelle, stockage factice).
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'kysely';
import { createApp } from '../src/app.factory';
import { DatabaseService } from '../src/database/database.service';
import { FakeStorageProvider } from '../src/storage/storage.provider';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-test-secret-test-secret-123456';
process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
process.env.OTP_PROVIDER = 'fake';
process.env.EMAIL_PROVIDER = 'console';
process.env.SMS_PROVIDER = 'console';
process.env.STORAGE_PROVIDER = 'fake';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://domicares_app:devpass@localhost:5433/domicares_dev';

const tag = Date.now().toString(36);
const suffix = String(Date.now()).slice(-6);
const practitionerEmail = `prat-${tag}@domicares.test`;
const coachEmail = `coach-${tag}@domicares.test`;
const adminEmail = `admin-${tag}@domicares.test`;
const patientEmail = `pat-${tag}@domicares.test`;
const password = 'Motdepasse#2026';
const practitionerPhone = `+2297${suffix}1`;
const coachPhone = `+2297${suffix}2`;

// Vrais octets (magic bytes) : validation de decodeDataUrl.
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake\n').toString('base64');
const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32)]).toString('base64');
const badJpg = 'data:image/jpeg;base64,' + Buffer.from('not a jpeg at all').toString('base64');

describe('Practitioners, files, KYC (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DatabaseService;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let practitionerId = '';
  let idDocumentPath = '';

  async function signup(key: string, email: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password, fullName: `User ${key}`, ...extra } });
    expect(res.statusCode).toBe(201);
    tokens[key] = res.json().session.accessToken;
    userIds[key] = res.json().user.id;
  }
  const auth = (key: string) => ({ authorization: `Bearer ${tokens[key]}` });

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get(DatabaseService);
    await signup('practitioner', practitionerEmail, { userType: 'practitioner', practitionerType: 'medecin' });
    await signup('coach', coachEmail, { userType: 'practitioner', practitionerType: 'coach_sportif' });
    await signup('admin', adminEmail);
    await signup('patient', patientEmail);
    await db.db.insertInto('user_roles').values({ user_id: userIds['admin'], role: 'compliance' }).execute();
  });

  afterAll(async () => {
    if (!db) return;
    await db.runAs({ role: 'service_role' }, async (trx) => {
      // practitioners.kyc_reviewed_by référence l'admin sans cascade : supprimer les praticiens d'abord.
      const ids = Object.values(userIds);
      // files.user_id et file_access_logs.file_id n'ont pas de cascade non plus.
      await sql`delete from public.file_access_logs where user_id = any(${ids}::uuid[]) or file_id in (select id from public.files where user_id = any(${ids}::uuid[]))`.execute(trx);
      await sql`delete from public.files where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.practitioners where user_id = any(${ids}::uuid[])`.execute(trx);
      await sql`delete from public.users where email in (${practitionerEmail}, ${coachEmail}, ${adminEmail}, ${patientEmail})`.execute(trx);
    });
    await app.close();
  });

  it('un compte inscrit comme praticien sans enregistrement est "incomplete_practitioner"', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth('practitioner') });
    expect(res.json()).toMatchObject({ role: 'incomplete_practitioner', practitionerType: 'medecin' });
  });

  it('refuse un praticien de santé sans autorisation d’exercice et un coach sans diplôme (400)', async () => {
    const base = { profile: { fullName: 'Doc Test', phone: practitionerPhone }, practitioner: { name: 'Doc Test', phone: practitionerPhone, specialty: 'Généraliste', practitionerType: 'medecin' } };
    const noLicense = await app.inject({ method: 'POST', url: '/api/practitioners/register', headers: auth('practitioner'), payload: { ...base, documents: { idDocument: pdf } } });
    expect(noLicense.statusCode).toBe(400);
    expect(JSON.stringify(noLicense.json().details)).toContain('licenseDocument');
    const coachNoDiploma = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('coach'),
      payload: { profile: { fullName: 'Coach Test', phone: coachPhone }, practitioner: { name: 'Coach Test', phone: coachPhone, specialty: 'Fitness', practitionerType: 'coach_sportif' }, documents: { idDocument: pdf } },
    });
    expect(coachNoDiploma.statusCode).toBe(400);
    expect(JSON.stringify(coachNoDiploma.json().details)).toMatch(/sessionTypes|diploma|interventionZone/);
  });

  it('rejette un document dont le contenu ne correspond pas au type (magic bytes)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('practitioner'),
      payload: { profile: { fullName: 'Doc Test', phone: practitionerPhone }, practitioner: { name: 'Doc Test', phone: practitionerPhone, specialty: 'Généraliste', practitionerType: 'medecin' }, documents: { idDocument: badJpg, licenseDocument: pdf } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/ne correspond pas/);
  });

  it('inscrit le praticien atomiquement : profil, praticien pending, fichiers, notification admin', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('practitioner'),
      payload: {
        profile: { fullName: 'Doc Test', phone: practitionerPhone, gender: 'femme', dateOfBirth: '1985-04-12' },
        practitioner: { name: 'Doc Test', phone: practitionerPhone, specialty: 'Généraliste', practitionerType: 'medecin', address: 'Cotonou', latitude: 6.3703, longitude: 2.3912, yearsExperience: 8, licenseNumber: 'ORD-123' },
        documents: { idDocument: pdf, licenseDocument: pdf, profilePhoto: png },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true, alreadyExists: false, practitioner: { kyc_status: 'pending' } });
    practitionerId = res.json().practitioner.id;

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth('practitioner') });
    expect(me.json()).toMatchObject({ role: 'practitioner', practitioner: { kycStatus: 'pending', canAcceptMissions: false } });
    expect(me.json().profile).toMatchObject({ full_name: 'Doc Test', phone: practitionerPhone, gender: 'femme' });

    const own = await app.inject({ method: 'GET', url: '/api/practitioners/me', headers: auth('practitioner') });
    expect(own.statusCode).toBe(200);
    idDocumentPath = own.json().id_document_url;
    expect(idDocumentPath).toMatch(new RegExp(`^documents/${userIds['practitioner']}/`));
    expect(own.json().image).toMatch(new RegExp(`^avatars/${userIds['practitioner']}/`));
    expect(app.get(FakeStorageProvider).objects.size).toBeGreaterThanOrEqual(3);

    const files = await app.inject({ method: 'GET', url: '/api/files', headers: auth('practitioner') });
    expect(files.json().length).toBe(3);

    const adminNotif = await db.db.selectFrom('notifications').selectAll().where('user_id', '=', userIds['admin']).where('type', '=', 'kyc').executeTakeFirst();
    expect(adminNotif?.title).toBe('Nouvelle demande KYC');

    const again = await app.inject({ method: 'POST', url: '/api/practitioners/register', headers: auth('practitioner'), payload: { profile: { fullName: 'Doc Test', phone: practitionerPhone }, practitioner: { name: 'Doc Test', phone: practitionerPhone, specialty: 'Généraliste', practitionerType: 'medecin' }, documents: { idDocument: pdf, licenseDocument: pdf } } });
    expect(again.json().alreadyExists).toBe(true);
  });

  it('refuse un second praticien avec le même téléphone (409)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/practitioners/register', headers: auth('coach'),
      payload: { profile: { fullName: 'Coach Test', phone: practitionerPhone }, practitioner: { name: 'Coach Test', phone: practitionerPhone, specialty: 'Fitness', practitionerType: 'coach_sportif', sessionTypes: ['individuelle'], interventionZone: 'Cotonou', interventionRadius: 15 }, documents: { idDocument: pdf, diploma: pdf } },
    });
    expect(res.statusCode).toBe(409);
  });

  it('URL signée : propriétaire et admin OK, autre utilisateur 403, journal file_access_logs', async () => {
    const owner = await app.inject({ method: 'GET', url: `/api/files/url?filePath=${encodeURIComponent(idDocumentPath)}`, headers: auth('practitioner') });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().url).toContain('storage.fake/documents/');
    const admin = await app.inject({ method: 'GET', url: `/api/files/url?filePath=${encodeURIComponent(idDocumentPath)}`, headers: auth('admin') });
    expect(admin.statusCode).toBe(200);
    const other = await app.inject({ method: 'GET', url: `/api/files/url?filePath=${encodeURIComponent(idDocumentPath)}`, headers: auth('patient') });
    expect(other.statusCode).toBe(403);
    const logs = await db.runAs({ role: 'service_role' }, (trx) => trx.selectFrom('file_access_logs').select('id').where('user_id', 'in', [userIds['practitioner'], userIds['admin']]).execute());
    expect(logs.length).toBe(2);
  });

  it('flux navigateur → S3 : upload-url puis enregistrement ; chemin d’un autre utilisateur refusé', async () => {
    const url = await app.inject({ method: 'POST', url: '/api/files/upload-url', headers: auth('patient'), payload: { fileName: 'ordonnance.pdf', contentType: 'application/pdf', fileSize: 1234, folder: 'documents' } });
    expect(url.statusCode).toBe(200);
    expect(url.json()).toMatchObject({ method: 'PUT', bucket: 'documents' });
    expect(url.json().filePath).toMatch(new RegExp(`^documents/${userIds['patient']}/\\d+-ordonnance.pdf$`));
    const reg = await app.inject({ method: 'POST', url: '/api/files', headers: auth('patient'), payload: { filePath: url.json().filePath, fileName: 'ordonnance.pdf', fileSize: 1234, fileType: 'application/pdf' } });
    expect(reg.statusCode).toBe(201);
    const forged = await app.inject({ method: 'POST', url: '/api/files', headers: auth('patient'), payload: { filePath: idDocumentPath, fileName: 'x.pdf', fileSize: 1 } });
    expect(forged.statusCode).toBe(403);
    const badType = await app.inject({ method: 'POST', url: '/api/files/upload-url', headers: auth('patient'), payload: { fileName: 'virus.exe', contentType: 'application/x-msdownload', fileSize: 10 } });
    expect(badType.statusCode).toBe(400);
    const legacy = await app.inject({ method: 'POST', url: '/api/files/upload', headers: auth('patient'), payload: { fileName: 'photo.png', fileContent: png, contentType: 'image/png', folder: 'avatars' } });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().filePath).toMatch(/^avatars\//);
  });

  it('le praticien en attente n’apparaît pas dans la liste publique', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/practitioners?type=medecin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().find((p: { id: string }) => p.id === practitionerId)).toBeUndefined();
    const one = await app.inject({ method: 'GET', url: `/api/practitioners/${practitionerId}` });
    expect(one.statusCode).toBe(404);
  });

  it('KYC : réservé aux admins ; verrou optimiste ; approbation via approve_practitioner_kyc()', async () => {
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/kyc/queue', headers: auth('patient') });
    expect(forbidden.statusCode).toBe(403);
    const queue = await app.inject({ method: 'GET', url: '/api/admin/kyc/queue', headers: auth('admin') });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().some((p: { id: string }) => p.id === practitionerId)).toBe(true);

    const stale = await app.inject({ method: 'POST', url: `/api/admin/kyc/${practitionerId}/decision`, headers: auth('admin'), payload: { status: 'approved', expectedCurrentStatus: 'incomplete' } });
    expect(stale.statusCode).toBe(409);
    const noComment = await app.inject({ method: 'POST', url: `/api/admin/kyc/${practitionerId}/decision`, headers: auth('admin'), payload: { status: 'rejected' } });
    expect(noComment.statusCode).toBe(400);

    const approved = await app.inject({ method: 'POST', url: `/api/admin/kyc/${practitionerId}/decision`, headers: auth('admin'), payload: { status: 'approved', expectedCurrentStatus: 'pending' } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({ status: 'approved', emailSent: true, smsSent: true });

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth('practitioner') });
    expect(me.json().practitioner).toMatchObject({ kycStatus: 'approved', canAcceptMissions: true });
    const row = await db.db.selectFrom('practitioners').select(['kyc_reviewed_by', 'kyc_validated_at']).where('id', '=', practitionerId).executeTakeFirstOrThrow();
    expect(row.kyc_reviewed_by).toBe(userIds['admin']);
    expect(row.kyc_validated_at).not.toBeNull();
    const notif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['practitioner']).where('type', '=', 'kyc').executeTakeFirst();
    expect(notif?.title).toBe('Compte activé');
  });

  it('disponibilités, exceptions et tarifs : CRUD, chevauchement 409, réservé aux praticiens', async () => {
    const notPractitioner = await app.inject({ method: 'POST', url: '/api/practitioners/me/availability', headers: auth('patient'), payload: { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' } });
    expect(notPractitioner.statusCode).toBe(403);
    const slot = await app.inject({ method: 'POST', url: '/api/practitioners/me/availability', headers: auth('practitioner'), payload: { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' } });
    expect(slot.statusCode).toBe(201);
    const overlap = await app.inject({ method: 'POST', url: '/api/practitioners/me/availability', headers: auth('practitioner'), payload: { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' } });
    expect(overlap.statusCode).toBe(409);
    const upd = await app.inject({ method: 'PATCH', url: `/api/practitioners/me/availability/${slot.json().id}`, headers: auth('practitioner'), payload: { endTime: '13:00' } });
    expect(upd.json().end_time).toBe('13:00:00');
    const pub = await app.inject({ method: 'GET', url: `/api/practitioners/${practitionerId}/availability` });
    expect(pub.json().length).toBe(1);

    const exc = await app.inject({ method: 'POST', url: '/api/practitioners/me/exceptions', headers: auth('practitioner'), payload: { date: '2030-01-07', reason: 'Congé', isAvailable: false } });
    expect(exc.statusCode).toBe(201);
    const rate = await app.inject({ method: 'POST', url: '/api/practitioners/me/rates', headers: auth('practitioner'), payload: { serviceType: 'consultation', basePrice: 15000 } });
    expect(rate.statusCode).toBe(201);
    const rates = await app.inject({ method: 'GET', url: `/api/practitioners/${practitionerId}/rates` });
    expect(rates.json()[0]).toMatchObject({ service_type: 'consultation', base_price: 15000, duration_minutes: 60 });
  });

  it('recherche de praticien disponible (distance + créneau + exception)', async () => {
    // Il faut être en ligne (PATCH /me) : 2030-01-07 est un lundi (dayOfWeek 1).
    await app.inject({ method: 'PATCH', url: '/api/practitioners/me', headers: auth('practitioner'), payload: { isOnline: true, available: true } });
    const listed = await app.inject({ method: 'GET', url: '/api/practitioners?type=medecin&onlineOnly=true' });
    expect(listed.json().some((p: { id: string }) => p.id === practitionerId)).toBe(true);

    const ok = await app.inject({ method: 'GET', url: '/api/practitioners/available?type=medecin&latitude=6.37&longitude=2.39&date=2030-01-14&time=09:30&radiusKm=10' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().found).toBe(true);
    // D'autres praticiens de test peuvent partager les mêmes coordonnées : on vérifie le nôtre.
    const mine = ok.json().practitioners.find((p: { id: string }) => p.id === practitionerId);
    expect(mine).toMatchObject({ isAvailableAt: true, hasException: false });
    expect(mine.distanceKm).toBeLessThan(1);
    expect(mine.latitude).toBeUndefined();

    const outsideSlot = await app.inject({ method: 'GET', url: '/api/practitioners/available?type=medecin&latitude=6.37&longitude=2.39&date=2030-01-14&time=15:00' });
    expect(outsideSlot.json().practitioners.find((p: { id: string }) => p.id === practitionerId)).toMatchObject({ isAvailableAt: false });
    const exceptionDay = await app.inject({ method: 'GET', url: '/api/practitioners/available?type=medecin&latitude=6.37&longitude=2.39&date=2030-01-07&time=09:30' });
    expect(exceptionDay.json().practitioners.find((p: { id: string }) => p.id === practitionerId)).toMatchObject({ isAvailableAt: false, hasException: true });
    const farAway = await app.inject({ method: 'GET', url: '/api/practitioners/available?type=medecin&latitude=9.30&longitude=2.31&date=2030-01-14&time=09:30&radiusKm=10' });
    expect(farAway.json().practitioners.length).toBe(0);
  });

  it('nouveau document KYC : dossier repassé en attente, administrateurs notifiés ; configuration publique ; tentatives de paiement', async () => {
    const forbidden = await app.inject({ method: 'PUT', url: '/api/practitioners/me/documents', headers: auth('patient'), payload: { idDocumentUrl: `documents/${userIds['patient']}/1-id.pdf` } });
    expect(forbidden.statusCode).toBe(404);
    const empty = await app.inject({ method: 'PUT', url: '/api/practitioners/me/documents', headers: auth('practitioner'), payload: {} });
    expect(empty.statusCode).toBe(400);
    const updated = await app.inject({ method: 'PUT', url: '/api/practitioners/me/documents', headers: auth('practitioner'), payload: { licenseDocumentUrl: `documents/${userIds['practitioner']}/2-licence.pdf` } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ kyc_status: 'pending', license_document_url: `documents/${userIds['practitioner']}/2-licence.pdf` });
    const adminNotif = await db.db.selectFrom('notifications').select('title').where('user_id', '=', userIds['admin']).where('title', '=', 'Documents KYC mis à jour').executeTakeFirst();
    expect(adminNotif).toBeTruthy();
    const config = await app.inject({ method: 'GET', url: '/api/config/public' });
    expect(config.statusCode).toBe(200);
    expect(config.json()).toMatchObject({ features: expect.any(Object) });
    const attempts = await app.inject({ method: 'GET', url: '/api/payments/attempts', headers: auth('patient') });
    expect(attempts.statusCode).toBe(200);
    expect(attempts.json()).toEqual([]);
  });
});

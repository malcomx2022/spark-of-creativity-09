import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { normalizePhoneNumber } from '../auth/phone.util';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, Practitioner, PractitionerUpdate } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { decodeDataUrl, MAX_KYC_DOCUMENT_SIZE, StorageService } from '../storage/storage.service';
import type { AvailableQuery, ListPractitionersQuery, RegisterPractitionerDto, UpdatePractitionerDto } from './practitioners.dto';

/** Colonnes exposées publiquement (= get_public_practitioners / practitioners_public_view). */
const PUBLIC_COLUMNS = [
  'id', 'name', 'specialty', 'practitioner_type', 'rating', 'available', 'years_experience', 'bio', 'languages',
  'communes_served', 'intervention_zone', 'intervention_radius', 'certifications', 'session_types', 'image',
] as const;

const DOCUMENT_KEYS = ['profilePhoto', 'idDocument', 'diploma', 'licenseDocument'] as const;
type DocumentKey = (typeof DOCUMENT_KEYS)[number];

/** Distance haversine en km (identique à find-available-practitioner). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class PractitionersService {
  private readonly logger = new Logger(PractitionersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly inApp: InAppNotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Inscription atomique (ex create-practitioner-account)
  // ---------------------------------------------------------------------------
  async register(userId: string, dto: RegisterPractitionerDto) {
    const phone = normalizePhoneNumber(dto.practitioner.phone);
    const profilePhone = normalizePhoneNumber(dto.profile.phone);

    // Décodage + validation (type, taille 5 Mo, magic bytes) avant toute écriture.
    const decoded = new Map<DocumentKey, { contentType: string; body: Buffer }>();
    for (const key of DOCUMENT_KEYS) {
      const value = dto.documents[key];
      if (value) decoded.set(key, decodeDataUrl(value, key, MAX_KYC_DOCUMENT_SIZE));
    }

    // Idempotence + conflits, avant l'upload.
    const existing = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('practitioners').select(['id', 'kyc_status']).where('user_id', '=', userId).executeTakeFirst(),
    );
    if (existing) return { success: true, alreadyExists: true, practitioner: existing };
    const phoneTaken = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('practitioners').select('id').where('phone', '=', phone).where('user_id', '!=', userId).executeTakeFirst(),
    );
    if (phoneTaken) throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre praticien');

    // Upload des documents (compensation manuelle si la transaction échoue).
    const uploaded = new Map<DocumentKey, string>();
    try {
      for (const [key, doc] of decoded) {
        const folder = key === 'profilePhoto' ? 'avatars' : 'documents';
        const ext = doc.contentType === 'application/pdf' ? 'pdf' : doc.contentType === 'image/png' ? 'png' : 'jpg';
        const objectKey = this.storage.buildKey(userId, `${key}.${ext}`);
        await this.storage.putObject(folder, objectKey, doc.body, doc.contentType);
        uploaded.set(key, `${folder}/${objectKey}`);
      }

      const result = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
        await this.upsertProfile(trx, userId, { fullName: dto.profile.fullName, phone: profilePhone, gender: dto.profile.gender ?? null, dateOfBirth: dto.profile.dateOfBirth ?? null });

        for (const [key, path] of uploaded) {
          const doc = decoded.get(key)!;
          await trx
            .insertInto('files')
            .values({ user_id: userId, file_name: path.split('/').pop() ?? key, file_path: path, file_size: doc.body.length, file_type: doc.contentType, storage_provider: 's3', folder: path.split('/')[0], metadata: JSON.stringify({ kyc: key }) })
            .execute();
        }

        const p = dto.practitioner;
        const coach = p.practitionerType === 'coach_sportif';
        const practitioner = await trx
          .insertInto('practitioners')
          .values({
            user_id: userId,
            name: p.name,
            phone,
            address: p.address ?? null,
            latitude: p.latitude ?? null,
            longitude: p.longitude ?? null,
            specialty: p.specialty,
            practitioner_type: p.practitionerType,
            years_experience: p.yearsExperience ?? 0,
            bio: p.bio ?? null,
            license_number: p.licenseNumber ?? null,
            session_types: coach ? p.sessionTypes ?? null : null,
            intervention_zone: coach ? p.interventionZone ?? null : null,
            intervention_radius: coach ? Math.round(p.interventionRadius ?? 10) : 10,
            certifications: coach ? p.certifications ?? null : null,
            communes_served: p.communesServed ?? null,
            languages: p.languages ?? null,
            kyc_status: 'pending',
            can_accept_missions: false,
            image: uploaded.get('profilePhoto') ?? null,
            id_document_url: uploaded.get('idDocument') ?? null,
            license_document_url: uploaded.get('licenseDocument') ?? null,
            insurance_document_url: uploaded.get('diploma') ?? null, // coach : diplôme / certification (convention existante)
          })
          .returning(['id', 'name', 'kyc_status', 'practitioner_type'])
          .executeTakeFirstOrThrow();

        // Le compte n'est plus "incomplete_practitioner" : on aligne les métadonnées.
        await trx.updateTable('users').set({ raw_user_meta_data: sql`raw_user_meta_data || ${JSON.stringify({ user_type: 'practitioner', practitioner_type: p.practitionerType, practitioner_registered: true })}::jsonb` }).where('id', '=', userId).execute();

        const notified = await this.inApp.notifyAdmins(trx, {
          title: 'Nouvelle demande KYC',
          message: `${p.name} (${coach ? 'coach sportif' : p.specialty}) a soumis son dossier praticien.`,
          type: 'kyc',
          link: '/admin?tab=kyc',
        });
        this.logger.log(`Praticien ${practitioner.id} créé, ${notified} admin(s) notifié(s)`);
        return practitioner;
      });
      return { success: true, alreadyExists: false, practitioner: result };
    } catch (err) {
      for (const path of uploaded.values()) await this.storage.deleteByPath(path).catch(() => undefined);
      if (isUniqueViolation(err) || (err instanceof Error && /already exists/i.test(err.message))) {
        throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte');
      }
      throw err;
    }
  }

  private async upsertProfile(trx: Transaction<DB>, userId: string, p: { fullName: string; phone: string; gender: 'homme' | 'femme' | 'autre' | 'non_specifie' | null; dateOfBirth: string | null }) {
    const conflict = await trx.selectFrom('profiles').select('id').where('phone', '=', p.phone).where('id', '!=', userId).executeTakeFirst();
    if (conflict) throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte');
    await trx
      .insertInto('profiles')
      .values({ id: userId, full_name: p.fullName, phone: p.phone, gender: p.gender, date_of_birth: p.dateOfBirth })
      .onConflict((oc) => oc.column('id').doUpdateSet({ full_name: p.fullName, phone: p.phone, gender: p.gender, date_of_birth: p.dateOfBirth, updated_at: new Date() }))
      .execute();
  }

  // ---------------------------------------------------------------------------
  // Lecture publique (ex get_public_practitioners / practitioners_public_view / usePractitioners)
  // ---------------------------------------------------------------------------
  async listPublic(q: ListPractitionersQuery) {
    return this.database.runAs({ role: 'anon' }, (trx) => {
      let query = trx.selectFrom('practitioners').select(PUBLIC_COLUMNS).where('kyc_status', '=', 'approved');
      query = q.onlineOnly
        ? query.where('available', '=', true).where('can_accept_missions', '=', true).where('is_online', '=', true)
        : query.where((eb) => eb.or([eb('available', '=', true), eb('can_accept_missions', '=', true)]));
      if (q.type) query = query.where('practitioner_type', '=', q.type);
      return query.orderBy('rating', 'desc').limit(q.limit).execute();
    });
  }

  async getPublic(id: string) {
    const p = await this.database.runAs({ role: 'anon' }, (trx) =>
      trx.selectFrom('practitioners').select(PUBLIC_COLUMNS).where('id', '=', id).where('kyc_status', '=', 'approved').executeTakeFirst(),
    );
    if (!p) throw new NotFoundException('Praticien introuvable');
    return p;
  }

  /** Port de find-available-practitioner : filtre métier, distance, créneau du jour et exceptions. */
  async findAvailable(q: AvailableQuery) {
    return this.database.runAs({ role: 'anon' }, async (trx) => {
      const candidates = await trx
        .selectFrom('practitioners')
        .select([...PUBLIC_COLUMNS, 'latitude', 'longitude'])
        .where('practitioner_type', '=', q.type)
        .where('available', '=', true)
        .where('can_accept_missions', '=', true)
        .where('kyc_status', '=', 'approved')
        .where('kyc_validated_at', 'is not', null)
        .where('is_online', '=', true)
        .where('latitude', 'is not', null)
        .where('longitude', 'is not', null)
        .execute();
      const near = candidates
        .map((p) => ({ ...p, distanceKm: haversineKm(q.latitude, q.longitude, Number(p.latitude), Number(p.longitude)) }))
        .filter((p) => p.distanceKm <= q.radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      if (near.length === 0) return { found: false, message: `Aucun praticien disponible trouvé pour la catégorie "${q.type}"`, practitioners: [] };

      const ids = near.map((p) => p.id);
      const dayOfWeek = new Date(`${q.date}T00:00:00Z`).getUTCDay();
      const [slots, exceptions] = await Promise.all([
        trx.selectFrom('practitioner_availability').selectAll().where('practitioner_id', 'in', ids).where('day_of_week', '=', dayOfWeek).where('is_active', '=', true).execute(),
        trx.selectFrom('practitioner_exceptions').selectAll().where('practitioner_id', 'in', ids).where('date', '=', q.date).execute(),
      ]);
      const time = q.time;
      const results = near.map((p) => {
        const exception = exceptions.find((e) => e.practitioner_id === p.id);
        const isAvailableAt = exception
          ? !!exception.is_available
          : slots.some((s) => s.practitioner_id === p.id && String(s.start_time).slice(0, 5) <= time && String(s.end_time).slice(0, 5) > time);
        const { latitude: _lat, longitude: _lng, ...pub } = p;
        return { ...pub, distanceKm: Number(p.distanceKm.toFixed(2)), isAvailableAt, hasException: !!exception };
      });
      const first = results.find((r) => r.isAvailableAt) ?? null;
      return { found: !!first, practitioner: first, practitioners: results.slice(0, q.limit) };
    });
  }

  // ---------------------------------------------------------------------------
  // Espace praticien
  // ---------------------------------------------------------------------------
  async getOwn(userId: string): Promise<Practitioner> {
    const p = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('practitioners').selectAll().where('user_id', '=', userId).executeTakeFirst());
    if (!p) throw new NotFoundException('Aucun enregistrement praticien pour ce compte');
    return p;
  }

  /** Identifiant praticien du compte courant (403 si le compte n'est pas praticien). */
  async requireOwnId(userId: string): Promise<string> {
    const p = await this.database.runAs({ role: 'authenticated', userId }, (trx) => trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst());
    if (!p) throw new ForbiddenException('Réservé aux praticiens');
    return p.id;
  }

  async updateOwn(userId: string, dto: UpdatePractitionerDto): Promise<Practitioner> {
    const patch: PractitionerUpdate = {
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.specialty !== undefined ? { specialty: dto.specialty } : {}),
      ...(dto.yearsExperience !== undefined ? { years_experience: dto.yearsExperience } : {}),
      ...(dto.interventionRadius !== undefined ? { intervention_radius: dto.interventionRadius } : {}),
      ...(dto.interventionZone !== undefined ? { intervention_zone: dto.interventionZone } : {}),
      ...(dto.communesServed !== undefined ? { communes_served: dto.communesServed } : {}),
      ...(dto.languages !== undefined ? { languages: dto.languages } : {}),
      ...(dto.diplomas !== undefined ? { diplomas: dto.diplomas } : {}),
      ...(dto.certifications !== undefined ? { certifications: dto.certifications } : {}),
      ...(dto.sessionTypes !== undefined ? { session_types: dto.sessionTypes } : {}),
      ...(dto.image !== undefined ? { image: dto.image } : {}),
      ...(dto.available !== undefined ? { available: dto.available } : {}),
      ...(dto.isOnline !== undefined ? { is_online: dto.isOnline } : {}),
      updated_at: new Date(),
    };
    const p = await this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.updateTable('practitioners').set(patch).where('user_id', '=', userId).returningAll().executeTakeFirst(),
    );
    if (!p) throw new NotFoundException('Aucun enregistrement praticien pour ce compte');
    return p;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

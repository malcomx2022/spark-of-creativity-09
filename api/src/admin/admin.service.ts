import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { sql, type Transaction } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import { ReviewsService } from '../reviews/reviews.service';
import type { AdminRole } from '../common/decorators/roles.decorator';
import type { DB } from '../database/types';
import type { AuditQuery, CreateAdminDto, CreateConsentVersionDto, DeleteUserDto, LogSearchActivityDto, ModerateReviewDto, OtpAttemptsQuery, SearchActivityQuery, SystemConfigDto, TodayAppointmentsQuery, UsersQuery } from './admin.dto';

const BCRYPT_COST = 12;
const TEST_DOMAIN = '@test.com';

function tempPassword(): string {
  // 16 caractères, lettres/chiffres + symbole : mot de passe temporaire à changer à la première connexion.
  return `${randomBytes(12).toString('base64url').slice(0, 14)}A1!`;
}

/**
 * Administration — port de admin-management, delete-single-user, cleanup-non-test-accounts,
 * get_admin_dashboard_stats, get_public_stats, AuditLogs, SearchActivitySection, OTPManagementSection,
 * ComplianceSection (consentements, system_config) et OperationsSection (RDV du jour, modération des avis).
 * Différence assumée : « désactiver » un administrateur retire ses rôles et ses sessions au lieu de
 * supprimer le compte (l'Edge Function supprimait l'utilisateur).
 */
@Injectable()
export class AdminService {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService, private readonly reviewsService: ReviewsService) {}

  // ---------------------------------------------------------------------------
  // Statistiques
  // ---------------------------------------------------------------------------
  /** Ex get_admin_dashboard_stats() / vue admin_dashboard_stats. */
  async dashboardStats() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const r = await sql<Record<string, string>>`
        select
          (select count(distinct p.id) from public.profiles p where not exists (select 1 from public.user_roles ur where ur.user_id = p.id) and not exists (select 1 from public.practitioners pr where pr.user_id = p.id)) as patients_count,
          (select count(*) from public.practitioners) as practitioners_count,
          (select count(*) from public.practitioners where kyc_status = 'pending') as practitioners_pending_kyc,
          (select count(*) from public.appointments) as appointments_count,
          (select count(*) from public.appointments where date = current_date::text) as appointments_today,
          (select coalesce(sum(amount), 0) from public.payments where status in ('completed', 'paid', 'partially_refunded')) as total_revenue,
          (select count(*) from public.group_sessions where status in ('planifiee', 'confirmee') and scheduled_date >= current_date) as upcoming_group_sessions,
          (select count(*) from public.support_tickets where status in ('ouvert', 'en_cours')) as open_tickets`.execute(trx);
      return Object.fromEntries(Object.entries(r.rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
    });
  }

  /** Ex get_public_stats() (page d'accueil, sans authentification). */
  async publicStats() {
    return this.database.runAs({ role: 'anon' }, async (trx) => {
      const r = (await sql<{ s: Record<string, number> }>`select public.get_public_stats() as s`.execute(trx)).rows[0]?.s;
      return { practitioners_count: 0, patients_count: 0, appointments_completed: 0, coaches_count: 0, ...(r ?? {}) };
    });
  }

  // ---------------------------------------------------------------------------
  // Administrateurs (AdminManagement.tsx, super_admin)
  // ---------------------------------------------------------------------------
  async listAdmins() {
    return this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx
        .selectFrom('user_roles')
        .innerJoin('users', 'users.id', 'user_roles.user_id')
        .leftJoin('profiles', 'profiles.id', 'user_roles.user_id')
        .select(['user_roles.id', 'user_roles.user_id', 'user_roles.role', 'user_roles.created_at', 'user_roles.created_by', 'users.email', 'users.last_sign_in_at', 'profiles.full_name', 'profiles.phone'])
        .orderBy('user_roles.created_at', 'desc')
        .execute(),
    );
  }

  /** Ex admin-management create : compte existant → ajout du rôle ; sinon création avec mot de passe temporaire. */
  async createAdmin(adminId: string, dto: CreateAdminDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const email = dto.email.toLowerCase();
      const existing = await trx.selectFrom('users').select(['id']).where('email', '=', email).executeTakeFirst();
      let userId: string;
      let password: string | undefined;
      if (existing) {
        const already = await trx.selectFrom('user_roles').select('id').where('user_id', '=', existing.id).executeTakeFirst();
        if (already) throw new ConflictException('Cet utilisateur est déjà administrateur');
        userId = existing.id;
        await trx.updateTable('profiles').set({ full_name: dto.fullName, phone: dto.phone ?? null, updated_at: new Date() }).where('id', '=', userId).execute();
      } else {
        password = tempPassword();
        const user = await trx
          .insertInto('users')
          .values({ email, phone: null, password_hash: await bcrypt.hash(password, BCRYPT_COST), email_verified_at: new Date(), raw_user_meta_data: JSON.stringify({ full_name: dto.fullName, user_type: 'admin', must_change_password: true }), raw_app_meta_data: JSON.stringify({ provider: 'email', providers: ['email'] }) })
          .returning('id')
          .executeTakeFirstOrThrow();
        userId = user.id;
        // Le trigger handle_new_user_safe crée le profil ; on complète le téléphone.
        await trx.insertInto('profiles').values({ id: userId, full_name: dto.fullName, phone: dto.phone ?? null }).onConflict((oc) => oc.column('id').doUpdateSet({ full_name: dto.fullName, phone: dto.phone ?? null })).execute();
      }
      await trx.insertInto('user_roles').values({ user_id: userId, role: dto.role, created_by: adminId }).execute();
      await this.audit.log(trx, { adminId, action: 'create_admin', entityType: 'user', entityId: userId, ip, details: { email, role: dto.role, new_user: !existing } });
      return { success: true, userId, message: existing ? "Rôle admin ajouté à l'utilisateur existant" : 'Admin créé avec succès. Mot de passe temporaire généré.', ...(password ? { tempPassword: password } : {}) };
    });
  }

  async resetAdminPassword(adminId: string, userId: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const target = await trx.selectFrom('users').select('id').where('id', '=', userId).executeTakeFirst();
      if (!target) throw new NotFoundException('Utilisateur introuvable');
      const password = tempPassword();
      await trx.updateTable('users').set({ password_hash: await bcrypt.hash(password, BCRYPT_COST), failed_login_attempts: 0, locked_until: null, raw_user_meta_data: sql`coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb` }).where('id', '=', userId).execute();
      await trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
      await this.audit.log(trx, { adminId, action: 'reset_password', entityType: 'user', entityId: userId, ip });
      return { success: true, newPassword: password, message: 'Mot de passe réinitialisé avec succès' };
    });
  }

  /** « Désactivation » : retrait des rôles + révocation des sessions (le compte est conservé). */
  async revokeAdmin(adminId: string, userId: string, reason: string, ip?: string) {
    if (userId === adminId) throw new BadRequestException('Vous ne pouvez pas vous désactiver vous-même');
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const profile = await trx.selectFrom('profiles').select('full_name').where('id', '=', userId).executeTakeFirst();
      const removed = await trx.deleteFrom('user_roles').where('user_id', '=', userId).returning('role').execute();
      if (removed.length === 0) throw new NotFoundException("Cet utilisateur n'est pas administrateur");
      await trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
      await this.audit.log(trx, { adminId, action: 'disable_admin', entityType: 'user', entityId: userId, ip, details: { admin_name: profile?.full_name ?? 'Unknown', reason, roles_removed: removed.map((r) => r.role) } });
      return { success: true, message: 'Admin désactivé avec succès', rolesRemoved: removed.map((r) => r.role) };
    });
  }

  // ---------------------------------------------------------------------------
  // Utilisateurs (UsersManagementSection, PatientDetailsDialog, PractitionerDetailsDialog)
  // ---------------------------------------------------------------------------
  async listPatients(q: UsersQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx
        .selectFrom('profiles')
        .innerJoin('users', 'users.id', 'profiles.id')
        .where((eb) => eb.not(eb.exists(eb.selectFrom('user_roles').select('id').whereRef('user_roles.user_id', '=', 'profiles.id'))))
        .where((eb) => eb.not(eb.exists(eb.selectFrom('practitioners').select('id').whereRef('practitioners.user_id', '=', 'profiles.id'))));
      if (q.search) base = base.where((eb) => eb.or([eb('profiles.full_name', 'ilike', `%${q.search}%`), eb('profiles.phone', 'ilike', `%${q.search}%`), eb('users.email', 'ilike', `%${q.search}%`)]));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll('profiles').select(['users.email', 'users.last_sign_in_at', 'users.banned_until']).orderBy('profiles.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  async getPatient(userId: string) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const profile = await trx.selectFrom('profiles').innerJoin('users', 'users.id', 'profiles.id').selectAll('profiles').select(['users.email', 'users.last_sign_in_at', 'users.banned_until']).where('profiles.id', '=', userId).executeTakeFirst();
      if (!profile) throw new NotFoundException('Patient introuvable');
      const [emergencyContacts, addresses, medicalProfile, appointments, groupSessions] = await Promise.all([
        trx.selectFrom('emergency_contacts').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute(),
        trx.selectFrom('addresses').selectAll().where('user_id', '=', userId).orderBy('is_default', 'desc').execute(),
        trx.selectFrom('medical_profiles').selectAll().where('user_id', '=', userId).executeTakeFirst(),
        trx.selectFrom('appointments').select(['id', 'specialty', 'status', 'practitioner_name', 'date', 'time', 'reason', 'payment_amount', 'created_at']).where('patient_id', '=', userId).orderBy('created_at', 'desc').limit(5).execute(),
        trx.selectFrom('group_session_participants as p').innerJoin('group_sessions as s', 's.id', 'p.session_id').select(['p.id', 'p.payment_status', 'p.joined_at', 's.session_name', 's.scheduled_date', 's.status as session_status']).where('p.patient_id', '=', userId).orderBy('p.joined_at', 'desc').limit(5).execute(),
      ]);
      return { ...profile, emergency_contacts: emergencyContacts, addresses, medical_profile: medicalProfile ?? null, appointments, group_sessions: groupSessions };
    });
  }

  async listPractitioners(q: UsersQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('practitioners');
      if (q.search) base = base.where((eb) => eb.or([eb('name', 'ilike', `%${q.search}%`), eb('phone', 'ilike', `%${q.search}%`), eb('specialty', 'ilike', `%${q.search}%`)]));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  async getPractitioner(practitionerId: string) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').selectAll().where('id', '=', practitionerId).executeTakeFirst();
      if (!practitioner) throw new NotFoundException('Praticien introuvable');
      const [user, appointments, paymentInfo, balance, sessions] = await Promise.all([
        trx.selectFrom('users').select(['email', 'last_sign_in_at', 'banned_until']).where('id', '=', practitioner.user_id).executeTakeFirst(),
        trx.selectFrom('appointments').select(['id', 'patient_name', 'status', 'specialty', 'date', 'time', 'reason', 'payment_amount', 'created_at']).where('practitioner_id', '=', practitionerId).orderBy('created_at', 'desc').limit(5).execute(),
        trx.selectFrom('practitioner_payment_info').selectAll().where('practitioner_id', '=', practitionerId).orderBy('updated_at', 'desc').execute(),
        trx.selectFrom('practitioner_balances').selectAll().where('practitioner_id', '=', practitionerId).executeTakeFirst(),
        trx.selectFrom('group_sessions').select(['id', 'session_name', 'scheduled_date', 'status', 'current_participants', 'max_participants']).where('coach_id', '=', practitionerId).orderBy('scheduled_date', 'desc').limit(5).execute(),
      ]);
      return { ...practitioner, email: user?.email ?? null, last_sign_in_at: user?.last_sign_in_at ?? null, banned_until: user?.banned_until ?? null, appointments, payment_info: paymentInfo, balance: balance ?? null, group_sessions: sessions };
    });
  }

  /** Ex delete-single-user (super_admin, ops) : suppression définitive, comptes @test.com protégés. */
  async deleteUser(adminId: string, adminEmail: string | null, userId: string, dto: DeleteUserDto, ip?: string) {
    if (userId === adminId) throw new BadRequestException('Vous ne pouvez pas supprimer votre propre compte');
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const user = await trx.selectFrom('users').select(['id', 'email']).where('id', '=', userId).executeTakeFirst();
      if (!user) throw new NotFoundException('Utilisateur non trouvé');
      if (user.email?.includes(TEST_DOMAIN)) throw new ForbiddenException('Impossible de supprimer un compte test');
      const targetRoles = await trx.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
      if (targetRoles.some((r) => r.role === 'super_admin')) throw new ForbiddenException('Impossible de supprimer un super administrateur');
      const stats = await this.purgeUser(trx, userId);
      // Journal écrit avant la suppression (la FK admin_audit_logs.admin_id vise l'admin, pas la cible).
      await this.audit.log(trx, { adminId, action: `delete_${dto.userType ?? 'user'}`, entityType: dto.userType ?? 'user', entityId: userId, ip, details: { deleted_by: adminEmail, email: user.email, ...stats } });
      await trx.deleteFrom('users').where('id', '=', userId).execute();
      return { success: true, message: 'Utilisateur supprimé avec succès', userId, ...stats };
    });
  }

  /** Suppression des données sans ON DELETE CASCADE (ordre des dépendances). */
  private async purgeUser(trx: Transaction<DB>, userId: string) {
    const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
    let practitionerDeleted = false;
    if (practitioner) {
      const pid = practitioner.id;
      const sessions = await trx.selectFrom('group_sessions').select('id').where('coach_id', '=', pid).execute();
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length) {
        await sql`delete from public.payout_payments where payment_id in (select id from public.payments where appointment_id like any(array(select 'group_session_' || id::text || '_%' from public.group_sessions where coach_id = ${pid}::uuid)))`.execute(trx);
        await sql`delete from public.payment_refunds where payment_id in (select id from public.payments where appointment_id like any(array(select 'group_session_' || id::text || '_%' from public.group_sessions where coach_id = ${pid}::uuid)))`.execute(trx);
        await sql`delete from public.payments where appointment_id like any(array(select 'group_session_' || id::text || '_%' from public.group_sessions where coach_id = ${pid}::uuid))`.execute(trx);
        await trx.deleteFrom('group_sessions').where('coach_id', '=', pid).execute();
      }
      await trx.deleteFrom('payout_payments').where('payout_id', 'in', (eb) => eb.selectFrom('practitioner_payouts').select('id').where('practitioner_id', '=', pid)).execute();
      await trx.deleteFrom('practitioner_payouts').where('practitioner_id', '=', pid).execute();
      await trx.deleteFrom('practitioner_balances').where('practitioner_id', '=', pid).execute();
      await sql`delete from public.care_notes where practitioner_id = ${pid}::uuid`.execute(trx);
      await sql`delete from public.consultation_reports where practitioner_id = ${pid}::uuid`.execute(trx);
      await sql`delete from public.ledger_entries where account_id in (select id from public.ledger_accounts where owner_type = 'practitioner' and owner_id = ${pid}::uuid)`.execute(trx);
      await sql`delete from public.ledger_accounts where owner_type = 'practitioner' and owner_id = ${pid}::uuid`.execute(trx);
      await trx.updateTable('practitioners').set({ kyc_reviewed_by: null }).where('kyc_reviewed_by', '=', userId).execute();
      await trx.deleteFrom('practitioners').where('id', '=', pid).execute();
      practitionerDeleted = true;
    }
    await sql`delete from public.payment_refunds where payment_id in (select id from public.payments where patient_id = ${userId}::uuid)`.execute(trx);
    await sql`delete from public.payout_payments where payment_id in (select id from public.payments where patient_id = ${userId}::uuid)`.execute(trx);
    await sql`delete from public.ledger_entries where account_id in (select id from public.ledger_accounts where owner_type = 'patient' and owner_id = ${userId}::uuid)`.execute(trx);
    await sql`delete from public.ledger_accounts where owner_type = 'patient' and owner_id = ${userId}::uuid`.execute(trx);
    await trx.deleteFrom('payment_attempts').where('user_id', '=', userId).execute();
    await trx.deleteFrom('payments').where('patient_id', '=', userId).execute();
    await trx.deleteFrom('group_session_participants').where('patient_id', '=', userId).execute();
    await sql`delete from public.support_tickets where user_id = ${userId}::uuid`.execute(trx);
    await sql`delete from public.dispute_messages where sender_id = ${userId}::uuid`.execute(trx);
    await sql`delete from public.disputes where raised_by = ${userId}::uuid`.execute(trx);
    await sql`update public.disputes set assigned_to = null where assigned_to = ${userId}::uuid`.execute(trx);
    await trx.deleteFrom('file_access_logs').where('user_id', '=', userId).execute();
    await trx.deleteFrom('files').where('user_id', '=', userId).execute();
    await sql`delete from public.appointments where patient_id = ${userId}::text`.execute(trx);
    await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
    return { practitioner_deleted: practitionerDeleted };
  }

  /** Ex cleanup-non-test-accounts (super_admin) : supprime tous les comptes sans @test.com, sauf les administrateurs. */
  async cleanupNonTestAccounts(adminId: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const targets = await trx
        .selectFrom('users')
        .select(['id', 'email'])
        .where((eb) => eb.or([eb('email', 'is', null), eb('email', 'not like', `%${TEST_DOMAIN}`)]))
        .where((eb) => eb.not(eb.exists(eb.selectFrom('user_roles').select('id').whereRef('user_roles.user_id', '=', 'users.id'))))
        .execute();
      const preserved = await trx.selectFrom('users').select((eb) => eb.fn.countAll<string>().as('n')).where('email', 'like', `%${TEST_DOMAIN}`).executeTakeFirstOrThrow();
      if (targets.length === 0) return { success: true, message: 'Aucun compte non-test à supprimer.', stats: { preserved: Number(preserved.n), deleted: 0, failed: 0, practitioners_deleted: 0 } };
      let deleted = 0;
      let practitioners = 0;
      const failed: string[] = [];
      for (const t of targets) {
        try {
          const r = await this.purgeUser(trx, t.id);
          await trx.deleteFrom('users').where('id', '=', t.id).execute();
          deleted++;
          if (r.practitioner_deleted) practitioners++;
        } catch (err) {
          failed.push(`${t.email ?? t.id}: ${err instanceof Error ? err.message : err}`);
        }
      }
      const stats = { preserved: Number(preserved.n), deleted, failed: failed.length, practitioners_deleted: practitioners };
      await this.audit.log(trx, { adminId, action: 'cleanup_non_test_accounts', entityType: 'users', ip, details: { ...stats, deleted_user_emails: targets.map((t) => t.email), errors: failed } });
      return { success: true, message: `Suppression complète réussie. ${stats.preserved} comptes test préservés, ${deleted} comptes supprimés définitivement${failed.length ? `, ${failed.length} échecs` : ''}.`, stats };
    });
  }

  // ---------------------------------------------------------------------------
  // Journal d'audit (AuditLogs.tsx)
  // ---------------------------------------------------------------------------
  async auditLogs(q: AuditQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('admin_audit_logs');
      if (q.entityType) base = base.where('entity_type', '=', q.entityType);
      if (q.action) base = base.where('action', '=', q.action);
      if (q.adminId) base = base.where('admin_id', '=', q.adminId);
      if (q.entityId) base = base.where('entity_id', '=', q.entityId);
      if (q.from) base = base.where('created_at', '>=', new Date(`${q.from}T00:00:00`));
      if (q.to) base = base.where('created_at', '<=', new Date(`${q.to}T23:59:59`));
      if (q.search && q.search.length >= 3) {
        const escaped = q.search.replace(/[%_\\]/g, '\\$&');
        base = base.where((eb) => eb.or([eb('action', 'ilike', `%${escaped}%`), eb('entity_id', 'ilike', `%${escaped}%`)]));
      }
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.leftJoin('profiles', 'profiles.id', 'admin_audit_logs.admin_id').selectAll('admin_audit_logs').select('profiles.full_name as admin_name').orderBy('admin_audit_logs.created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      // Obfuscation partielle des IP (RGPD), comme AuditLogs.tsx.
      return { data: data.map((l) => ({ ...l, ip_address: l.ip_address ? l.ip_address.replace(/\.\d+\.\d+$/, '.***.**') : null })), count: Number(count.n) };
    });
  }

  async auditFilters() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const [types, actions, admins, stats] = await Promise.all([
        trx.selectFrom('admin_audit_logs').select('entity_type').distinct().orderBy('entity_type').execute(),
        trx.selectFrom('admin_audit_logs').select('action').distinct().orderBy('action').execute(),
        trx.selectFrom('admin_audit_logs').innerJoin('profiles', 'profiles.id', 'admin_audit_logs.admin_id').select(['admin_audit_logs.admin_id as id', 'profiles.full_name']).distinct().execute(),
        sql<{ today: string; week: string; total: string }>`select count(*) filter (where created_at >= date_trunc('day', now())) as today, count(*) filter (where created_at >= date_trunc('day', now()) - interval '7 days') as week, count(*) as total from public.admin_audit_logs`.execute(trx),
      ]);
      const s = stats.rows[0];
      return { entityTypes: types.map((t) => t.entity_type), actions: actions.map((a) => a.action), admins, stats: { today: Number(s?.today ?? 0), week: Number(s?.week ?? 0), total: Number(s?.total ?? 0), activeAdmins: admins.length } };
    });
  }

  // ---------------------------------------------------------------------------
  // Activité de recherche (useSearchActivityLog / SearchActivitySection)
  // ---------------------------------------------------------------------------
  async logSearchActivity(userId: string | null, dto: LogSearchActivityDto, meta: { ip?: string; userAgent?: string }) {
    await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx
        .insertInto('search_activity_logs')
        .values({ user_id: userId, session_id: dto.sessionId, action_type: dto.actionType, practitioner_id: dto.practitionerId ?? null, search_filters: dto.searchFilters ? JSON.stringify(dto.searchFilters) : null, metadata: dto.metadata ? JSON.stringify(dto.metadata) : null, ip_address: meta.ip ?? null, user_agent: meta.userAgent?.slice(0, 500) ?? null })
        .execute(),
    );
    return { logged: true };
  }

  async searchActivity(q: SearchActivityQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const since = new Date(Date.now() - q.days * 86_400_000);
      let base = trx.selectFrom('search_activity_logs').where('created_at', '>=', since);
      if (q.actionType) base = base.where('action_type', '=', q.actionType);
      if (q.userType === 'authenticated') base = base.where('user_id', 'is not', null);
      if (q.userType === 'anonymous') base = base.where('user_id', 'is', null);
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      const s = (await sql<Record<string, string>>`
        select count(*) as total, count(user_id) as authenticated, count(*) filter (where user_id is null) as anonymous,
          count(*) filter (where action_type = 'click_appointment') as appointment_clicks,
          count(*) filter (where action_type = 'click_contact') as contact_clicks,
          count(*) filter (where action_type = 'view_practitioner_details') as view_details
        from public.search_activity_logs where created_at >= ${since}`.execute(trx)).rows[0];
      const viewDetails = Number(s?.view_details ?? 0);
      const stats = { total: Number(s?.total ?? 0), authenticated: Number(s?.authenticated ?? 0), anonymous: Number(s?.anonymous ?? 0), appointmentClicks: Number(s?.appointment_clicks ?? 0), contactClicks: Number(s?.contact_clicks ?? 0), viewDetails, conversionRate: viewDetails > 0 ? Math.round((Number(s?.appointment_clicks ?? 0) / viewDetails) * 100) : 0 };
      return { data, count: Number(count.n), stats };
    });
  }

  // ---------------------------------------------------------------------------
  // OTP (OTPManagementSection)
  // ---------------------------------------------------------------------------
  async otpAttempts(q: OtpAttemptsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let base = trx.selectFrom('otp_attempts');
      if (q.phone) base = base.where('phone_number', 'ilike', `%${q.phone}%`);
      if (q.status) base = base.where('status', '=', q.status);
      if (q.channel) base = base.where('channel', '=', q.channel);
      if (q.from) base = base.where('created_at', '>=', new Date(`${q.from}T00:00:00`));
      if (q.to) base = base.where('created_at', '<=', new Date(`${q.to}T23:59:59`));
      const count = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await base.selectAll().orderBy('created_at', 'desc').offset(q.page * q.limit).limit(q.limit).execute();
      return { data, count: Number(count.n) };
    });
  }

  async otpStats() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const s = (await sql<Record<string, string>>`
        select count(*) as total,
          count(*) filter (where created_at >= date_trunc('day', now())) as today,
          count(*) filter (where created_at >= now() - interval '7 days') as week,
          count(*) filter (where status in ('delivered', 'sent', 'verified')) as delivered
        from public.otp_attempts`.execute(trx)).rows[0];
      const byChannel = await trx.selectFrom('otp_attempts').select(['channel', (eb) => eb.fn.countAll<string>().as('n')]).groupBy('channel').execute();
      const blocked = await this.blockedNumbers(trx);
      const total = Number(s?.total ?? 0);
      const delivered = Number(s?.delivered ?? 0);
      return { total, today: Number(s?.today ?? 0), week: Number(s?.week ?? 0), delivered, successRate: total > 0 ? Math.round((delivered / total) * 100) : 0, byChannel: Object.fromEntries(byChannel.map((c) => [c.channel ?? 'sms', Number(c.n)])), blocked: blocked.length };
    });
  }

  /** Numéros à 3 tentatives ou plus dans la dernière heure, ou bloqués par check_otp_rate_limit(). */
  private async blockedNumbers(trx: Transaction<DB>) {
    const r = await sql<{ phone_number: string; attempts: number; last_attempt: Date; blocked_until: Date | null }>`
      select coalesce(a.phone_number, rl.phone_number) as phone_number, coalesce(a.attempts, rl.attempts, 0)::int as attempts, coalesce(a.last_attempt, rl.first_attempt_at) as last_attempt, rl.blocked_until
      from (select phone_number, count(*) as attempts, max(created_at) as last_attempt from public.otp_attempts where created_at >= now() - interval '1 hour' group by phone_number having count(*) >= 3) a
      full outer join (select * from public.otp_rate_limits where blocked_until > now()) rl on rl.phone_number = a.phone_number
      order by last_attempt desc`.execute(trx);
    return r.rows;
  }

  otpBlocked() {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => this.blockedNumbers(trx));
  }

  /** Débloque un numéro : tentatives supprimées et limite de débit réinitialisée. */
  async resetOtp(adminId: string, phone: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const deleted = await trx.deleteFrom('otp_attempts').where('phone_number', '=', phone).executeTakeFirst();
      await trx.deleteFrom('otp_rate_limits').where('phone_number', '=', phone).execute();
      await this.audit.log(trx, { adminId, action: 'reset_otp_attempts', entityType: 'otp', entityId: phone, ip, details: { phone_number: phone, deleted: Number(deleted.numDeletedRows) } });
      return { success: true, deleted: Number(deleted.numDeletedRows) };
    });
  }

  async deleteOtpAttempt(adminId: string, id: string, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const row = await trx.deleteFrom('otp_attempts').where('id', '=', id).returning('phone_number').executeTakeFirst();
      if (!row) throw new NotFoundException('Tentative introuvable');
      await this.audit.log(trx, { adminId, action: 'delete_otp_attempt', entityType: 'otp', entityId: id, ip, details: { phone_number: row.phone_number } });
      return { success: true };
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration système et consentements (ComplianceSection, ApiManagementSection)
  // ---------------------------------------------------------------------------
  listSystemConfig() {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('system_config').selectAll().orderBy('key').execute());
  }

  async upsertSystemConfig(adminId: string, key: string, dto: SystemConfigDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const existing = await trx.selectFrom('system_config').select(['id', 'value']).where('key', '=', key).executeTakeFirst();
      const value = JSON.stringify(dto.value);
      const row = existing
        ? await trx.updateTable('system_config').set({ value, ...(dto.description !== undefined ? { description: dto.description } : {}), updated_by: adminId, updated_at: new Date() }).where('key', '=', key).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('system_config').values({ key, value, description: dto.description ?? null, updated_by: adminId }).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: existing ? 'update_system_config' : 'create_system_config', entityType: 'system_config', entityId: key, ip, details: { key, value: dto.value, previous: existing?.value ?? null } });
      return row;
    });
  }

  async consentStats() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const rows = await trx.selectFrom('consents').select(['consent_type', (eb) => eb.fn.countAll<string>().as('total'), (eb) => eb.fn.count<string>('accepted_at').filterWhere('is_accepted', '=', true).as('accepted')]).groupBy('consent_type').execute();
      return Object.fromEntries(rows.map((r) => [r.consent_type, { total: Number(r.total), accepted: Number(r.accepted), acceptanceRate: Number(r.total) > 0 ? Math.round((Number(r.accepted) / Number(r.total)) * 100) : 0 }]));
    });
  }

  listConsentVersions(type?: string) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => {
      let q = trx.selectFrom('consent_versions').selectAll().orderBy('created_at', 'desc');
      if (type) q = q.where('consent_type', '=', type as never);
      return q.execute();
    });
  }

  /** Version active (publique) d'un type de consentement. */
  activeConsentVersion(type: string) {
    return this.database.runAs({ role: 'anon' }, (trx) => trx.selectFrom('consent_versions').selectAll().where('consent_type', '=', type as never).where('is_active', '=', true).orderBy('effective_date', 'desc').executeTakeFirst());
  }

  async createConsentVersion(adminId: string, dto: CreateConsentVersionDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const dup = await trx.selectFrom('consent_versions').select('id').where('consent_type', '=', dto.consentType).where('version', '=', dto.version).executeTakeFirst();
      if (dup) throw new ConflictException('Cette version existe déjà pour ce type de consentement');
      const row = await trx.insertInto('consent_versions').values({ consent_type: dto.consentType, version: dto.version, content: dto.content, is_active: false, created_by: adminId }).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: 'create_consent_version', entityType: 'consent_version', entityId: row.id, ip, details: { consent_type: dto.consentType, version: dto.version } });
      return row;
    });
  }

  async setConsentVersionActive(adminId: string, id: string, activate: boolean, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const v = await trx.selectFrom('consent_versions').select(['id', 'consent_type']).where('id', '=', id).executeTakeFirst();
      if (!v) throw new NotFoundException('Version introuvable');
      if (activate) await trx.updateTable('consent_versions').set({ is_active: false }).where('consent_type', '=', v.consent_type).execute();
      const row = await trx.updateTable('consent_versions').set({ is_active: activate, effective_date: activate ? new Date() : null }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.audit.log(trx, { adminId, action: activate ? 'activate_consent_version' : 'deactivate_consent_version', entityType: 'consent_version', entityId: id, ip, details: { consent_type: v.consent_type } });
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Opérations (OperationsSection) : rendez-vous du jour, modération des avis
  // ---------------------------------------------------------------------------
  appointmentsOfDay(q: TodayAppointmentsQuery) {
    return this.database.runAs(SERVICE_CONTEXT, (trx) => {
      let query = trx.selectFrom('appointments').selectAll().where('date', '=', q.date ?? new Date().toISOString().slice(0, 10)).orderBy('time', 'asc');
      if (q.status) query = query.where('status', '=', q.status as never);
      return query.execute();
    });
  }

  async reviews(q: { page: number; limit: number }) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const count = await trx.selectFrom('reviews').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const data = await trx
        .selectFrom('reviews')
        .leftJoin('profiles', 'profiles.id', 'reviews.patient_id')
        .selectAll('reviews')
        .select(['profiles.full_name as patient_name'])
        .orderBy('reviews.created_at', 'desc')
        .offset(q.page * q.limit)
        .limit(q.limit)
        .execute();
      const ids = [...new Set(data.map((r) => r.practitioner_id))];
      const practitioners = ids.length ? await trx.selectFrom('practitioners').select(['id', 'name', 'specialty']).where('id', 'in', ids).execute() : [];
      return { data: data.map((r) => ({ ...r, practitioner: practitioners.find((p) => p.id === r.practitioner_id) ?? null })), count: Number(count.n) };
    });
  }

  async moderateReview(adminId: string, id: string, dto: ModerateReviewDto, ip?: string) {
    return this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const row = await trx.updateTable('reviews').set({ is_hidden: dto.isHidden, moderation_reason: dto.reason ?? null, moderated_by: adminId, moderated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirst();
      if (!row) throw new NotFoundException('Avis introuvable');
      // Un avis masqué ne compte plus dans la note publique du praticien.
      await this.reviewsService.recomputeRating(trx, row.practitioner_id);
      await this.audit.log(trx, { adminId, action: dto.isHidden ? 'hide_review' : 'show_review', entityType: 'review', entityId: id, ip, details: { reason: dto.reason ?? null } });
      return row;
    });
  }

  /** Ex ApiManagementSection : volumes webhooks / OTP / documents. */
  async apiUsage() {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const r = (await sql<Record<string, string>>`
        select
          (select count(*) from public.webhook_events) as webhook_total,
          (select count(*) from public.webhook_events where created_at >= date_trunc('day', now())) as webhook_today,
          (select count(*) from public.webhook_events where processing_status = 'success') as webhook_success,
          (select count(*) from public.otp_attempts) as otp_total,
          (select count(*) from public.otp_attempts where created_at >= date_trunc('day', now())) as otp_today,
          (select count(*) from public.otp_attempts where status in ('delivered', 'sent', 'verified')) as otp_delivered,
          (select count(*) from public.practitioners where id_document_url is not null) as documents`.execute(trx)).rows[0] ?? {};
      const n = (k: string) => Number(r[k] ?? 0);
      const rate = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 100) : 0);
      return { fedapay: { total: n('webhook_total'), today: n('webhook_today'), successRate: rate(n('webhook_success'), n('webhook_total')) }, twilio: { total: n('otp_total'), today: n('otp_today'), successRate: rate(n('otp_delivered'), n('otp_total')) }, storage: { documents: n('documents') } };
    });
  }

  /** Rôles administrateurs de l'utilisateur courant (useAdminRole). */
  async rolesOf(userId: string): Promise<AdminRole[]> {
    const rows = await this.database.db.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
    return rows.map((r) => r.role as AdminRole);
  }
}

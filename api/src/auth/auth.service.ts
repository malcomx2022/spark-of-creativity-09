import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { sql, type Transaction } from 'kysely';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB, User } from '../database/types';
import { EmailService } from '../notifications/email.service';
import { OTP_PROVIDER, type OtpProvider } from '../notifications/otp.provider';
import type { LoginDto, RegisterDto, SendOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { isValidE164, normalizePhoneNumber } from './phone.util';
import { RoleResolverService } from './role-resolver.service';
import { IssuedSession, sha256, TokensService } from './tokens.service';
import { assertActiveAccount } from './account-status.service';

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const EMAIL_TOKEN_TTL = 24 * 3600;
const RESET_TOKEN_TTL = 3600;

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

export interface SessionResponse extends IssuedSession {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    emailVerified: u.email_verified_at !== null,
    phoneVerified: u.phone_verified_at !== null,
    metadata: u.raw_user_meta_data,
    createdAt: u.created_at,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly tokens: TokensService,
    private readonly roles: RoleResolverService,
    private readonly email: EmailService,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Inscription e-mail / mot de passe (ex supabase.auth.signUp)
  // ---------------------------------------------------------------------------
  async register(dto: RegisterDto, meta: RequestMeta): Promise<{ user: PublicUser; requiresEmailVerification: boolean; session: IssuedSession | null }> {
    const phone = dto.phone ? normalizePhoneNumber(dto.phone) : null;
    if (phone && !isValidE164(phone)) throw new BadRequestException('Format de numéro invalide (ex : +22990123456)');

    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const existing = await trx.selectFrom('users').select('id').where('email', '=', dto.email).where('deleted_at', 'is', null).executeTakeFirst();
      if (existing) throw new ConflictException('Un compte existe déjà avec cette adresse e-mail');

      // Même structure que options.data du signUp Supabase : lue par handle_new_user_safe()
      // (création du profil) et par le front (pending_onboarding, user_type…).
      const metadata: Record<string, unknown> = {
        full_name: dto.fullName,
        user_type: dto.userType,
        ...(phone ? { phone } : {}),
        ...(dto.practitionerType ? { practitioner_type: dto.practitionerType } : {}),
        ...(dto.pendingOnboarding ? { pending_onboarding: dto.pendingOnboarding } : {}),
      };

      let user: User;
      try {
        user = await trx
          .insertInto('users')
          .values({
            email: dto.email,
            phone,
            password_hash: await bcrypt.hash(dto.password, BCRYPT_COST),
            raw_user_meta_data: JSON.stringify(metadata),
            raw_app_meta_data: JSON.stringify({ provider: 'email', providers: ['email'] }),
            ...(this.config.REQUIRE_EMAIL_VERIFICATION ? {} : { email_verified_at: new Date() }),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictException('Ce numéro de téléphone est déjà utilisé par un autre compte');
        throw err;
      }

      if (!this.config.REQUIRE_EMAIL_VERIFICATION) {
        const session = await this.tokens.issueSession(trx, user, meta);
        return { user: toPublicUser(user), requiresEmailVerification: false, session };
      }
      await this.sendVerificationEmail(trx, user);
      return { user: toPublicUser(user), requiresEmailVerification: true, session: null };
    });
  }

  private async sendVerificationEmail(trx: Transaction<DB>, user: User): Promise<void> {
    if (!user.email) return;
    const token = await this.tokens.createOneTimeToken(trx, { userId: user.id, identifier: user.email, kind: 'email_verification', ttlSeconds: EMAIL_TOKEN_TTL });
    const link = `${this.config.FRONTEND_URL}/confirm-email?token=${token}`;
    await this.email.send({
      to: user.email,
      subject: 'Confirmez votre adresse e-mail — Domicares',
      text: `Bonjour,\n\nConfirmez votre adresse en ouvrant ce lien (valable 24 h) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.`,
      html: `<p>Bonjour,</p><p>Confirmez votre adresse en cliquant sur ce lien (valable 24 h) :</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const row = await this.tokens.consumeOneTimeToken(trx, 'email_verification', token);
      if (!row || !row.user_id) throw new BadRequestException('Lien de confirmation invalide ou expiré');
      await trx.updateTable('users').set({ email_verified_at: new Date() }).where('id', '=', row.user_id).where('email_verified_at', 'is', null).execute();
      return { verified: true as const };
    });
  }

  /** Réponse volontairement identique que l'e-mail existe ou non (pas d'énumération). */
  async resendVerification(email: string): Promise<{ sent: true }> {
    await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const user = await trx.selectFrom('users').selectAll().where('email', '=', email).where('deleted_at', 'is', null).executeTakeFirst();
      if (user && !user.email_verified_at) await this.sendVerificationEmail(trx, user);
    });
    return { sent: true };
  }

  // ---------------------------------------------------------------------------
  // Connexion (ex signInWithPassword)
  // ---------------------------------------------------------------------------
  async login(dto: LoginDto, meta: RequestMeta): Promise<SessionResponse> {
    const user = await this.database.runAs(SERVICE_CONTEXT, (trx) =>
      trx.selectFrom('users').selectAll().where('email', '=', dto.email).where('deleted_at', 'is', null).executeTakeFirst(),
    );
    if (!user || !user.password_hash) throw new UnauthorizedException('Identifiants incorrects');
    assertActiveAccount(user);
    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new HttpException('Trop de tentatives. Compte verrouillé temporairement.', HttpStatus.LOCKED);
    }

    // Les hash bcrypt migrés depuis Supabase (auth.users.encrypted_password) restent valides.
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      // Transaction dédiée : le compteur doit être commité même si l'on répond 401.
      const attempts = user.failed_login_attempts + 1;
      await this.database.runAs(SERVICE_CONTEXT, (trx) =>
        trx
          .updateTable('users')
          .set({ failed_login_attempts: attempts, locked_until: attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
          .where('id', '=', user.id)
          .execute(),
      );
      throw new UnauthorizedException('Identifiants incorrects');
    }
    if (this.config.REQUIRE_EMAIL_VERIFICATION && !user.email_verified_at) {
      throw new ForbiddenException({ statusCode: 403, error: 'EMAIL_NOT_VERIFIED', message: 'Veuillez confirmer votre adresse e-mail avant de vous connecter' });
    }
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      await trx.updateTable('users').set({ failed_login_attempts: 0, locked_until: null, last_sign_in_at: new Date() }).where('id', '=', user.id).execute();
      const session = await this.tokens.issueSession(trx, user, meta);
      return { ...session, user: toPublicUser(user) };
    });
  }

  // ---------------------------------------------------------------------------
  // Refresh / logout
  // ---------------------------------------------------------------------------
  async refresh(refreshToken: string, meta: RequestMeta): Promise<SessionResponse> {
    const result = await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const initial = await trx.selectFrom('refresh_tokens').select('family_id').where('token_hash', '=', sha256(refreshToken)).executeTakeFirst();
      if (!initial) throw new UnauthorizedException('Session invalide');
      // Sérialiser toute la famille, y compris une rotation du jeton enfant concurrente
      // à la détection de réutilisation du parent. Aucun verrou hors de cette transaction.
      await sql`select pg_advisory_xact_lock(hashtextextended(${initial.family_id}::text, 0))`.execute(trx);
      const row = await trx.selectFrom('refresh_tokens').selectAll().where('token_hash', '=', sha256(refreshToken)).forUpdate().executeTakeFirstOrThrow();
      if (row.revoked_at) {
        await trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('family_id', '=', row.family_id).where('revoked_at', 'is', null).execute();
        this.logger.warn(`Réutilisation de refresh token détectée (user ${row.user_id}) : famille révoquée`);
        // Répondre après COMMIT : lever ici annulerait la révocation.
        return { kind: 'reused' as const };
      }
      if (row.expires_at.getTime() < Date.now()) throw new UnauthorizedException('Session expirée');
      const user = await trx.selectFrom('users').selectAll().where('id', '=', row.user_id).where('deleted_at', 'is', null).executeTakeFirst();
      if (!user) throw new UnauthorizedException('Compte introuvable');
      assertActiveAccount(user);
      await trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', row.id).execute();
      const session = await this.tokens.issueSession(trx, user, { ...meta, familyId: row.family_id });
      return { kind: 'ok' as const, session: { ...session, user: toPublicUser(user) } };
    });
    if (result.kind === 'reused') throw new UnauthorizedException('Session révoquée. Veuillez vous reconnecter.');
    return result.session;
  }

  async logout(refreshToken: string | undefined, userId: string, everywhere: boolean): Promise<{ loggedOut: true }> {
    await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let q = trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('user_id', '=', userId).where('revoked_at', 'is', null);
      if (!everywhere && refreshToken) q = q.where('token_hash', '=', sha256(refreshToken));
      await q.execute();
    });
    return { loggedOut: true };
  }

  // ---------------------------------------------------------------------------
  // Profil de session (ex getUser + resolveUserRole)
  // ---------------------------------------------------------------------------
  async me(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const user = await trx.selectFrom('users').selectAll().where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
      if (!user) throw new UnauthorizedException('Compte introuvable');
      const profile = await trx.selectFrom('profiles').selectAll().where('id', '=', userId).executeTakeFirst();
      const resolved = await this.roles.resolve(trx, userId, user.raw_user_meta_data);
      return { user: toPublicUser(user), profile: profile ?? null, ...resolved };
    });
  }

  async updateMetadata(userId: string, patch: Record<string, unknown>): Promise<PublicUser> {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const user = await trx
        .updateTable('users')
        .set({ raw_user_meta_data: sql`raw_user_meta_data || ${JSON.stringify(patch)}::jsonb` })
        .where('id', '=', userId)
        .returningAll()
        .executeTakeFirst();
      if (!user) throw new NotFoundException('Compte introuvable');
      return toPublicUser(user);
    });
  }

  // ---------------------------------------------------------------------------
  // Mot de passe
  // ---------------------------------------------------------------------------
  async forgotPassword(email: string): Promise<{ sent: true }> {
    await this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const user = await trx.selectFrom('users').selectAll().where('email', '=', email).where('deleted_at', 'is', null).executeTakeFirst();
      if (!user || !user.email) return;
      const token = await this.tokens.createOneTimeToken(trx, { userId: user.id, identifier: user.email, kind: 'password_reset', ttlSeconds: RESET_TOKEN_TTL });
      const link = `${this.config.FRONTEND_URL}/reset-password?token=${token}`;
      await this.email.send({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe — Domicares',
        text: `Pour choisir un nouveau mot de passe (lien valable 1 h) :\n${link}`,
        html: `<p>Pour choisir un nouveau mot de passe (lien valable 1 h) :</p><p><a href="${link}">${link}</a></p>`,
      });
    });
    return { sent: true };
  }

  async resetPassword(token: string, password: string): Promise<{ reset: true }> {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const row = await this.tokens.consumeOneTimeToken(trx, 'password_reset', token);
      if (!row || !row.user_id) throw new BadRequestException('Lien de réinitialisation invalide ou expiré');
      await trx
        .updateTable('users')
        .set({ password_hash: await bcrypt.hash(password, BCRYPT_COST), failed_login_attempts: 0, locked_until: null, email_verified_at: sql`coalesce(email_verified_at, now())` })
        .where('id', '=', row.user_id)
        .execute();
      // Toutes les sessions sont fermées après un reset.
      await trx.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('user_id', '=', row.user_id).where('revoked_at', 'is', null).execute();
      return { reset: true as const };
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ changed: true }> {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const user = await trx.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
      if (!user) throw new NotFoundException('Compte introuvable');
      if (user.password_hash && !(await bcrypt.compare(currentPassword, user.password_hash))) throw new UnauthorizedException('Mot de passe actuel incorrect');
      await trx.updateTable('users').set({ password_hash: await bcrypt.hash(newPassword, BCRYPT_COST) }).where('id', '=', userId).execute();
      return { changed: true as const };
    });
  }

  // ---------------------------------------------------------------------------
  // OTP SMS (ex send-otp / verify-otp + signInWithOtp)
  // ---------------------------------------------------------------------------
  async sendOtp(dto: SendOtpDto, meta: RequestMeta): Promise<{ sent: true; remaining?: number }> {
    const phone = normalizePhoneNumber(dto.phoneNumber);
    // Chaque écriture est commitée dans sa propre transaction : le journal otp_attempts et le
    // compteur de check_otp_rate_limit() doivent persister même quand la requête échoue.
    const log = (status: string, error?: string, sid?: string | null) =>
      this.database.runAs(SERVICE_CONTEXT, (trx) =>
        trx
          .insertInto('otp_attempts')
          .values({ phone_number: phone, channel: dto.channel, status, error_message: error ?? null, twilio_sid: sid ?? null, ip_address: meta.ip ?? null, user_agent: meta.userAgent ?? null })
          .execute(),
      );

    if (!isValidE164(phone)) {
      await log('failed', 'Format de numéro invalide');
      throw new BadRequestException('Format de numéro invalide. Utilisez le format international (ex : +22990123456)');
    }
    // Fonction SQL héritée : 5 envois / 60 min, blocage 60 min.
    const rate = await this.database.runAs(
      SERVICE_CONTEXT,
      async (trx) => (await sql<{ r: { allowed: boolean; reason?: string; retry_after?: number; remaining?: number } }>`select check_otp_rate_limit(${phone}) as r`.execute(trx)).rows[0]?.r,
    );
    if (rate && !rate.allowed) {
      await log('failed', rate.reason === 'blocked' ? 'Compte temporairement bloqué' : 'Limite de tentatives atteinte');
      throw new HttpException(
        {
          statusCode: 429,
          error: 'RATE_LIMITED',
          message: rate.reason === 'blocked' ? `Compte temporairement bloqué. Réessayez dans ${Math.ceil((rate.retry_after ?? 0) / 60)} minutes.` : 'Trop de tentatives. Veuillez réessayer plus tard.',
          retryAfter: rate.retry_after,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const result = await this.otp.send(phone, dto.channel);
      await log(result.status, undefined, result.sid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur envoi OTP';
      await log('failed', message);
      throw new HttpException({ statusCode: 502, error: 'OTP_PROVIDER', message }, HttpStatus.BAD_GATEWAY);
    }
    return { sent: true as const, remaining: rate?.remaining };
  }

  /**
   * Vérifie le code puis connecte (ou crée) le compte associé au numéro :
   * profil existant → praticien existant → nouveau compte (profil créé par trigger).
   */
  async verifyOtp(dto: VerifyOtpDto, meta: RequestMeta): Promise<SessionResponse & { isNewUser: boolean }> {
    const phone = normalizePhoneNumber(dto.phoneNumber);
    if (!isValidE164(phone)) throw new BadRequestException('Format de numéro invalide');
    const status = await this.otp.check(phone, dto.code);
    if (status !== 'approved') throw new UnauthorizedException('Le code est invalide ou a expiré');

    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      let userId: string | undefined;
      const byProfile = await trx.selectFrom('profiles').select('id').where('phone', '=', phone).executeTakeFirst();
      userId = byProfile?.id;
      if (!userId) {
        const byPractitioner = await trx.selectFrom('practitioners').select('user_id').where('phone', '=', phone).executeTakeFirst();
        userId = byPractitioner?.user_id;
      }
      if (!userId) {
        const byUser = await trx.selectFrom('users').select('id').where('phone', '=', phone).executeTakeFirst();
        userId = byUser?.id;
      }

      let isNewUser = false;
      let user: User | undefined;
      if (userId) {
        assertActiveAccount(await trx.selectFrom('users').select(['deleted_at', 'banned_until']).where('id', '=', userId).executeTakeFirst());
        user = await trx
          .updateTable('users')
          .set({ phone, phone_verified_at: sql`coalesce(phone_verified_at, now())`, last_sign_in_at: new Date(), failed_login_attempts: 0, locked_until: null })
          .where('id', '=', userId)
          .returningAll()
          .executeTakeFirst();
      }
      if (!user) {
        isNewUser = true;
        user = await trx
          .insertInto('users')
          .values({
            email: null,
            phone,
            password_hash: null,
            phone_verified_at: new Date(),
            last_sign_in_at: new Date(),
            raw_user_meta_data: JSON.stringify({ phone, phone_verified: true, full_name: phone, user_type: 'patient' }),
            raw_app_meta_data: JSON.stringify({ provider: 'phone', providers: ['phone'] }),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }
      const session = await this.tokens.issueSession(trx, user, meta);
      return { ...session, user: toPublicUser(user), isNewUser };
    });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

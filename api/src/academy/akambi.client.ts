import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { akambiPath, signAkambiRequest } from './akambi.signature';

/** Préfixe des routes de l'API partenaires Akambi v1 (guide d'intégration v1.0 du 14 octobre 2026). */
export const AKAMBI_API_PREFIX = '/api/partners/v1';

export type AkambiCourseType = 'E_LEARNING' | 'VISIO_CONFERENCE' | 'PRESENTIEL';
export type AkambiCurrency = 'EURO' | 'DOLLAR' | 'FRANC_CFA';
export type AkambiAccountOrigin = 'CREATED' | 'EXISTING';
export type AkambiEnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CERTIFIED' | 'CANCELLED';

/** Formation (§6.1). `ARCHIVED` n'apparaît qu'avec `updatedSince`, pour retirer la formation du catalogue. */
export interface AkambiCourse {
  id: string;
  title: string;
  description: string | null;
  type: AkambiCourseType;
  status: 'PUBLISHED' | 'ARCHIVED';
  category: { code: string; title: string } | null;
  publicPrice: { amount: number; currency: AkambiCurrency } | null;
  moduleCount: number | null;
  chapterCount: number | null;
  coverImageUrl: string | null;
  presentationUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Apprenant (§6.2). */
export interface AkambiLearner {
  learnerId: string;
  externalLearnerId: string;
  email: string;
  firstName: string;
  lastName: string;
  accountOrigin: AkambiAccountOrigin;
  createdAt: string;
  updatedAt: string;
}

/** Inscription (§6.3) : `progress` entier de 0 à 100, dates `null` tant que l'événement n'a pas eu lieu. */
export interface AkambiEnrollment {
  id: string;
  externalLearnerId: string;
  learnerId: string;
  courseId: string;
  courseTitle: string;
  status: AkambiEnrollmentStatus;
  progress: number;
  enrolledAt: string;
  startedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  certificateId: string | null;
  updatedAt: string;
}

/** Attestation (§6.4). `downloadUrl` vaut 15 minutes : redemandé à chaque téléchargement, jamais stocké. */
export interface AkambiCertificate {
  id: string;
  enrollmentId: string;
  learnerName: string;
  courseTitle: string;
  score: { correctAnswers: number; totalQuestions: number } | null;
  completionDate: string | null;
  issuedAt: string;
  verificationUrl: string;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
}

/** Accès apprenant (§7) : `SSO` = lien à usage unique de 5 minutes ; `LOGIN_REQUIRED` = compte préexistant. */
export interface AkambiSsoLaunch {
  mode: 'SSO' | 'LOGIN_REQUIRED';
  url: string;
  expiresAt: string | null;
}

export interface AkambiReportCourse {
  courseId: string;
  courseTitle: string;
  enrollments: number;
  completed: number;
  certified: number;
  averageProgress: number;
  completionRate: number;
}

/** Agrégats limités aux apprenants DomiCares (§8) ; indicateurs définitifs encore à valider. */
export interface AkambiReport {
  generatedAt: string;
  totals: { learners: number; enrollments: number; inProgress: number; completed: number; certified: number; averageProgress: number; completionRate: number; certificationRate: number };
  exams: { attempts: number; passed: number; passRate: number };
  courses: AkambiReportCourse[];
}

export interface AkambiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AkambiPage<T> {
  items: T[];
  pagination: AkambiPagination;
}

export interface AkambiPageQuery {
  page?: number;
  /** 1 à 100, 50 par défaut côté Akambi. */
  limit?: number;
  updatedSince?: Date;
}

export interface AkambiEnrollmentQuery extends AkambiPageQuery {
  externalLearnerId?: string;
  courseId?: string;
  status?: AkambiEnrollmentStatus;
}

export interface AkambiLearnerInput {
  externalLearnerId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** Résultat d'une écriture idempotente : `created` (201) ou ressource existante (200), réponse rejouée ou non. */
export interface AkambiWriteResult<T> {
  resource: T;
  created: boolean;
  replayed: boolean;
}

/** Codes d'erreur stables documentés (§11), plus ceux produits par ce client. */
export type AkambiErrorCode =
  | 'MISSING_AUTH_HEADERS' | 'INVALID_API_KEY' | 'TIMESTAMP_OUT_OF_RANGE' | 'INVALID_NONCE' | 'INVALID_SIGNATURE' | 'REPLAYED_REQUEST'
  | 'PARTNER_INACTIVE'
  | 'INVALID_JSON' | 'VALIDATION_ERROR' | 'INVALID_PARAMETER' | 'INVALID_IDEMPOTENCY_KEY'
  | 'COURSE_NOT_FOUND' | 'LEARNER_NOT_FOUND' | 'ENROLLMENT_NOT_FOUND' | 'CERTIFICATE_NOT_FOUND'
  | 'LEARNER_EMAIL_MISMATCH' | 'LEARNER_ALREADY_LINKED' | 'ACCOUNT_NOT_LINKABLE' | 'ENROLLMENT_EXISTS_OUTSIDE_PARTNER' | 'CERTIFICATE_ISSUED'
  | 'IDEMPOTENCY_KEY_REUSED' | 'INTERNAL_ERROR'
  // Propres au client DomiCares : réponse illisible, délai dépassé, Akambi injoignable.
  | 'INVALID_RESPONSE' | 'TIMEOUT' | 'UNREACHABLE';

export class AkambiError extends Error {
  constructor(message: string, readonly status: number, readonly code: AkambiErrorCode | string, readonly details?: unknown) {
    super(message);
    this.name = 'AkambiError';
  }
}

export interface AkambiClient {
  /** GET /ping : vérifie la signature (§8, « Démarrage »). */
  ping(): Promise<{ partner: { code: string; name: string }; serverTime: string }>;
  listCourses(query?: AkambiPageQuery): Promise<AkambiPage<AkambiCourse>>;
  getCourse(courseId: string): Promise<AkambiCourse>;
  /** POST /learners : crée (`CREATED`) ou rattache (`EXISTING`) le compte ; même `idempotencyKey` pour une reprise. */
  upsertLearner(input: AkambiLearnerInput, idempotencyKey: string): Promise<AkambiWriteResult<AkambiLearner>>;
  getLearner(externalLearnerId: string): Promise<AkambiLearner>;
  /** POST /enrollments : une seule inscription par apprenant et par formation (201 puis 200 avec le même id). */
  createEnrollment(input: { externalLearnerId: string; courseId: string }, idempotencyKey: string): Promise<AkambiWriteResult<AkambiEnrollment>>;
  getEnrollment(enrollmentId: string): Promise<AkambiEnrollment>;
  listEnrollments(query?: AkambiEnrollmentQuery): Promise<AkambiPage<AkambiEnrollment>>;
  /** DELETE /enrollments/{id} : renvoie le dernier état avec `CANCELLED` ; refusé après attestation. */
  cancelEnrollment(enrollmentId: string): Promise<AkambiEnrollment>;
  /** POST /sso/launch : à appeler au clic ; l'URL n'est ni stockée, ni journalisée, ni envoyée par e-mail. */
  launchSso(input: { externalLearnerId: string; courseId?: string }): Promise<AkambiSsoLaunch>;
  getCertificate(enrollmentId: string): Promise<AkambiCertificate>;
  getReports(): Promise<AkambiReport>;
}

export const AKAMBI_CLIENT = Symbol('AKAMBI_CLIENT');

interface CallOptions {
  query?: Record<string, string | number | Date | null | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

interface CallResult<T> {
  status: number;
  data: T;
  pagination?: AkambiPagination;
  replayed: boolean;
}

const MAX_ATTEMPTS = 3;

/** Seules variables lues par le client HTTP (le script `akambi-ping` le construit sans le reste de la configuration). */
export type AkambiClientConfig = Pick<AppConfig, 'AKAMBI_BASE_URL' | 'AKAMBI_API_KEY' | 'AKAMBI_API_SECRET' | 'AKAMBI_TIMEOUT_MS'>;

/**
 * Client HTTP de l'API partenaires Akambi : échanges serveur à serveur signés (guide §3).
 * Chaque tentative porte un nouvel horodatage et un nouveau nonce ; l'`Idempotency-Key` reste la même
 * (§4.4). Seules les erreurs réseau, les délais dépassés et les 5xx sont retentés.
 */
@Injectable()
export class HttpAkambiClient implements AkambiClient {
  private readonly logger = new Logger(HttpAkambiClient.name);
  private readonly baseUrl: string;
  /** Attente entre deux tentatives ; remplaçable par les tests. */
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  constructor(@Inject(APP_CONFIG) private readonly config: AkambiClientConfig) {
    this.baseUrl = (config.AKAMBI_BASE_URL ?? '').replace(/\/+$/, '');
  }

  private async call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, options: CallOptions = {}): Promise<CallResult<T>> {
    // Chemin, query et corps figés une fois : ce sont exactement ceux signés et envoyés.
    const pathWithQuery = akambiPath(`${AKAMBI_API_PREFIX}${path}`, options.query);
    const body = options.body === undefined ? '' : JSON.stringify(options.body);
    let lastError: AkambiError | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await this.sleep(500 * 2 ** (attempt - 2));
      try {
        return await this.send<T>(method, pathWithQuery, body, options.idempotencyKey);
      } catch (err) {
        // Une réponse 2xx illisible n'est pas retentée : Akambi a traité la requête.
        if (!(err instanceof AkambiError) || err.status < 500 || err.code === 'INVALID_RESPONSE') throw err;
        lastError = err;
      }
    }
    throw lastError ?? new AkambiError('Akambi injoignable', 504, 'UNREACHABLE');
  }

  private async send<T>(method: string, pathWithQuery: string, body: string, idempotencyKey?: string): Promise<CallResult<T>> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Partner-API-Key': this.config.AKAMBI_API_KEY ?? '',
      'X-Partner-Timestamp': timestamp,
      'X-Partner-Nonce': nonce,
      'X-Partner-Signature': signAkambiRequest(this.config.AKAMBI_API_SECRET ?? '', timestamp, nonce, method, pathWithQuery, body),
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.AKAMBI_TIMEOUT_MS);
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.baseUrl}${pathWithQuery}`, { method, headers, body: body || undefined, signal: controller.signal });
      text = await res.text();
    } catch (err) {
      const timeout = err instanceof Error && err.name === 'AbortError';
      this.logger.warn(`Akambi ${method} ${pathWithQuery} → ${timeout ? 'délai dépassé' : 'injoignable'}`);
      throw new AkambiError(timeout ? 'Akambi ne répond pas (délai dépassé)' : 'Akambi injoignable', 504, timeout ? 'TIMEOUT' : 'UNREACHABLE');
    } finally {
      clearTimeout(timer);
    }

    // Une réponse non JSON (proxy en 502, page d'erreur) ne doit pas faire échouer le parsing sans contexte.
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = undefined;
    }
    const envelope = (parsed && typeof parsed === 'object' ? parsed : {}) as { data?: unknown; pagination?: AkambiPagination; error?: { code?: string; message?: string; details?: unknown } };

    if (!res.ok) {
      const code = envelope.error?.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_RESPONSE');
      // Ni corps, ni message, ni détails dans les journaux : ils peuvent reprendre e-mail et nom de l'apprenant.
      const log = `Akambi ${method} ${pathWithQuery} → ${res.status} ${code}`;
      if (res.status === 401 || res.status === 403) this.logger.error(log);
      else this.logger.warn(log);
      throw new AkambiError(envelope.error?.message ?? `Erreur Akambi ${res.status}`, res.status, code, envelope.error?.details);
    }
    if (parsed === undefined || envelope.data === undefined) {
      this.logger.warn(`Akambi ${method} ${pathWithQuery} → ${res.status} réponse illisible`);
      throw new AkambiError('Réponse Akambi illisible', 502, 'INVALID_RESPONSE');
    }
    return { status: res.status, data: envelope.data as T, pagination: envelope.pagination, replayed: res.headers.get('idempotent-replayed') === 'true' };
  }

  private async page<T>(path: string, query: AkambiEnrollmentQuery | AkambiPageQuery): Promise<AkambiPage<T>> {
    const res = await this.call<T[]>('GET', path, { query: { ...query } });
    if (!Array.isArray(res.data) || !res.pagination) throw new AkambiError('Liste Akambi sans pagination', 502, 'INVALID_RESPONSE');
    return { items: res.data, pagination: res.pagination };
  }

  async ping() {
    return (await this.call<{ partner: { code: string; name: string }; serverTime: string }>('GET', '/ping')).data;
  }

  listCourses(query: AkambiPageQuery = {}) {
    return this.page<AkambiCourse>('/courses', query);
  }

  async getCourse(courseId: string) {
    return (await this.call<AkambiCourse>('GET', `/courses/${encodeURIComponent(courseId)}`)).data;
  }

  async upsertLearner(input: AkambiLearnerInput, idempotencyKey: string) {
    const res = await this.call<AkambiLearner>('POST', '/learners', { body: { externalLearnerId: input.externalLearnerId, email: input.email, firstName: input.firstName, lastName: input.lastName }, idempotencyKey });
    return { resource: res.data, created: res.status === 201, replayed: res.replayed };
  }

  async getLearner(externalLearnerId: string) {
    return (await this.call<AkambiLearner>('GET', `/learners/${encodeURIComponent(externalLearnerId)}`)).data;
  }

  async createEnrollment(input: { externalLearnerId: string; courseId: string }, idempotencyKey: string) {
    const res = await this.call<AkambiEnrollment>('POST', '/enrollments', { body: { externalLearnerId: input.externalLearnerId, courseId: input.courseId }, idempotencyKey });
    return { resource: res.data, created: res.status === 201, replayed: res.replayed };
  }

  async getEnrollment(enrollmentId: string) {
    return (await this.call<AkambiEnrollment>('GET', `/enrollments/${encodeURIComponent(enrollmentId)}`)).data;
  }

  listEnrollments(query: AkambiEnrollmentQuery = {}) {
    return this.page<AkambiEnrollment>('/enrollments', query);
  }

  async cancelEnrollment(enrollmentId: string) {
    return (await this.call<AkambiEnrollment>('DELETE', `/enrollments/${encodeURIComponent(enrollmentId)}`)).data;
  }

  async launchSso(input: { externalLearnerId: string; courseId?: string }) {
    return (await this.call<AkambiSsoLaunch>('POST', '/sso/launch', { body: input.courseId ? { externalLearnerId: input.externalLearnerId, courseId: input.courseId } : { externalLearnerId: input.externalLearnerId } })).data;
  }

  async getCertificate(enrollmentId: string) {
    return (await this.call<AkambiCertificate>('GET', `/enrollments/${encodeURIComponent(enrollmentId)}/certificate`)).data;
  }

  async getReports() {
    return (await this.call<AkambiReport>('GET', '/reports')).data;
  }
}

type FakeEnrollment = AkambiEnrollment & { certificate: AkambiCertificate | null };

/**
 * Client factice pour le développement et les tests : reproduit en mémoire les règles documentées
 * (rattachement, unicité, idempotence, codes 404/409/422, modes d'accès), sans réseau.
 */
@Injectable()
export class FakeAkambiClient implements AkambiClient {
  readonly courses = new Map<string, AkambiCourse>();
  readonly learners = new Map<string, AkambiLearner>();
  readonly enrollments = new Map<string, FakeEnrollment>();
  /** E-mails de comptes Akambi antérieurs au partenariat : rattachés en `EXISTING`. */
  readonly existingAccountEmails = new Set<string>();
  /** E-mails de formateurs ou administrateurs Akambi : `409 ACCOUNT_NOT_LINKABLE`. */
  readonly nonLinkableEmails = new Set<string>();
  /** Couples `e-mail|courseId` inscrits hors partenariat : `409 ENROLLMENT_EXISTS_OUTSIDE_PARTNER`. */
  readonly outsideEnrollments = new Set<string>();
  /** Liens d'accès délivrés (contrôle des tests ; un vrai lien n'est jamais conservé côté DomiCares). */
  readonly launches: Array<AkambiSsoLaunch & { externalLearnerId: string; courseId: string | null }> = [];
  private readonly idempotency = new Map<string, { body: string; result: AkambiWriteResult<unknown> }>();
  private lastTime = 0;

  /** Dates strictement croissantes : l'ordre par `updatedAt` reste déterministe dans les tests. */
  private now(): string {
    this.lastTime = Math.max(Date.now(), this.lastTime + 1);
    return new Date(this.lastTime).toISOString();
  }

  private replay<T>(key: string, body: unknown, run: () => AkambiWriteResult<T>): AkambiWriteResult<T> {
    const serialized = JSON.stringify(body);
    const previous = this.idempotency.get(key);
    if (previous) {
      if (previous.body !== serialized) throw new AkambiError('Clé d’idempotence déjà utilisée avec un autre corps', 422, 'IDEMPOTENCY_KEY_REUSED');
      return { ...(previous.result as AkambiWriteResult<T>), replayed: true };
    }
    const result = run();
    this.idempotency.set(key, { body: serialized, result });
    return result;
  }

  private publicEnrollment(e: FakeEnrollment): AkambiEnrollment {
    const { certificate: _certificate, ...rest } = e;
    return { ...rest };
  }

  seedCourse(course: Partial<AkambiCourse> & { title: string }): AkambiCourse {
    const at = this.now();
    const full: AkambiCourse = { id: randomUUID(), description: null, type: 'E_LEARNING', status: 'PUBLISHED', category: { code: 'DOMICARES-SANTE', title: 'DomiCares Santé' }, publicPrice: null, moduleCount: 1, chapterCount: 4, coverImageUrl: null, presentationUrl: null, createdAt: at, updatedAt: at, ...course };
    this.courses.set(full.id, full);
    return full;
  }

  async ping() {
    return { partner: { code: 'DOMICARES', name: 'DomiCares' }, serverTime: new Date().toISOString() };
  }

  async listCourses(query: AkambiPageQuery = {}) {
    // Sans updatedSince, seules les formations publiées sont visibles (§6.1).
    const all = [...this.courses.values()].filter((c) => (query.updatedSince ? c.updatedAt > query.updatedSince.toISOString() : c.status === 'PUBLISHED'));
    return paginate(all, query);
  }

  async getCourse(courseId: string) {
    const course = this.courses.get(courseId);
    if (!course || course.status !== 'PUBLISHED') throw new AkambiError('Formation introuvable', 404, 'COURSE_NOT_FOUND');
    return course;
  }

  async upsertLearner(input: AkambiLearnerInput, idempotencyKey: string) {
    return this.replay(idempotencyKey, input, () => {
      const email = input.email.toLowerCase();
      const known = this.learners.get(input.externalLearnerId);
      if (known) {
        if (known.email.toLowerCase() !== email) throw new AkambiError('Identifiant déjà associé à une autre adresse e-mail', 409, 'LEARNER_EMAIL_MISMATCH');
        return { resource: known, created: false, replayed: false };
      }
      const other = [...this.learners.values()].find((l) => l.email.toLowerCase() === email);
      if (other) throw new AkambiError('Compte déjà rattaché sous un autre identifiant', 409, 'LEARNER_ALREADY_LINKED', { externalLearnerId: other.externalLearnerId });
      if (this.nonLinkableEmails.has(email)) throw new AkambiError('Ce compte ne peut pas être rattaché', 409, 'ACCOUNT_NOT_LINKABLE');
      const at = this.now();
      const learner: AkambiLearner = { learnerId: randomUUID(), externalLearnerId: input.externalLearnerId, email: input.email, firstName: input.firstName, lastName: input.lastName, accountOrigin: this.existingAccountEmails.has(email) ? 'EXISTING' : 'CREATED', createdAt: at, updatedAt: at };
      this.learners.set(learner.externalLearnerId, learner);
      return { resource: learner, created: true, replayed: false };
    });
  }

  async getLearner(externalLearnerId: string) {
    const learner = this.learners.get(externalLearnerId);
    if (!learner) throw new AkambiError('Apprenant introuvable', 404, 'LEARNER_NOT_FOUND');
    return learner;
  }

  async createEnrollment(input: { externalLearnerId: string; courseId: string }, idempotencyKey: string) {
    return this.replay(idempotencyKey, input, () => {
      const learner = this.learners.get(input.externalLearnerId);
      if (!learner) throw new AkambiError('Apprenant introuvable', 404, 'LEARNER_NOT_FOUND');
      const course = this.courses.get(input.courseId);
      if (!course || course.status !== 'PUBLISHED') throw new AkambiError('Formation introuvable', 404, 'COURSE_NOT_FOUND');
      const existing = [...this.enrollments.values()].find((e) => e.externalLearnerId === input.externalLearnerId && e.courseId === input.courseId);
      if (existing) return { resource: this.publicEnrollment(existing), created: false, replayed: false };
      if (this.outsideEnrollments.has(`${learner.email.toLowerCase()}|${course.id}`)) throw new AkambiError('Déjà inscrit hors partenariat', 409, 'ENROLLMENT_EXISTS_OUTSIDE_PARTNER');
      const at = this.now();
      const enrollment: FakeEnrollment = { id: randomUUID(), externalLearnerId: learner.externalLearnerId, learnerId: learner.learnerId, courseId: course.id, courseTitle: course.title, status: 'ENROLLED', progress: 0, enrolledAt: at, startedAt: null, lastActivityAt: null, completedAt: null, certificateId: null, updatedAt: at, certificate: null };
      this.enrollments.set(enrollment.id, enrollment);
      return { resource: this.publicEnrollment(enrollment), created: true, replayed: false };
    });
  }

  private enrollment(enrollmentId: string): FakeEnrollment {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) throw new AkambiError('Inscription introuvable', 404, 'ENROLLMENT_NOT_FOUND');
    return enrollment;
  }

  async getEnrollment(enrollmentId: string) {
    return this.publicEnrollment(this.enrollment(enrollmentId));
  }

  async listEnrollments(query: AkambiEnrollmentQuery = {}) {
    const all = [...this.enrollments.values()]
      .filter((e) => !query.updatedSince || e.updatedAt > query.updatedSince.toISOString())
      .filter((e) => (!query.externalLearnerId || e.externalLearnerId === query.externalLearnerId) && (!query.courseId || e.courseId === query.courseId) && (!query.status || e.status === query.status))
      .map((e) => this.publicEnrollment(e));
    return paginate(all, query);
  }

  async cancelEnrollment(enrollmentId: string) {
    const enrollment = this.enrollment(enrollmentId);
    if (enrollment.certificate) throw new AkambiError('Désinscription impossible après l’attestation', 409, 'CERTIFICATE_ISSUED');
    this.enrollments.delete(enrollmentId);
    return { ...this.publicEnrollment(enrollment), status: 'CANCELLED' as const, updatedAt: this.now() };
  }

  async launchSso(input: { externalLearnerId: string; courseId?: string }) {
    const learner = await this.getLearner(input.externalLearnerId);
    if (input.courseId && ![...this.enrollments.values()].some((e) => e.externalLearnerId === learner.externalLearnerId && e.courseId === input.courseId)) {
      throw new AkambiError('Inscription introuvable', 404, 'ENROLLMENT_NOT_FOUND');
    }
    const launch: AkambiSsoLaunch = learner.accountOrigin === 'EXISTING'
      ? { mode: 'LOGIN_REQUIRED', url: `https://akambi.fake/connexion?formation=${input.courseId ?? ''}`, expiresAt: null }
      : { mode: 'SSO', url: `https://akambi.fake/partenaires/connexion?token=${randomUUID()}`, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    this.launches.push({ ...launch, externalLearnerId: learner.externalLearnerId, courseId: input.courseId ?? null });
    return launch;
  }

  async getCertificate(enrollmentId: string) {
    const enrollment = this.enrollment(enrollmentId);
    if (!enrollment.certificate) throw new AkambiError('Attestation non délivrée', 404, 'CERTIFICATE_NOT_FOUND');
    return { ...enrollment.certificate, downloadUrl: `https://akambi.fake/attestations/${enrollment.certificate.id}.pdf?exp=${Date.now() + 15 * 60_000}`, downloadUrlExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  async getReports() {
    const list = [...this.enrollments.values()];
    const pct = (n: number, d: number) => (d ? Math.round((n * 100) / d) : 0);
    const avg = (items: FakeEnrollment[]) => (items.length ? Math.round(items.reduce((s, e) => s + e.progress, 0) / items.length) : 0);
    const done = (e: FakeEnrollment) => e.status === 'COMPLETED' || e.status === 'CERTIFIED';
    const certified = list.filter((e) => e.status === 'CERTIFIED').length;
    const completed = list.filter(done).length;
    const courses = [...new Set(list.map((e) => e.courseId))].map((courseId) => {
      const items = list.filter((e) => e.courseId === courseId);
      return { courseId, courseTitle: items[0].courseTitle, enrollments: items.length, completed: items.filter(done).length, certified: items.filter((e) => e.status === 'CERTIFIED').length, averageProgress: avg(items), completionRate: pct(items.filter(done).length, items.length) };
    });
    return {
      generatedAt: new Date().toISOString(),
      totals: { learners: this.learners.size, enrollments: list.length, inProgress: list.filter((e) => e.status === 'IN_PROGRESS').length, completed, certified, averageProgress: avg(list), completionRate: pct(completed, list.length), certificationRate: pct(certified, list.length) },
      exams: { attempts: certified, passed: certified, passRate: certified ? 100 : 0 },
      courses,
    };
  }

  /** Simule la progression côté Akambi (§6.3 : statut et dates dérivés de la progression). */
  setProgress(enrollmentId: string, progress: number): AkambiEnrollment {
    const enrollment = this.enrollment(enrollmentId);
    const at = this.now();
    enrollment.progress = Math.max(0, Math.min(100, Math.round(progress)));
    if (enrollment.progress > 0) {
      enrollment.startedAt ??= at;
      enrollment.lastActivityAt = at;
    }
    if (!enrollment.certificate) enrollment.status = enrollment.progress >= 100 ? 'COMPLETED' : enrollment.progress > 0 ? 'IN_PROGRESS' : 'ENROLLED';
    if (enrollment.progress >= 100) enrollment.completedAt ??= at;
    enrollment.updatedAt = at;
    return this.publicEnrollment(enrollment);
  }

  /** Simule la réussite de l'évaluation finale et la délivrance de l'attestation. */
  issueCertificate(enrollmentId: string, score = { correctAnswers: 9, totalQuestions: 10 }): AkambiCertificate {
    const enrollment = this.enrollment(enrollmentId);
    if (enrollment.progress < 100) this.setProgress(enrollmentId, 100);
    const learner = this.learners.get(enrollment.externalLearnerId);
    const at = this.now();
    const id = `CERT-FAKE-${enrollment.id.slice(0, 8).toUpperCase()}`;
    enrollment.certificate = { id, enrollmentId: enrollment.id, learnerName: `${learner?.firstName ?? ''} ${learner?.lastName ?? ''}`.trim(), courseTitle: enrollment.courseTitle, score, completionDate: enrollment.completedAt, issuedAt: at, verificationUrl: `https://akambi.fake/attestations/${id}?cle=${randomUUID()}`, downloadUrl: null, downloadUrlExpiresAt: null };
    enrollment.status = 'CERTIFIED';
    enrollment.certificateId = id;
    enrollment.updatedAt = at;
    return enrollment.certificate;
  }
}

/** Pagination Akambi (§4.2) : tri par `updatedAt` croissant puis identifiant, `limit` de 1 à 100. */
function paginate<T extends { updatedAt: string; id?: string; learnerId?: string }>(items: T[], query: AkambiPageQuery): AkambiPage<T> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const page = Math.max(1, query.page ?? 1);
  const sorted = [...items].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || String(a.id ?? a.learnerId).localeCompare(String(b.id ?? b.learnerId)));
  return { items: sorted.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: sorted.length, totalPages: Math.ceil(sorted.length / limit) } };
}

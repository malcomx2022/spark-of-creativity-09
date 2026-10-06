import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { Appointment, AppointmentUpdate, DB } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { SmsService } from '../notifications/sms.service';
import { PaymentsService } from '../payments/payments.service';
import { haversineKm } from '../practitioners/practitioners.service';
import type { CreateAppointmentDto, ListAppointmentsQuery, PractitionerStatusDto, RespondDto } from './appointments.dto';
import { appointmentResponse } from './appointment-response';

const DEFAULT_NON_COACH_AMOUNT = 15_000;
const DEFAULT_COACH_AMOUNT = 10_000;
const ACTIVE_STATUSES = ['pending_payment', 'awaiting_practitioner', 'confirmed', 'pending', 'in-progress', 'awaiting_confirmation'];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly inApp: InAppNotificationsService,
    private readonly sms: SmsService,
    private readonly payments: PaymentsService,
  ) {}

  private formatDate(d: string): string {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ---------------------------------------------------------------------------
  // Création (patient) — ex useAppointments.createAppointment + notify-appointment-request
  // ---------------------------------------------------------------------------
  async create(userId: string, dto: CreateAppointmentDto) {
    const today = new Date();
    const [y, m, d] = dto.date.split('-').map(Number);
    const appointmentDay = new Date(y, m - 1, d);
    today.setHours(0, 0, 0, 0);
    if (appointmentDay < today) throw new BadRequestException('La date du rendez-vous est déjà passée');
    if (appointmentDay.getTime() === today.getTime()) {
      const [h, min] = dto.time.split(':').map(Number);
      const at = new Date();
      at.setHours(h, min, 0, 0);
      if (at < new Date()) throw new BadRequestException("L'heure du rendez-vous est déjà passée. Veuillez choisir un créneau ultérieur.");
    }

    const created = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const defaultAddress = await trx.selectFrom('addresses').select(['address', 'latitude', 'longitude']).where('user_id', '=', userId).where('is_default', '=', true).executeTakeFirst();
      let practitioner: { id: string; name: string; user_id: string; practitioner_type: string | null };
      let assignedOffSlot = false;
      if (dto.practitionerId) {
        const chosen = await trx.selectFrom('practitioners').select(['id', 'name', 'user_id', 'practitioner_type', 'can_accept_missions', 'kyc_status']).where('id', '=', dto.practitionerId).executeTakeFirst();
        if (!chosen) throw new NotFoundException('Praticien introuvable');
        if (!chosen.can_accept_missions || chosen.kyc_status !== 'approved') throw new BadRequestException("Ce praticien n'accepte pas de missions actuellement");
        practitioner = chosen;
      } else {
        // Demande sans praticien (NewAppointmentDialog, « Enregistrer quand même ») : affectation du praticien validé
        // le plus proche (type ou spécialité, rayon 100 km), de préférence disponible sur le créneau.
        const point = dto.latitude !== undefined && dto.longitude !== undefined
          ? { latitude: dto.latitude, longitude: dto.longitude }
          : defaultAddress?.latitude && defaultAddress?.longitude
            ? { latitude: Number(defaultAddress.latitude), longitude: Number(defaultAddress.longitude) }
            : null;
        if (!point) throw new BadRequestException('Position inconnue : activez la géolocalisation ou enregistrez une adresse par défaut');
        const nearest = await this.findNearestPractitioner(trx, { ...point, specialty: dto.specialty, date: dto.date, time: dto.time, allowOffSlot: true });
        if (!nearest) throw new NotFoundException(`Aucun praticien validé pour « ${dto.specialty} » dans un rayon de 100 km`);
        practitioner = nearest;
        assignedOffSlot = !nearest.onSlot;
      }
      const profile = await trx.selectFrom('profiles').select(['full_name', 'phone']).where('id', '=', userId).executeTakeFirst();
      const address = dto.address ?? defaultAddress?.address ?? 'Adresse à préciser';
      const appointment = await trx
        .insertInto('appointments')
        .values({
          patient_id: userId, patient_name: profile?.full_name ?? 'Patient',
          practitioner_id: practitioner.id, practitioner_name: practitioner.name,
          specialty: dto.specialty, date: dto.date, time: dto.time, duration: dto.duration,
          reason: dto.reason, urgency_level: dto.urgencyLevel ?? null, notes: dto.notes ?? null,
          status: 'awaiting_practitioner', address,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const title = 'Nouvelle demande de rendez-vous';
      const message = `${appointment.patient_name} demande un rendez-vous le ${this.formatDate(dto.date)} à ${dto.time} (${dto.specialty}). Motif : ${dto.reason}`;
      await this.inApp.notifyUser(trx, practitioner.user_id, { title, message, type: 'appointment', link: practitioner.practitioner_type === 'coach_sportif' ? '/dashboard/coach' : '/dashboard/practitioner' });
      if (assignedOffSlot) {
        // Aucun praticien disponible sur le créneau : la demande part quand même au plus proche, les admins suivent.
        await this.inApp.notifyAdmins(trx, { title: 'Demande affectée hors créneau', message: `${appointment.patient_name} : ${dto.specialty} le ${this.formatDate(dto.date)} à ${dto.time}. Aucun praticien disponible sur ce créneau, demande transmise à ${practitioner.name} (suivi recommandé).`, type: 'appointment', link: '/admin?tab=operations' });
      }
      const practitionerPhone = (await trx.selectFrom('profiles').select('phone').where('id', '=', practitioner.user_id).executeTakeFirst())?.phone;
      return { appointment, practitionerPhone, patientName: appointment.patient_name };
    });
    if (created.practitionerPhone) {
      await this.sms.send(created.practitionerPhone, `DomiCares: ${created.patientName} demande un RDV le ${this.formatDate(dto.date)} à ${dto.time}. Connectez-vous pour accepter ou refuser.`).catch(() => undefined);
    }
    return appointmentResponse(created.appointment, userId);
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------
  async list(userId: string, q: ListAppointmentsQuery) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      let query = trx.selectFrom('appointments').selectAll().where((eb) => (practitioner ? eb.or([eb('patient_id', '=', userId), eb('practitioner_id', '=', practitioner.id)]) : eb('patient_id', '=', userId)));
      if (q.status === 'active') query = query.where('status', 'in', ACTIVE_STATUSES as Appointment['status'][]);
      else if (q.status) query = query.where('status', '=', q.status as Appointment['status']);
      if (q.from) query = query.where('date', '>=', q.from);
      if (q.to) query = query.where('date', '<=', q.to);
      return (await query.orderBy('date', 'desc').orderBy('time', 'desc').limit(q.limit).execute()).map((a) => appointmentResponse(a, userId));
    });
  }

  private async load(trx: Transaction<DB>, userId: string, id: string): Promise<{ appointment: Appointment; isPatient: boolean; isPractitioner: boolean; practitionerId: string | null; isAdmin: boolean }> {
    const appointment = await trx.selectFrom('appointments').selectAll().where('id', '=', id).executeTakeFirst();
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable');
    const practitioner = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
    const isPractitioner = !!practitioner && practitioner.id === appointment.practitioner_id;
    const isPatient = appointment.patient_id === userId;
    const isAdmin = !!(await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst());
    if (!isPatient && !isPractitioner && !isAdmin) throw new ForbiddenException('Accès non autorisé à ce rendez-vous');
    return { appointment, isPatient, isPractitioner, practitionerId: practitioner?.id ?? null, isAdmin };
  }

  async get(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment } = await this.load(trx, userId, id);
      // Les notes internes du praticien ne sont pas exposées au patient (mask_appointment_internal_notes).
      return appointmentResponse(appointment, userId);
    });
  }

  // ---------------------------------------------------------------------------
  // Réponse du praticien — ex handle-appointment-response
  // ---------------------------------------------------------------------------
  async respond(userId: string, id: string, dto: RespondDto) {
    if (dto.action === 'accept') return this.accept(userId, id, dto);
    return this.reject(userId, id, dto);
  }

  private async accept(userId: string, id: string, dto: RespondDto) {
    const prepared = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPractitioner } = await this.load(trx, userId, id);
      if (!isPractitioner) throw new ForbiddenException("Vous n'êtes pas autorisé à traiter ce rendez-vous");
      if (appointment.status !== 'awaiting_practitioner') throw new ConflictException({ statusCode: 409, message: `Ce rendez-vous n'est plus en attente de réponse (statut : ${appointment.status})`, currentStatus: appointment.status });
      const practitioner = await trx.selectFrom('practitioners').select(['practitioner_type']).where('id', '=', appointment.practitioner_id).executeTakeFirstOrThrow();
      let amount = appointment.payment_amount && appointment.payment_amount > 0 ? appointment.payment_amount : null;
      if (amount === null) {
        const rate = await trx.selectFrom('practitioner_rates').select('base_price').where('practitioner_id', '=', appointment.practitioner_id).where('service_type', '=', appointment.specialty).executeTakeFirst();
        if (rate) amount = rate.base_price;
        else if (practitioner.practitioner_type === 'coach_sportif') {
          const service = await trx.selectFrom('services').select('base_price').where('name', '=', appointment.specialty).executeTakeFirst();
          amount = service?.base_price ?? DEFAULT_COACH_AMOUNT;
        } else amount = DEFAULT_NON_COACH_AMOUNT;
      }
      const patient = await trx.selectFrom('profiles').select(['phone', 'full_name']).where('id', '=', appointment.patient_id).executeTakeFirst();
      if (!patient?.phone) throw new BadRequestException("Le patient n'a pas de numéro de téléphone enregistré");
      // Verrou optimiste sur le statut.
      const updated = await trx.updateTable('appointments').set({ status: 'pending_payment', payment_amount: amount, updated_at: new Date() }).where('id', '=', id).where('status', '=', 'awaiting_practitioner').returning('id').executeTakeFirst();
      if (!updated) throw new ConflictException('Ce rendez-vous vient d’être traité par ailleurs');
      return { appointment, amount: amount ?? DEFAULT_NON_COACH_AMOUNT, patient };
    });

    // Paiement au nom du patient (comme l'Edge Function avec bypassAuth).
    try {
      const payment = await this.payments.create(prepared.appointment.patient_id, {
        appointmentId: id, amount: prepared.amount, paymentMethod: dto.paymentMethod,
        phoneNumber: prepared.patient.phone!.startsWith('+229') ? prepared.patient.phone! : `+229${prepared.patient.phone!.replace(/^\+/, '')}`,
        payerName: prepared.patient.full_name ?? prepared.appointment.patient_name,
      });
      await this.database.runAs(SERVICE_CONTEXT, (trx) =>
        this.inApp.notifyUser(trx, prepared.appointment.patient_id, {
          title: '✅ Rendez-vous accepté — paiement requis',
          message: `${prepared.appointment.practitioner_name} a accepté votre rendez-vous le ${prepared.appointment.date} à ${prepared.appointment.time}. Payez ${prepared.amount} XOF pour finaliser.`,
          type: 'payment_required', link: payment.paymentUrl,
        }),
      );
      return { success: true, status: 'pending_payment' as const, amount: prepared.amount, paymentId: payment.paymentId, paymentUrl: payment.paymentUrl, transactionId: payment.transactionId, expiresAt: payment.expiresAt };
    } catch (err) {
      await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.updateTable('appointments').set({ status: 'awaiting_practitioner', updated_at: new Date() }).where('id', '=', id).where('status', '=', 'pending_payment').execute());
      throw err;
    }
  }

  /**
   * Praticien validé le plus proche (rayon 100 km) pour une spécialité ou un type de praticien, disponible sur le
   * créneau (planning hebdomadaire et exceptions) ; à défaut le plus proche si `allowOffSlot`.
   */
  private async findNearestPractitioner(trx: Transaction<DB>, opts: { latitude: number; longitude: number; specialty: string; date: string; time: string; excludeId?: string; allowOffSlot?: boolean }) {
    let query = trx
      .selectFrom('practitioners')
      .select(['id', 'name', 'user_id', 'practitioner_type', 'latitude', 'longitude'])
      // La spécialité peut aussi être un type de praticien (NewAppointmentDialog envoie le type) : comparaison textuelle, l'enum refuserait une valeur libre.
      .where((eb) => eb.or([eb('specialty', '=', opts.specialty), eb(sql<string>`practitioner_type::text`, '=', opts.specialty)]))
      .where('available', '=', true).where('can_accept_missions', '=', true)
      .where('kyc_status', '=', 'approved').where('kyc_validated_at', 'is not', null)
      .where('latitude', 'is not', null).where('longitude', 'is not', null);
    if (opts.excludeId) query = query.where('id', '!=', opts.excludeId);
    const candidates = await query.execute();
    const sorted = candidates
      .map((c) => ({ ...c, distance: haversineKm(opts.latitude, opts.longitude, Number(c.latitude), Number(c.longitude)) }))
      .filter((c) => c.distance <= 100)
      .sort((a, b) => a.distance - b.distance);
    const dayOfWeek = new Date(`${opts.date}T00:00:00Z`).getUTCDay();
    for (const c of sorted) {
      const exception = await trx.selectFrom('practitioner_exceptions').select('is_available').where('practitioner_id', '=', c.id).where('date', '=', opts.date).executeTakeFirst();
      const slot = await trx.selectFrom('practitioner_availability').select('id').where('practitioner_id', '=', c.id).where('day_of_week', '=', dayOfWeek).where('is_active', '=', true).where('start_time', '<=', opts.time).where('end_time', '>', opts.time).executeTakeFirst();
      if ((exception && exception.is_available) || (!exception && slot)) return { ...c, onSlot: true };
    }
    return opts.allowOffSlot && sorted[0] ? { ...sorted[0], onSlot: false } : null;
  }

  private async reject(userId: string, id: string, dto: RespondDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPractitioner } = await this.load(trx, userId, id);
      if (!isPractitioner) throw new ForbiddenException("Vous n'êtes pas autorisé à traiter ce rendez-vous");
      if (appointment.status !== 'awaiting_practitioner') throw new ConflictException(`Ce rendez-vous n'est plus en attente de réponse (statut : ${appointment.status})`);
      await trx.updateTable('appointments').set({ status: 'rejected', internal_notes: dto.reason ? `REJECTED: ${dto.reason}` : appointment.internal_notes, updated_at: new Date() }).where('id', '=', id).execute();

      // Réassignation automatique : praticien validé de même spécialité, le plus proche (rayon 100 km), disponible sur le créneau.
      const address = await trx.selectFrom('addresses').select(['latitude', 'longitude']).where('user_id', '=', appointment.patient_id).where('is_default', '=', true).executeTakeFirst();
      const replacement = address?.latitude && address?.longitude
        ? await this.findNearestPractitioner(trx, { latitude: Number(address.latitude), longitude: Number(address.longitude), specialty: appointment.specialty, date: appointment.date, time: appointment.time, excludeId: appointment.practitioner_id })
        : null;
      if (replacement) {
        const reassigned = await trx.updateTable('appointments').set({ practitioner_id: replacement.id, practitioner_name: replacement.name, status: 'awaiting_practitioner', updated_at: new Date() }).where('id', '=', id).where('status', '=', 'rejected').returning('id').executeTakeFirst();
        if (reassigned) {
          await this.inApp.notifyUser(trx, replacement.user_id, { title: 'Nouvelle demande de rendez-vous', message: `${appointment.patient_name} demande un rendez-vous le ${this.formatDate(appointment.date)} à ${appointment.time} (${appointment.specialty}).`, type: 'appointment', link: replacement.practitioner_type === 'coach_sportif' ? '/dashboard/coach' : '/dashboard/practitioner' });
          await this.inApp.notifyUser(trx, appointment.patient_id, { title: 'Rendez-vous réassigné', message: `${appointment.practitioner_name} n'est pas disponible. Votre demande a été transmise à ${replacement.name}.`, type: 'appointment', link: '/dashboard/patient' });
          return { success: true, status: 'awaiting_practitioner' as const, reassignedTo: { id: replacement.id, name: replacement.name } };
        }
      }
      await this.inApp.notifyUser(trx, appointment.patient_id, { title: '❌ Rendez-vous refusé', message: 'Le praticien a refusé votre rendez-vous. Aucun praticien alternatif trouvé. Veuillez réessayer.', type: 'appointment', link: '/dashboard/patient' });
      return { success: true, status: 'rejected' as const, reassignedTo: null };
    });
  }

  // ---------------------------------------------------------------------------
  // Déroulement de la consultation
  // ---------------------------------------------------------------------------
  /** Ex PractitionerStatusControl : preparing → en_route → arrived → in_progress (+ GPS). */
  async updatePractitionerStatus(userId: string, id: string, dto: PractitionerStatusDto) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPractitioner } = await this.load(trx, userId, id);
      if (!isPractitioner) throw new ForbiddenException('Réservé au praticien du rendez-vous');
      if (!['confirmed', 'in-progress'].includes(appointment.status)) throw new ConflictException(`Le rendez-vous doit être confirmé (statut : ${appointment.status})`);
      const patch: AppointmentUpdate = { practitioner_status: dto.status, updated_at: new Date() };
      if (dto.latitude !== undefined && dto.longitude !== undefined) Object.assign(patch, { practitioner_latitude: dto.latitude, practitioner_longitude: dto.longitude, practitioner_last_location_update: new Date() });
      if (dto.status === 'en_route' || dto.status === 'arrived') patch.visit_status = dto.status;
      if (dto.status === 'in_progress') Object.assign(patch, { status: 'in-progress', visit_status: 'in_progress', consultation_started_at: appointment.consultation_started_at ?? new Date() });
      const updated = await trx.updateTable('appointments').set(patch).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      if (dto.status === 'arrived') await this.inApp.notifyUser(trx, appointment.patient_id, { title: 'Praticien arrivé', message: `${appointment.practitioner_name} est arrivé(e).`, type: 'appointment', link: '/dashboard/patient' });
      return appointmentResponse(updated, userId);
    });
  }

  /** Ex CompleteConsultationForm : fin de consultation → attente de confirmation du patient. */
  async complete(userId: string, id: string, notes?: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPractitioner } = await this.load(trx, userId, id);
      if (!isPractitioner) throw new ForbiddenException('Réservé au praticien du rendez-vous');
      if (!['in-progress', 'confirmed'].includes(appointment.status)) throw new ConflictException(`Consultation non démarrée (statut : ${appointment.status})`);
      const updated = await trx
        .updateTable('appointments')
        .set({ status: 'awaiting_confirmation', visit_status: 'completed', consultation_ended_at: new Date(), confirmation_requested_at: new Date(), internal_notes: ['CONSULTATION_TERMINEE', notes, appointment.internal_notes].filter(Boolean).join('\n'), updated_at: new Date() })
        .where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.inApp.notifyUser(trx, appointment.patient_id, { title: 'Consultation terminée', message: `Merci de confirmer la consultation avec ${appointment.practitioner_name}. Sans réponse sous 24 h, elle sera confirmée automatiquement.`, type: 'appointment', link: '/dashboard/patient' });
      return appointmentResponse(updated, userId);
    });
  }

  /** Ex ConsultationConfirmation : le patient confirme → completed (les fonds pourront être libérés). */
  async confirm(userId: string, id: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPatient } = await this.load(trx, userId, id);
      if (!isPatient) throw new ForbiddenException('Réservé au patient du rendez-vous');
      if (appointment.status !== 'awaiting_confirmation') throw new ConflictException(`Aucune confirmation attendue (statut : ${appointment.status})`);
      const updated = await trx.updateTable('appointments').set({ status: 'completed', patient_confirmed_at: new Date(), updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return appointmentResponse(updated, userId);
    });
  }

  async cancel(userId: string, id: string, reason?: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const { appointment, isPatient, isPractitioner, isAdmin } = await this.load(trx, userId, id);
      if (!isPatient && !isPractitioner && !isAdmin) throw new ForbiddenException();
      if (['completed', 'cancelled', 'cancelled_unpaid', 'rejected'].includes(appointment.status)) throw new ConflictException(`Ce rendez-vous ne peut plus être annulé (statut : ${appointment.status})`);
      const openPayment = await trx.selectFrom('payments').select(['id', 'status']).where('appointment_id', '=', id).where('status', 'in', ['initiated', 'pending', 'authorized']).executeTakeFirst();
      if (openPayment) await this.payments.cancelPending(userId, openPayment.id).catch((e) => this.logger.warn(`Annulation paiement ${openPayment.id} : ${e}`));
      const paid = await trx.selectFrom('payments').select('id').where('appointment_id', '=', id).where('status', '=', 'paid').executeTakeFirst();
      const updated = await trx.updateTable('appointments').set({ status: 'cancelled', visit_status: 'cancelled', internal_notes: [reason ? `CANCELLED: ${reason}` : null, appointment.internal_notes].filter(Boolean).join('\n') || null, updated_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      const other = isPatient ? (await trx.selectFrom('practitioners').select('user_id').where('id', '=', appointment.practitioner_id).executeTakeFirst())?.user_id : appointment.patient_id;
      if (other) await this.inApp.notifyUser(trx, other, { title: 'Rendez-vous annulé', message: `Le rendez-vous du ${appointment.date} à ${appointment.time} a été annulé.${paid ? ' Un remboursement sera traité par le support.' : ''}`, type: 'appointment' });
      return { ...appointmentResponse(updated, userId), refundRequired: !!paid };
    });
  }
}

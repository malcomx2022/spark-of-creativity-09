import { AuditService } from '../audit/audit.service';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../notifications/email.service';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { SmsService } from '../notifications/sms.service';
import type { KycDecisionDto, KycQueueQuery } from './kyc.dto';

/** File KYC administrateur : port de KYCQueue.tsx + approve_practitioner_kyc() + send-kyc-status-notification. */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly inApp: InAppNotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  queue(adminId: string, q: KycQueueQuery) {
    return this.database.runAs({ role: 'authenticated', userId: adminId }, (trx) => {
      let query = trx
        .selectFrom('practitioners')
        .selectAll() // KYCQueue.tsx affiche aussi expirations, diplômes, zone et types de séance
        .orderBy('created_at', 'asc')
        .limit(q.limit);
      if (q.status === 'pending') query = query.where('kyc_status', 'in', ['pending', 'incomplete']);
      else if (q.status !== 'all') query = query.where('kyc_status', '=', q.status);
      return query.execute();
    });
  }

  async decide(adminId: string, practitionerId: string, dto: KycDecisionDto) {
    const outcome = await this.database.runAs({ role: 'service_role', userId: adminId }, async (trx) => {
      const current = await trx.selectFrom('practitioners').select(['id', 'user_id', 'name', 'phone', 'kyc_status', 'practitioner_type']).where('id', '=', practitionerId).executeTakeFirst();
      if (!current) throw new NotFoundException('Praticien introuvable');
      if (dto.expectedCurrentStatus && current.kyc_status !== dto.expectedCurrentStatus) {
        throw new ConflictException(`Le statut KYC a été modifié par un autre administrateur (statut actuel : ${current.kyc_status}). Veuillez rafraîchir la page.`);
      }
      if (dto.status === 'approved') {
        // Fonction SQL héritée (SECURITY DEFINER) : approuve + can_accept_missions + horodatages.
        const r = (await sql<{ r: { success: boolean; error?: string } }>`select approve_practitioner_kyc(${current.user_id}::uuid, ${adminId}::uuid) as r`.execute(trx)).rows[0]?.r;
        if (!r?.success) throw new NotFoundException(r?.error ?? 'Praticien introuvable');
        if (dto.comment) await trx.updateTable('practitioners').set({ kyc_comment: dto.comment }).where('id', '=', practitionerId).execute();
      } else {
        await trx
          .updateTable('practitioners')
          .set({ kyc_status: dto.status, kyc_comment: dto.comment ?? null, kyc_reviewed_at: new Date(), kyc_reviewed_by: adminId, can_accept_missions: false, updated_at: new Date() })
          .where('id', '=', practitionerId)
          .execute();
      }
      // Historique KYC de KYCQueue.tsx : action « KYC <statut> » sur l'entité practitioner.
      await this.audit.log(trx, { adminId, action: `KYC ${dto.status}`, entityType: 'practitioner', entityId: practitionerId, details: { status: dto.status, comment: dto.comment ?? null, previous_status: current.kyc_status } });
      const user = await trx.selectFrom('users').select(['email', 'phone']).where('id', '=', current.user_id).executeTakeFirst();
      const messages = this.buildMessages(dto.status, dto.comment, current.practitioner_type === 'coach_sportif');
      await this.inApp.notifyUser(trx, current.user_id, { title: messages.title, message: messages.inApp, type: 'kyc', link: messages.dashboardPath });
      return { current, user, messages };
    });

    // Envois externes hors transaction (non bloquants, comme dans l'Edge Function).
    const { current, user, messages } = outcome;
    let emailSent = false;
    let smsSent = false;
    if (user?.email) {
      emailSent = await this.email.send({ to: user.email, subject: messages.subject, html: messages.html, text: messages.text }).then(() => true).catch((e) => (this.logger.error(`E-mail KYC : ${e}`), false));
    }
    const phone = user?.phone ?? current.phone; // le compte e-mail n'a pas forcément de téléphone : on prend celui du praticien
    if (phone) smsSent = await this.sms.send(phone, messages.sms).catch(() => false);
    return { success: true, practitionerId, status: dto.status, emailSent, smsSent, message: `Notification ${dto.status} envoyée à ${current.name}` };
  }

  /** Textes de send-kyc-status-notification (approved / rejected / incomplete). */
  private buildMessages(status: 'approved' | 'rejected' | 'incomplete', comment: string | undefined, coach: boolean) {
    const dashboardPath = coach ? '/dashboard/coach' : '/dashboard/practitioner';
    const dashboardUrl = `${this.config.FRONTEND_URL}${dashboardPath}`;
    const role = coach ? 'coach' : 'praticien';
    const short = (n: number) => (comment ? comment.slice(0, n) + (comment.length > n ? '…' : '') : '');
    switch (status) {
      case 'approved':
        return {
          title: 'Compte activé', dashboardPath,
          subject: '✅ Votre compte DomiCares est activé !',
          text: `Bonne nouvelle : votre dossier ${role} a été validé. Vous pouvez désormais recevoir des consultations.\n${dashboardUrl}`,
          html: `<p>Bonne nouvelle : votre dossier ${role} a été validé. Vous pouvez désormais recevoir des consultations.</p><p><a href="${dashboardUrl}">Accéder à mon tableau de bord</a></p>`,
          sms: `✅ DomiCares : Votre compte ${role} est activé ! Vous pouvez maintenant recevoir des consultations. Connectez-vous : ${dashboardUrl}`,
          inApp: 'Votre dossier a été validé : vous pouvez recevoir des consultations.',
        };
      case 'rejected':
        return {
          title: 'Dossier refusé', dashboardPath,
          subject: '❌ Votre dossier DomiCares nécessite votre attention',
          text: `Votre dossier n'a pas été validé.${comment ? `\nRaison : ${comment}` : ''}\nContactez le support pour plus d'informations.`,
          html: `<p>Votre dossier n'a pas été validé.</p>${comment ? `<p><strong>Raison :</strong> ${comment}</p>` : ''}<p>Contactez le support pour plus d'informations.</p>`,
          sms: `❌ DomiCares : Votre dossier n'a pas été validé. ${comment ? `Raison: ${short(80)}` : ''} Contactez le support pour plus d'infos.`,
          inApp: `Votre dossier n'a pas été validé.${comment ? ` Raison : ${comment}` : ''}`,
        };
      default:
        return {
          title: 'Dossier incomplet', dashboardPath,
          subject: '⚠️ Votre dossier DomiCares est incomplet',
          text: `Votre dossier est incomplet.${comment ? `\nÀ compléter : ${comment}` : ''}\nConnectez-vous pour le finaliser : ${dashboardUrl}`,
          html: `<p>Votre dossier est incomplet.</p>${comment ? `<p><strong>À compléter :</strong> ${comment}</p>` : ''}<p><a href="${dashboardUrl}">Finaliser mon dossier</a></p>`,
          sms: `⚠️ DomiCares : Votre dossier est incomplet. ${comment ? `À compléter: ${short(70)}` : ''} Connectez-vous pour finaliser.`,
          inApp: `Votre dossier est incomplet.${comment ? ` À compléter : ${comment}` : ''}`,
        };
    }
  }
}

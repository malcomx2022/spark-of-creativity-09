import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';
import type { DB } from '../database/types';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';

export interface CreateReviewInput {
  appointmentId: string;
  rating: number;
  comment?: string | null;
}

/**
 * Avis patients — port de useReviews / usePractitionerReviews / useReviewStats.
 * Règles reprises des policies : auteur = patient du rendez-vous, rendez-vous `completed`, un avis
 * par rendez-vous (contrainte unique), avis masqués visibles seulement par l'auteur et les admins.
 * Ajout : practitioners.rating recalculée (elle n'était jamais mise à jour).
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly database: DatabaseService, private readonly inApp: InAppNotificationsService) {}

  /** Moyenne des avis visibles → practitioners.rating (numeric(3,2)). */
  async recomputeRating(trx: Transaction<DB>, practitionerId: string) {
    const r = (await sql<{ avg: string | null; n: string }>`select round(avg(rating)::numeric, 2)::text as avg, count(*)::text as n from public.reviews where practitioner_id = ${practitionerId} and coalesce(is_hidden, false) = false`.execute(trx)).rows[0];
    await trx.updateTable('practitioners').set({ rating: r?.avg ? Number(r.avg) : 0, updated_at: new Date() }).where('id', '=', practitionerId).execute();
    return { average: r?.avg ? Number(r.avg) : 0, total: Number(r?.n ?? 0) };
  }

  create(userId: string, input: CreateReviewInput) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const a = await trx.selectFrom('appointments').select(['id', 'patient_id', 'practitioner_id', 'practitioner_name', 'status']).where('id', '=', input.appointmentId).executeTakeFirst();
      if (!a) throw new NotFoundException('Rendez-vous introuvable');
      if (a.patient_id !== userId) throw new ForbiddenException('Vous ne pouvez évaluer que vos propres rendez-vous');
      if (a.status !== 'completed') throw new ConflictException('Seule une consultation terminée peut être évaluée');
      const dup = await trx.selectFrom('reviews').select('id').where('appointment_id', '=', a.id).executeTakeFirst();
      if (dup) throw new ConflictException('Vous avez déjà évalué ce rendez-vous');
      const review = await trx.insertInto('reviews').values({ appointment_id: a.id, patient_id: userId, practitioner_id: a.practitioner_id, rating: input.rating, comment: input.comment ?? null }).returningAll().executeTakeFirstOrThrow();
      const stats = await this.recomputeRating(trx, a.practitioner_id);
      const pr = await trx.selectFrom('practitioners').select('user_id').where('id', '=', a.practitioner_id).executeTakeFirst();
      if (pr) await this.inApp.notifyUser(trx, pr.user_id, { title: 'Nouvel avis reçu', message: `Un patient vous a attribué ${input.rating}/5${input.comment ? ` : « ${input.comment.slice(0, 120)} »` : '.'}`, type: 'review', link: '/dashboard/practitioner?tab=reviews' });
      return { ...review, practitioner_rating: stats.average };
    });
  }

  listMine(userId: string) {
    return this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const rows = await trx.selectFrom('reviews').selectAll().where('patient_id', '=', userId).orderBy('created_at', 'desc').limit(50).execute();
      const ids = [...new Set(rows.map((r) => r.practitioner_id))];
      const practitioners = ids.length ? await trx.selectFrom('practitioners').select(['id', 'name', 'specialty']).where('id', 'in', ids).execute() : [];
      const aptIds = [...new Set(rows.map((r) => r.appointment_id))];
      const appointments = aptIds.length ? await trx.selectFrom('appointments').select(['id', 'specialty', 'date', 'practitioner_name']).where('id', 'in', aptIds).execute() : [];
      return rows.map((r) => ({ ...r, practitioner: practitioners.find((p) => p.id === r.practitioner_id) ?? null, appointment: appointments.find((a) => a.id === r.appointment_id) ?? null }));
    });
  }

  /** Avis publics d'un praticien (non masqués) + statistiques, paginés (ex usePractitionerReviews / useReviewStats). */
  forPractitioner(practitionerId: string, page: number, limit: number) {
    return this.database.runAs({ role: 'anon' }, async (trx) => {
      const base = trx.selectFrom('reviews').where('practitioner_id', '=', practitionerId).where((eb) => eb.or([eb('is_hidden', '=', false), eb('is_hidden', 'is', null)]));
      const data = await base.leftJoin('profiles', 'profiles.id', 'reviews.patient_id').select(['reviews.id', 'reviews.rating', 'reviews.comment', 'reviews.created_at', 'profiles.full_name as patient_name']).orderBy('reviews.created_at', 'desc').offset(page * limit).limit(limit).execute();
      const ratings = await base.select('rating').execute();
      const total = ratings.length;
      const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ratings.filter((r) => r.rating === stars).length }));
      return { data, stats: { totalReviews: total, averageRating: total ? Number((ratings.reduce((s, r) => s + r.rating, 0) / total).toFixed(1)) : 0, distribution } };
    });
  }

  /** Vue praticien de ses propres avis (masqués exclus, comme l'origine). */
  forMe(userId: string, page: number, limit: number) {
    return this.database.runAs(SERVICE_CONTEXT, async (trx) => {
      const p = await trx.selectFrom('practitioners').select('id').where('user_id', '=', userId).executeTakeFirst();
      if (!p) throw new ForbiddenException('Compte praticien requis');
      return this.forPractitioner(p.id, page, limit);
    });
  }
}

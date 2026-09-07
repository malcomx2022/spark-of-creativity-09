import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ');
const time = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Format HH:MM');

/** Port de useAppointments.createAppointment + create-appointment-with-payment. */
export const createAppointmentSchema = z.object({
  /** Absent : affectation côté serveur du praticien validé le plus proche (demande « sans praticien » de NewAppointmentDialog). */
  practitionerId: z.string().uuid().optional(),
  specialty: z.string().trim().min(2).max(100),
  /** Position du patient (géolocalisation) pour l'affectation automatique ; sinon l'adresse par défaut. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  date,
  time,
  duration: z.number().int().min(15).max(480).default(60),
  reason: z.string().trim().min(3, 'Motif requis').max(1000),
  address: z.string().trim().min(5).max(300).optional(),
  urgencyLevel: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

export const listAppointmentsQuerySchema = z.object({
  status: z.string().optional(),
  from: date.optional(),
  to: date.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

/** Ex handle-appointment-response : accept déclenche la demande de paiement, reject cherche un remplaçant. */
export const respondSchema = z.object({
  action: z.enum(['accept', 'reject']),
  paymentMethod: z.enum(['mtn', 'moov']).default('mtn'),
  reason: z.string().trim().max(500).optional(),
});
export type RespondDto = z.infer<typeof respondSchema>;

/** Ex PractitionerStatusControl : progression sur place + GPS. */
export const practitionerStatusSchema = z.object({
  status: z.enum(['preparing', 'en_route', 'arrived', 'in_progress']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type PractitionerStatusDto = z.infer<typeof practitionerStatusSchema>;

export const completeSchema = z.object({ notes: z.string().trim().max(2000).optional() });
export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

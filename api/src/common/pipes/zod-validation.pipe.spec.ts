import { BadRequestException } from '@nestjs/common';
import { configSchema } from '../../config/config.schema';
import { createGroupSessionSchema, updateGroupSessionSchema } from '../../group-sessions/group-sessions.dto';
import { addressSchema, careNoteSchema, consultationReportSchema, medicalProfileSchema, updateAddressSchema, updateCareNoteSchema, updateConsultationReportSchema } from '../../medical/medical.dto';
import { rateSchema, rateUpdateSchema } from '../../practitioners/practitioners.dto';
import { faqSchema, updateFaqSchema } from '../../support/support.dto';
import { ZodValidationPipe } from './zod-validation.pipe';

/** Comportements que zod 4 a changés et dont dépendent les DTO (migration depuis zod 3). */
describe('DTO zod 4', () => {
  // zod 4 applique un .default() dans un champ rendu facultatif par .partial() : un PATCH qui omettait
  // le champ le remettait à sa valeur par défaut (note de soin redevenue privée, FAQ visible de tous).
  it.each([
    ['tarif', rateUpdateSchema, { basePrice: 5_000 }, 'durationMinutes'],
    ['séance de groupe', updateGroupSessionSchema, { location: 'Cotonou, Haie Vive' }, 'minParticipants'],
    ['FAQ', updateFaqSchema, { answer: 'Réponse modifiée.' }, 'targetAudience'],
    ['FAQ', updateFaqSchema, { answer: 'Réponse modifiée.' }, 'category'],
    ['adresse', updateAddressSchema, { city: 'Porto-Novo' }, 'isDefault'],
    ['note de soin', updateCareNoteSchema, { plan: 'Pansement quotidien' }, 'sharedWithPatient'],
    ['compte rendu', updateConsultationReportSchema, { primaryDiagnosis: 'Entorse' }, 'shareWithDoctor'],
  ] as const)('mise à jour partielle (%s) : %s non ajouté quand il est omis', (_label, schema, input, field) => {
    const parsed = new ZodValidationPipe<Record<string, unknown>>(schema).transform(input);
    expect(parsed).not.toHaveProperty(field);
  });

  it('les valeurs par défaut restent appliquées à la création', () => {
    expect(rateSchema.parse({ serviceType: 'Soins', basePrice: 5_000 }).durationMinutes).toBe(60);
    expect(faqSchema.parse({ question: 'Q ?', answer: 'R.' })).toMatchObject({ category: 'Général', targetAudience: 'all' });
    expect(addressSchema.parse({ label: 'Maison', address: 'Rue 123, Cotonou' }).isDefault).toBe(false);
    expect(careNoteSchema.parse({ appointmentId: 'a' }).sharedWithPatient).toBe(false);
    const report = consultationReportSchema.parse({ appointmentId: 'a', consultationType: 'domicile', severityLevel: 'leger', clinicalFindings: 'RAS', primaryDiagnosis: 'Entorse' });
    expect(report).toMatchObject({ shareWithDoctor: false, completeAppointment: false });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const session = createGroupSessionSchema.parse({ sessionName: 'Yoga', sessionType: 'groupe', maxParticipants: 10, scheduledDate: tomorrow, startTime: '08:00', endTime: '09:00', pricePerPerson: 10_000, location: 'Cotonou, Haie Vive' });
    expect(session.minParticipants).toBe(1);
  });

  it('booléens de configuration : la valeur par défaut est une chaîne analysée, comme sous zod 3', () => {
    const config = configSchema.parse({ DATABASE_URL: 'postgresql://localhost/x', JWT_ACCESS_SECRET: 'x'.repeat(32) });
    expect(config).toMatchObject({ REQUIRE_EMAIL_VERIFICATION: true, COOKIE_SECURE: false, S3_FORCE_PATH_STYLE: true, JOBS_ENABLED: true, ACADEMY_ENABLED: false, REALTIME_ENABLED: true });
    expect(configSchema.parse({ DATABASE_URL: 'postgresql://localhost/x', JWT_ACCESS_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'yes' }).COOKIE_SECURE).toBe(true);
  });

  it('identifiants : tout UUID au format hexadécimal reste accepté (z.guid), comme sous zod 3', () => {
    // z.uuid() de zod 4 exige les bits de version et de variante RFC 9562 ; zod 3 acceptait tout hexadécimal.
    expect(medicalProfileSchema.safeParse({ primaryDoctorId: '11111111-1111-1111-1111-111111111111' }).success).toBe(true);
    expect(medicalProfileSchema.safeParse({ primaryDoctorId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('un refus garde la forme de réponse de ZodValidationPipe', () => {
    const pipe = new ZodValidationPipe(updateCareNoteSchema);
    try {
      pipe.transform({ sharedWithPatient: 'oui' });
      throw new Error('aucune exception');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ statusCode: 400, error: 'Validation', message: 'Données invalides', details: [{ path: 'sharedWithPatient', message: expect.any(String) }] });
    }
  });
});

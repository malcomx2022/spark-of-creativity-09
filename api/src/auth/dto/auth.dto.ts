import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide');
const password = z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(128);
const phone = z.string().trim().min(8, 'Numéro de téléphone requis');

export const registerSchema = z.object({
  email,
  password,
  fullName: z.string().trim().min(2, 'Nom complet requis').max(120),
  phone: phone.optional(),
  /** Même valeur que `options.data.user_type` du signUp Supabase. */
  userType: z.enum(['patient', 'practitioner']).default('patient'),
  practitionerType: z
    .enum(['medecin', 'infirmier', 'kinesitherapeute', 'nutritionniste', 'sage_femme', 'psychologue', 'coach_sportif', 'autre'])
    .optional(),
  /** Charge utile d'onboarding différée (src/lib/patient-onboarding.ts), stockée dans raw_user_meta_data. */
  pendingOnboarding: z.record(z.unknown()).optional(),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1) });
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });
export type RefreshDto = z.infer<typeof refreshSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20) });
export const resendVerificationSchema = z.object({ email });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

export const updateMetadataSchema = z.object({ metadata: z.record(z.unknown()) });
export type UpdateMetadataDto = z.infer<typeof updateMetadataSchema>;

export const sendOtpSchema = z.object({ phoneNumber: phone, channel: z.enum(['sms', 'whatsapp', 'call']).default('sms') });
export type SendOtpDto = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({ phoneNumber: phone, code: z.string().trim().regex(/^\d{4,8}$/, 'Code invalide') });
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

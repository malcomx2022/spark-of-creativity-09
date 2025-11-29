import { z } from 'zod';

export const mtnSchema = z.object({
  accountHolderName: z.string().trim().min(1, "Le nom du titulaire est obligatoire"),
  phoneNumber: z.string()
    .trim()
    .min(1, "Le numéro Mobile Money est obligatoire")
    .regex(/^\+[1-9][0-9]{7,14}$/, "Format invalide. Exemple attendu : +22960000000"),
});

export const moovSchema = z.object({
  accountHolderName: z.string().trim().min(1, "Le nom du titulaire est obligatoire"),
  phoneNumber: z.string()
    .trim()
    .min(1, "Le numéro Mobile Money est obligatoire")
    .regex(/^\+[1-9][0-9]{7,14}$/, "Format invalide. Exemple attendu : +22995000000"),
});

export const bankSchema = z.object({
  accountHolderName: z.string().trim().min(1, "Le nom du titulaire est obligatoire"),
  bankName: z.string().trim().min(1, "Le nom de la banque est obligatoire"),
  bankAccountNumber: z.string()
    .trim()
    .min(1, "Le numéro de compte est obligatoire")
    .regex(/^[0-9A-Za-z\s]{8,34}$/, "Numéro de compte invalide (8 à 34 caractères alphanumériques)")
    .transform(val => val.replace(/\s+/g, '').toUpperCase()),
});

export type MTNFormData = z.infer<typeof mtnSchema>;
export type MoovFormData = z.infer<typeof moovSchema>;
export type BankFormData = z.infer<typeof bankSchema>;

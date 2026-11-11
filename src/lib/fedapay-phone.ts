/**
 * Numéros Mobile Money du Bénin acceptés par les paiements FedaPay.
 * Depuis le 30 novembre 2024, la numérotation béninoise compte 10 chiffres (préfixe 01) ;
 * les deux formats restent acceptés, comme côté API (`payments.dto.ts`, `group-sessions.dto.ts`).
 */
export const BENIN_MOBILE_MONEY_PATTERN = /^\+229(01)?\d{8}$/;

/** Longueurs locales acceptées après +229 : ancien format (8) et format à 10 chiffres (01…). */
export const BENIN_LOCAL_NUMBER_LENGTHS = [8, 10];

/**
 * Numéros de test du sandbox FedaPay (`momo_test`). Les numéros approuvés ont été communiqués par
 * le support le 27/10/2026 ; le refus a été constaté avec `+22966000000` lors de la campagne
 * (document 09 §4 bis). Sans effet en mode live.
 */
export const FEDAPAY_SANDBOX_TEST_NUMBERS = {
  mtnApproved: '+229 01 66 00 00 01',
  moovApproved: '+229 01 64 00 00 01',
  declined: '+229 66 00 00 00',
} as const;

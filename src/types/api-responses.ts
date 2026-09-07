/**
 * Réponses de l'API utilisées par le front en dehors des hooks (ex `edge-function-responses.ts`).
 * Les lignes de tables sont typées localement dans chaque hook ou composant.
 */

export interface ReleaseHeldFundsResponse {
  success: boolean;
  results?: {
    total: number;
    released: number;
    failed: number;
    errors: Array<{ payment_id?: string; error?: string }>;
  };
  released_count?: number;
  message?: string;
}

export interface CreateTestAccountsResponse {
  accounts: Array<{
    type: string;
    email: string;
    password: string;
    id: string;
  }>;
}

export interface CreatePractitionerResponse {
  success: boolean;
  error?: string;
  details?: string[];
  practitionerId?: string;
  message?: string;
}

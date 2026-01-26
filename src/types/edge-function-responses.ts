/**
 * Types pour les réponses des edge functions
 */

export interface FindPractitionerResponse {
  success: boolean;
  practitioner?: {
    id: string;
    name: string;
    specialty: string;
    distance: number;
  };
  message?: string;
}

export interface AdminManagementResponse {
  success?: boolean;
  error?: string;
  tempPassword?: string;
  newPassword?: string;
}

export interface ReleaseHeldFundsResponse {
  success: boolean;
  results?: {
    total: number;
    released: number;
    failed: number;
    errors: any[];
  };
  released_count?: number;
  message?: string;
}

export interface MoMoWalletResponse {
  wallets: Array<{
    id: string;
    user_id: string;
    provider: string;
    phone_number: string;
    balance: number;
    created_at: string;
  }>;
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

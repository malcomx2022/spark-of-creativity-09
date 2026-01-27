/**
 * Gestion de la récupération des inscriptions orphelines
 *
 * Ce module permet de sauvegarder et récupérer les données d'inscription
 * lorsque l'edge function échoue après la création du compte auth.
 */

const STORAGE_KEY = 'domicares_pending_registration';
const MAX_AGE_MS = 60 * 60 * 1000; // 1 heure

export interface PendingRegistration {
  userId: string;
  email: string;
  userType: 'practitioner' | 'patient';
  practitionerType?: string;
  profileData: Record<string, unknown>;
  practitionerData?: Record<string, unknown>;
  documents?: Record<string, string>; // Base64 encoded
  timestamp: number;
}

/**
 * Sauvegarde une inscription en attente dans localStorage
 */
export function savePendingRegistration(data: Omit<PendingRegistration, 'timestamp'>): void {
  try {
    const registration: PendingRegistration = {
      ...data,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registration));
    console.log('[Registration Recovery] Inscription sauvegardée pour récupération:', data.userId);
  } catch (error) {
    console.error('[Registration Recovery] Erreur sauvegarde:', error);
  }
}

/**
 * Récupère une inscription en attente si elle existe et est encore valide
 */
export function getPendingRegistration(): PendingRegistration | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const registration: PendingRegistration = JSON.parse(stored);

    // Vérifier si l'inscription n'est pas expirée
    if (Date.now() - registration.timestamp > MAX_AGE_MS) {
      clearPendingRegistration();
      return null;
    }

    return registration;
  } catch (error) {
    console.error('[Registration Recovery] Erreur lecture:', error);
    return null;
  }
}

/**
 * Supprime l'inscription en attente
 */
export function clearPendingRegistration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Registration Recovery] Inscription en attente supprimée');
  } catch (error) {
    console.error('[Registration Recovery] Erreur suppression:', error);
  }
}

/**
 * Vérifie si une inscription est en attente pour un email donné
 */
export function hasPendingRegistrationForEmail(email: string): boolean {
  const pending = getPendingRegistration();
  return pending !== null && pending.email.toLowerCase() === email.toLowerCase();
}

/**
 * Vérifie si une inscription est en attente pour un userId donné
 */
export function hasPendingRegistrationForUser(userId: string): boolean {
  const pending = getPendingRegistration();
  return pending !== null && pending.userId === userId;
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = 'http://127.0.0.1:3100/api';
export const STATE_FILE = join(process.cwd(), 'test-results', 'recette-state.json');
export const PASSWORD = 'Recette#2026';

export interface RecetteState {
  tag: string;
  accounts: Record<'patientA' | 'patientB' | 'practitioner' | 'coach', { email: string; id: string; name: string }>;
  /** Rendez-vous patient A ↔ praticien : le plus ancien est hors de la première page des conversations. */
  oldAppointmentId: string;
  /** Rendez-vous individuel patient A ↔ coach. */
  coachAppointmentId: string;
  /** Rendez-vous patient A ↔ praticien le plus récent. */
  recentAppointmentId: string;
  /** Rendez-vous du patient B (ne doit jamais apparaître chez A). */
  patientBAppointmentId: string;
}

export function readState(): RecetteState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as RecetteState;
}

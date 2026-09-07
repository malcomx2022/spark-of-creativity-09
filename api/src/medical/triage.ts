/** Port de src/types/triage.ts — barème et seuils identiques (le score maximal réel est 37, l'affichage historique indique /25). */
import type { TriageAnswers } from './medical.dto';

const SCORES: Record<string, Record<string, number>> = {
  consciousness: { conscious: 0, confused: 3, unconscious: 5 },
  breathing: { normal: 0, mild: 2, severe: 5 },
  'chest-pain': { none: 0, moderate: 2, severe: 5 },
  bleeding: { none: 0, minor: 1, major: 5 },
  'pain-level': { mild: 1, moderate: 2, severe: 4 },
  symptoms: { fever: 2, vomiting: 1, dizzy: 2, confusion: 3, paralysis: 5 },
};

export const TRIAGE_MAX_SCORE = 25;

export interface TriageResult {
  score: number;
  urgencyLevel: 'immediate' | 'urgent' | 'semi-urgent' | 'non-urgent';
  message: string;
  recommendations: string[];
}

export function calculateTriageScore(answers: TriageAnswers): TriageResult {
  let score = 0;
  for (const [question, value] of Object.entries(answers)) {
    const table = SCORES[question];
    if (!table) continue;
    for (const v of Array.isArray(value) ? value : [value]) score += table[v] ?? 0;
  }
  if (score >= 15) return { score, urgencyLevel: 'immediate', message: 'URGENCE VITALE - Intervention immédiate requise', recommendations: ['Appeler le 15 (SAMU) immédiatement', 'Ne pas déplacer le patient', "Rester avec le patient jusqu'à l'arrivée des secours"] };
  if (score >= 10) return { score, urgencyLevel: 'urgent', message: 'URGENCE - Consultation rapide nécessaire', recommendations: ['Consulter un médecin dans les 2 heures', 'Se rendre aux urgences ou appeler SOS Médecins', "Surveiller l'évolution des symptômes"] };
  if (score >= 5) return { score, urgencyLevel: 'semi-urgent', message: 'Semi-urgent - Consultation dans les 24h recommandée', recommendations: ['Prendre rendez-vous avec votre médecin traitant', 'Consultation dans les 24 heures', 'Surveiller les symptômes'] };
  return { score, urgencyLevel: 'non-urgent', message: 'Non urgent - Consultation de routine', recommendations: ['Prendre rendez-vous avec votre médecin', "Pas d'urgence immédiate", 'Repos et surveillance'] };
}

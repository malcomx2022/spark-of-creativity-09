export type UrgencyLevel = 'immediate' | 'urgent' | 'semi-urgent' | 'non-urgent';

export interface TriageQuestion {
  id: string;
  question: string;
  type: 'radio' | 'checkbox';
  options: {
    label: string;
    value: string;
    score: number;
  }[];
}

export interface TriageResult {
  score: number;
  urgencyLevel: UrgencyLevel;
  message: string;
  recommendations: string[];
}

export const triageQuestions: TriageQuestion[] = [
  {
    id: 'consciousness',
    question: 'État de conscience du patient',
    type: 'radio',
    options: [
      { label: 'Conscient et orienté', value: 'conscious', score: 0 },
      { label: 'Confus ou désorienté', value: 'confused', score: 3 },
      { label: 'Inconscient ou non réactif', value: 'unconscious', score: 5 }
    ]
  },
  {
    id: 'breathing',
    question: 'Difficulté respiratoire',
    type: 'radio',
    options: [
      { label: 'Respiration normale', value: 'normal', score: 0 },
      { label: 'Légère difficulté', value: 'mild', score: 2 },
      { label: 'Difficulté importante ou essoufflement sévère', value: 'severe', score: 5 }
    ]
  },
  {
    id: 'chest-pain',
    question: 'Douleur thoracique',
    type: 'radio',
    options: [
      { label: 'Aucune', value: 'none', score: 0 },
      { label: 'Légère ou modérée', value: 'moderate', score: 2 },
      { label: 'Intense avec oppression', value: 'severe', score: 5 }
    ]
  },
  {
    id: 'bleeding',
    question: 'Saignement',
    type: 'radio',
    options: [
      { label: 'Aucun saignement', value: 'none', score: 0 },
      { label: 'Saignement mineur contrôlé', value: 'minor', score: 1 },
      { label: 'Saignement abondant non contrôlé', value: 'major', score: 5 }
    ]
  },
  {
    id: 'pain-level',
    question: 'Niveau de douleur (0-10)',
    type: 'radio',
    options: [
      { label: '0-3 (Légère)', value: 'mild', score: 1 },
      { label: '4-6 (Modérée)', value: 'moderate', score: 2 },
      { label: '7-10 (Sévère)', value: 'severe', score: 4 }
    ]
  },
  {
    id: 'symptoms',
    question: 'Symptômes additionnels (plusieurs choix possibles)',
    type: 'checkbox',
    options: [
      { label: 'Fièvre élevée (>39°C)', value: 'fever', score: 2 },
      { label: 'Vomissements persistants', value: 'vomiting', score: 1 },
      { label: 'Vertiges ou étourdissements', value: 'dizzy', score: 2 },
      { label: 'Confusion mentale', value: 'confusion', score: 3 },
      { label: 'Paralysie ou faiblesse soudaine', value: 'paralysis', score: 5 }
    ]
  }
];

export function calculateTriageScore(answers: Record<string, string | string[]>): TriageResult {
  let totalScore = 0;

  Object.entries(answers).forEach(([questionId, answer]) => {
    const question = triageQuestions.find(q => q.id === questionId);
    if (!question) return;

    if (Array.isArray(answer)) {
      // For checkbox questions
      answer.forEach(value => {
        const option = question.options.find(opt => opt.value === value);
        if (option) totalScore += option.score;
      });
    } else {
      // For radio questions
      const option = question.options.find(opt => opt.value === answer);
      if (option) totalScore += option.score;
    }
  });

  let urgencyLevel: UrgencyLevel;
  let message: string;
  let recommendations: string[];

  if (totalScore >= 15) {
    urgencyLevel = 'immediate';
    message = 'URGENCE VITALE - Intervention immédiate requise';
    recommendations = [
      'Appeler le 15 (SAMU) immédiatement',
      'Ne pas déplacer le patient',
      'Rester avec le patient jusqu\'à l\'arrivée des secours'
    ];
  } else if (totalScore >= 10) {
    urgencyLevel = 'urgent';
    message = 'URGENCE - Consultation rapide nécessaire';
    recommendations = [
      'Consulter un médecin dans les 2 heures',
      'Se rendre aux urgences ou appeler SOS Médecins',
      'Surveiller l\'évolution des symptômes'
    ];
  } else if (totalScore >= 5) {
    urgencyLevel = 'semi-urgent';
    message = 'Semi-urgent - Consultation dans les 24h recommandée';
    recommendations = [
      'Prendre rendez-vous avec votre médecin traitant',
      'Consultation dans les 24 heures',
      'Surveiller les symptômes'
    ];
  } else {
    urgencyLevel = 'non-urgent';
    message = 'Non urgent - Consultation de routine';
    recommendations = [
      'Prendre rendez-vous avec votre médecin',
      'Pas d\'urgence immédiate',
      'Repos et surveillance'
    ];
  }

  return {
    score: totalScore,
    urgencyLevel,
    message,
    recommendations
  };
}

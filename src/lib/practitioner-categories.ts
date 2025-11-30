// Mapping des types de praticiens vers des noms lisibles
export const PRACTITIONER_CATEGORIES: Record<string, string> = {
  medecin: "Médecin généraliste",
  infirmier: "Infirmier(ère)",
  kinesitherapeute: "Kinésithérapeute",
  nutritionniste: "Nutritionniste",
  sage_femme: "Sage-femme",
  psychologue: "Psychologue",
  coach_sportif: "Coach sportif",
  autre: "Autre",
};

// Fonction pour obtenir le nom lisible d'une catégorie
export const getCategoryLabel = (type: string | null | undefined): string => {
  if (!type) return "Non spécifié";
  return PRACTITIONER_CATEGORIES[type] || type;
};

// Fonction pour obtenir la clé d'une catégorie à partir du nom
export const getCategoryKey = (label: string): string | undefined => {
  const entry = Object.entries(PRACTITIONER_CATEGORIES).find(([_, value]) => value === label);
  return entry?.[0];
};

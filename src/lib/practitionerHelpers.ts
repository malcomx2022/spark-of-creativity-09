export const getKYCMessage = (kyc_status: string, kyc_comment?: string | null) => {
  const messages: Record<string, string> = {
    pending: "Votre dossier est en cours de vérification par notre équipe. Ce processus prend généralement 24 à 48 heures. Vous recevrez un email et un SMS dès que votre compte sera activé.",
    incomplete: `Des documents ou informations sont manquants dans votre dossier.${kyc_comment ? ` Détails : ${kyc_comment}` : ''}`,
    rejected: `Votre dossier n'a pas été validé.${kyc_comment ? ` Raison : ${kyc_comment}` : ''}`,
  };
  return messages[kyc_status] || '';
};

export const calculateRealDuration = (
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  defaultDuration: number
): number => {
  if (startedAt && endedAt) {
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    return Math.round((end.getTime() - start.getTime()) / 60000); // Convertir en minutes
  }
  return defaultDuration;
};

export const calculateMonthlyTotalMinutes = (appointments: Array<{ date: string; status: string; duration: number; consultation_started_at?: string; consultation_ended_at?: string }>) => {
  const now = new Date();
  return appointments
    .filter(apt => {
      const aptDate = new Date(apt.date);
      return (
        aptDate.getMonth() === now.getMonth() &&
        aptDate.getFullYear() === now.getFullYear() &&
        ['confirmed', 'completed'].includes(apt.status)
      );
    })
    .reduce((acc, apt) => {
      // Utiliser la durée réelle si disponible, sinon la durée par défaut
      const realDuration = calculateRealDuration(
        apt.consultation_started_at,
        apt.consultation_ended_at,
        apt.duration
      );
      return acc + realDuration;
    }, 0);
};

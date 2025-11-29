export const getKYCMessage = (kyc_status: string, kyc_comment?: string | null) => {
  const messages: Record<string, string> = {
    pending: "Votre dossier est en cours de vérification par notre équipe. Ce processus prend généralement 24 à 48 heures. Vous recevrez un email et un SMS dès que votre compte sera activé.",
    incomplete: `Des documents ou informations sont manquants dans votre dossier.${kyc_comment ? ` Détails : ${kyc_comment}` : ''}`,
    rejected: `Votre dossier n'a pas été validé.${kyc_comment ? ` Raison : ${kyc_comment}` : ''}`,
  };
  return messages[kyc_status] || '';
};

export const calculateMonthlyTotalMinutes = (appointments: any[]) => {
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
    .reduce((acc, apt) => acc + apt.duration, 0);
};

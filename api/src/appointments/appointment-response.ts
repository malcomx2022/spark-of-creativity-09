/** La priorité patient s'applique aussi aux comptes ayant plusieurs rôles. */
export function appointmentResponse<T extends { patient_id: string; internal_notes: string | null }>(appointment: T, userId: string): T {
  return appointment.patient_id === userId ? { ...appointment, internal_notes: null } : appointment;
}

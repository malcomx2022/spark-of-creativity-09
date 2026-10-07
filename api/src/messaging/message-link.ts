export function messageLink(appointmentId: string, recipientIsPatient: boolean, practitionerType?: string | null) {
  const role = recipientIsPatient ? 'patient' : practitionerType === 'coach_sportif' ? 'coach' : 'practitioner';
  return `/dashboard/${role}?tab=messages&appointment=${encodeURIComponent(appointmentId)}`;
}

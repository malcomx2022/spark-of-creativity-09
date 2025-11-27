export type AppointmentStatus = 
  | 'pending_payment'        // Créneau bloqué temporairement
  | 'awaiting_practitioner'   // En attente acceptation praticien
  | 'confirmed'               // Praticien a accepté, paiement validé
  | 'pending'                 // Ancien statut (rétrocompatibilité)
  | 'in-progress'             // Consultation en cours
  | 'awaiting_confirmation'   // En attente confirmation patient
  | 'completed'               // Consultation terminée et confirmée
  | 'cancelled_unpaid'        // Annulé car paiement échoué/abandonné
  | 'cancelled'               // Annulé par patient/praticien
  | 'rejected';               // Refusé par praticien

export type PractitionerTrackingStatus =
  | 'assigned'     // Praticien assigné
  | 'preparing'    // Praticien se prépare
  | 'en_route'     // Praticien en route
  | 'arrived'      // Praticien arrivé
  | 'in_progress'; // Consultation en cours

export interface Appointment {
  id: string;
  patientName: string;
  patientId: string;
  practitionerId: string;
  practitionerName: string;
  specialty: string;
  date: string;
  time: string;
  duration: number;
  status: AppointmentStatus;
  address: string;
  reason: string;
  notes?: string;
  urgencyLevel?: string;
  paymentAmount?: number | null;
}

export interface CreateAppointmentData {
  specialty: string;
  date: string;
  time: string;
  reason: string;
  urgencyLevel?: string;
  practitionerId?: string;
  practitionerName?: string;
  addressOverride?: string;
}

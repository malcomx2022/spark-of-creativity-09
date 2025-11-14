export type AppointmentStatus = 'pending' | 'awaiting_practitioner' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'rejected';

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

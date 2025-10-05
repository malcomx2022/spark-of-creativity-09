export type AppointmentStatus = 'pending' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';

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
  urgencyLevel?: 'immediate' | 'urgent' | 'semi-urgent' | 'non-urgent';
}

export interface CreateAppointmentData {
  specialty: string;
  date: string;
  time: string;
  reason: string;
  urgencyLevel?: string;
}

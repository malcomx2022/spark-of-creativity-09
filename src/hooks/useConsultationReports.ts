import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/lib/api';

/** Ligne `consultation_reports` (colonnes snake_case renvoyées par l'API). */
export interface ConsultationReport {
  id: string;
  practitioner_id: string;
  appointment_id: string;
  consultation_date: string;
  consultation_type: string;
  severity_level: string;
  consultation_reason: string | null;
  clinical_findings: string;
  primary_diagnosis: string;
  treatment_prescription: string | null;
  follow_up_recommendation: string | null;
  follow_up_timeframe: string | null;
  additional_comments: string | null;
  share_with_doctor: boolean;
  created_at: string;
  updated_at: string;
  /** Champs joints renvoyés par les listes (praticien : patient ; patient : praticien). */
  patient_name?: string | null;
  patient_id?: string | null;
  practitioner_name?: string | null;
  appointment_date?: string | null;
  specialty?: string | null;
}

export interface ConsultationReportsPage {
  data: ConsultationReport[];
  count: number;
  by_severity?: Record<string, number>;
}

/** Corps de création : `practitioner_id` est déduit du jeton par l'API (conservé pour compatibilité). */
export interface ConsultationReportInput {
  practitioner_id?: string;
  appointment_id: string;
  consultation_date?: string | null;
  consultation_type: string;
  severity_level: string;
  consultation_reason?: string | null;
  clinical_findings: string;
  primary_diagnosis: string;
  treatment_prescription?: string | null;
  follow_up_recommendation?: string | null;
  follow_up_timeframe?: string | null;
  additional_comments?: string | null;
  share_with_doctor?: boolean;
  /** Ex CompleteConsultationForm : clôture aussi la consultation dans la même transaction. */
  complete_appointment?: boolean;
}

export type ConsultationReportUpdate = Partial<Omit<ConsultationReportInput, 'practitioner_id' | 'appointment_id' | 'complete_appointment'>>;

function toReportDto(report: ConsultationReportUpdate) {
  return {
    ...(report.consultation_type !== undefined ? { consultationType: report.consultation_type } : {}),
    ...(report.severity_level !== undefined ? { severityLevel: report.severity_level } : {}),
    ...(report.consultation_reason !== undefined ? { consultationReason: report.consultation_reason } : {}),
    ...(report.clinical_findings !== undefined ? { clinicalFindings: report.clinical_findings } : {}),
    ...(report.primary_diagnosis !== undefined ? { primaryDiagnosis: report.primary_diagnosis } : {}),
    ...(report.treatment_prescription !== undefined ? { treatmentPrescription: report.treatment_prescription } : {}),
    ...(report.follow_up_recommendation !== undefined ? { followUpRecommendation: report.follow_up_recommendation } : {}),
    ...(report.follow_up_timeframe !== undefined ? { followUpTimeframe: report.follow_up_timeframe } : {}),
    ...(report.additional_comments !== undefined ? { additionalComments: report.additional_comments } : {}),
    ...(report.share_with_doctor !== undefined ? { shareWithDoctor: report.share_with_doctor } : {}),
    ...(report.consultation_date ? { consultationDate: report.consultation_date } : {}),
  };
}

/** Comptes rendus du praticien connecté (l'API déduit le praticien du jeton ; `practitionerId` ne sert qu'à activer la requête). */
export const useConsultationReports = (practitionerId?: string, page = 0, pageSize = 50) => {
  return useQuery<ConsultationReportsPage>({
    queryKey: ['consultation-reports', practitionerId, page],
    queryFn: async () => {
      if (!practitionerId) return { data: [], count: 0 };
      const result = await api.get<ConsultationReportsPage>('/consultation-reports', { query: { page, limit: pageSize } });
      return { data: result?.data || [], count: result?.count || 0, by_severity: result?.by_severity };
    },
    enabled: !!practitionerId,
    staleTime: 30000, // ✅ Cache pendant 30 secondes
  });
};

export const useCreateConsultationReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (report: ConsultationReportInput) => {
      const { appointment_id, practitioner_id: _ignored, complete_appointment, ...rest } = report;
      return api.post<ConsultationReport>('/consultation-reports', {
        appointmentId: appointment_id,
        ...toReportDto(rest),
        ...(complete_appointment ? { completeAppointment: true } : {}),
      });
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['consultation-reports'] });
      queryClient.invalidateQueries({ queryKey: ['patient-consultation-reports'] });
      if (report?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['consultation-report', report.appointment_id] });
      }
    },
  });
};

export const useUpdateConsultationReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ConsultationReportUpdate }) => {
      return api.patch<ConsultationReport>(`/consultation-reports/${id}`, toReportDto(data));
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['consultation-reports'] });
      queryClient.invalidateQueries({ queryKey: ['patient-consultation-reports'] });
      if (report?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['consultation-report', report.appointment_id] });
      }
    },
  });
};

export const useConsultationReportByAppointment = (appointmentId?: string) => {
  return useQuery<ConsultationReport | null>({
    queryKey: ['consultation-report', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      try {
        return (await api.get<ConsultationReport | null>(`/consultation-reports/appointment/${appointmentId}`)) ?? null;
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled: !!appointmentId,
    staleTime: 60000, // ✅ Cache pendant 1 minute
  });
};

/** Lecture journalisée d'un compte rendu (`consultation_reports_access_log`) : `access=view|download`. */
export const getConsultationReport = (id: string, access: 'view' | 'download' = 'view') => {
  return api.get<ConsultationReport & { appointment: { id: string; patient_id: string; patient_name: string; practitioner_name: string; date: string; specialty: string } | null; practitioner_name: string | null }>(
    `/consultation-reports/${id}`,
    { query: { access } }
  );
};

export type PatientConsultationReport = ConsultationReport & {
  appointments: { practitioner_name: string };
};

/** Comptes rendus du patient connecté (l'API déduit le patient du jeton ; `patientId` ne sert qu'à activer la requête). */
export const usePatientConsultationReports = (patientId?: string, page = 0, pageSize = 20) => {
  return useQuery({
    queryKey: ['patient-consultation-reports', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [] as PatientConsultationReport[], count: 0 };

      const result = await api.get<ConsultationReportsPage>('/consultation-reports/mine', { query: { page, limit: pageSize } });

      // ✅ Enrichir les rapports avec le nom du praticien
      const enrichedData: PatientConsultationReport[] = (result?.data || []).map((report) => ({
        ...report,
        appointments: {
          practitioner_name: report.practitioner_name || 'Praticien',
        },
      }));

      return { data: enrichedData, count: result?.count || 0, by_severity: result?.by_severity };
    },
    enabled: !!patientId,
    staleTime: 30000,
  });
};

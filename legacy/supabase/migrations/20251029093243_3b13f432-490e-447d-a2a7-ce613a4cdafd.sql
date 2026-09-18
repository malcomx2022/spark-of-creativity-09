-- Create consultation_reports table
CREATE TABLE public.consultation_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  practitioner_id uuid NOT NULL,
  appointment_id text NOT NULL,
  consultation_date timestamp with time zone NOT NULL DEFAULT now(),
  consultation_type text NOT NULL,
  consultation_reason text,
  clinical_findings text,
  primary_diagnosis text,
  treatment_prescription text,
  follow_up_recommendation text,
  follow_up_timeframe text,
  additional_comments text,
  severity_level text NOT NULL,
  share_with_doctor boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consultation_reports ENABLE ROW LEVEL SECURITY;

-- Practitioners can manage their reports
CREATE POLICY "Practitioners can manage their consultation reports"
ON public.consultation_reports
FOR ALL
USING (practitioner_id IN (
  SELECT id FROM practitioners WHERE user_id = auth.uid()
));

-- Patients can view their reports
CREATE POLICY "Patients can view their consultation reports"
ON public.consultation_reports
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM appointments
  WHERE appointments.id = consultation_reports.appointment_id
  AND appointments.patient_id = auth.uid()::text
));

-- Create trigger for updated_at
CREATE TRIGGER update_consultation_reports_updated_at
BEFORE UPDATE ON public.consultation_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
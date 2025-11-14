-- Create reconciliation_reports table to store reconciliation results
CREATE TABLE IF NOT EXISTS public.reconciliation_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  total_fedapay_transactions INTEGER NOT NULL DEFAULT 0,
  total_db_payments INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  missing_in_db_count INTEGER NOT NULL DEFAULT 0,
  missing_in_fedapay_count INTEGER NOT NULL DEFAULT 0,
  amount_mismatch_count INTEGER NOT NULL DEFAULT 0,
  status_mismatch_count INTEGER NOT NULL DEFAULT 0,
  total_amount_discrepancy INTEGER NOT NULL DEFAULT 0,
  anomalies JSONB,
  recommendations JSONB,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reconciliation_reports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can view reconciliation reports" 
ON public.reconciliation_reports 
FOR SELECT 
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create reconciliation reports" 
ON public.reconciliation_reports 
FOR INSERT 
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update reconciliation reports" 
ON public.reconciliation_reports 
FOR UPDATE 
USING (is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_reconciliation_reports_updated_at
BEFORE UPDATE ON public.reconciliation_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_reconciliation_reports_created_at ON public.reconciliation_reports(created_at DESC);
CREATE INDEX idx_reconciliation_reports_status ON public.reconciliation_reports(status);
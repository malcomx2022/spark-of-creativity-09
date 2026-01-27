-- Add response fields to support_tickets
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS admin_response TEXT,
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS responded_by UUID REFERENCES auth.users(id);

-- Add comment for documentation
COMMENT ON COLUMN public.support_tickets.admin_response IS 'Response text from admin to the ticket';
COMMENT ON COLUMN public.support_tickets.responded_at IS 'Timestamp of the last admin response';
COMMENT ON COLUMN public.support_tickets.responded_by IS 'Admin user who responded';

-- Create table for OTP attempt tracking
CREATE TABLE IF NOT EXISTS public.otp_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  status TEXT NOT NULL,
  twilio_sid TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_otp_attempts_phone ON public.otp_attempts(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_created_at ON public.otp_attempts(created_at DESC);

-- Enable RLS
ALTER TABLE public.otp_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view OTP attempts (for security/debugging)
CREATE POLICY "Admins can view OTP attempts"
  ON public.otp_attempts
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Comment
COMMENT ON TABLE public.otp_attempts IS 'Tracks OTP verification attempts for security and debugging';

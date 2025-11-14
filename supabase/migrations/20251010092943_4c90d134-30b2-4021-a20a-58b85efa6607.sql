-- Create practitioners table
CREATE TABLE public.practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  available BOOLEAN DEFAULT true,
  rating DECIMAL(3, 2) DEFAULT 0,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view available practitioners"
  ON public.practitioners FOR SELECT
  USING (available = true);

CREATE POLICY "Practitioners can update their own profile"
  ON public.practitioners FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Practitioners can insert their own profile"
  ON public.practitioners FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_practitioners_updated_at
  BEFORE UPDATE ON public.practitioners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
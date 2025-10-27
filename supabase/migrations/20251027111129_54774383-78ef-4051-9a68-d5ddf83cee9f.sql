-- Add practitioner_type enum and coach-specific fields
CREATE TYPE public.practitioner_type AS ENUM ('medecin', 'infirmier', 'kinesitherapeute', 'nutritionniste', 'sage_femme', 'psychologue', 'coach_sportif', 'autre');

-- Add new columns to practitioners table for coach sportif
ALTER TABLE public.practitioners
ADD COLUMN practitioner_type practitioner_type DEFAULT 'autre',
ADD COLUMN session_types text[] DEFAULT NULL, -- individuelle, duo, groupe
ADD COLUMN intervention_zone text DEFAULT NULL,
ADD COLUMN certifications text[] DEFAULT NULL;

-- Create group sessions table for coach sportif
CREATE TABLE public.group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.practitioners(id) ON DELETE CASCADE,
  session_name text NOT NULL,
  session_type text NOT NULL CHECK (session_type IN ('individuelle', 'duo', 'groupe')),
  max_participants integer DEFAULT 10,
  min_participants integer DEFAULT 1,
  current_participants integer DEFAULT 0,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  price_per_person integer NOT NULL CHECK (price_per_person >= 10000),
  location text NOT NULL,
  status text DEFAULT 'planifiee' CHECK (status IN ('planifiee', 'confirmee', 'annulee', 'terminee')),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on group_sessions
ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_sessions
CREATE POLICY "Anyone can view confirmed group sessions"
ON public.group_sessions
FOR SELECT
USING (status = 'confirmee' OR status = 'planifiee');

CREATE POLICY "Coaches can manage their group sessions"
ON public.group_sessions
FOR ALL
USING (coach_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

-- Create group session participants table
CREATE TABLE public.group_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(session_id, patient_id)
);

-- Enable RLS on group_session_participants
ALTER TABLE public.group_session_participants ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_session_participants
CREATE POLICY "Participants can view their own registrations"
ON public.group_session_participants
FOR SELECT
USING (auth.uid() = patient_id OR EXISTS (
  SELECT 1 FROM group_sessions gs
  WHERE gs.id = session_id AND gs.coach_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Users can register for group sessions"
ON public.group_session_participants
FOR INSERT
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Coaches can manage participants in their sessions"
ON public.group_session_participants
FOR ALL
USING (EXISTS (
  SELECT 1 FROM group_sessions gs
  WHERE gs.id = session_id AND gs.coach_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  )
));

-- Create trigger to update group_sessions updated_at
CREATE TRIGGER update_group_sessions_updated_at
BEFORE UPDATE ON public.group_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update current_participants count
CREATE OR REPLACE FUNCTION update_session_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE group_sessions
  SET current_participants = (
    SELECT COUNT(*) 
    FROM group_session_participants 
    WHERE session_id = COALESCE(NEW.session_id, OLD.session_id)
    AND payment_status = 'paid'
  )
  WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update participants count
CREATE TRIGGER update_participants_count
AFTER INSERT OR UPDATE OR DELETE ON public.group_session_participants
FOR EACH ROW
EXECUTE FUNCTION update_session_participants_count();
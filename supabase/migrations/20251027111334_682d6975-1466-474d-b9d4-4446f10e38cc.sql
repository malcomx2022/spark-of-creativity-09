-- Fix security warning: set search_path for the function
CREATE OR REPLACE FUNCTION update_session_participants_count()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
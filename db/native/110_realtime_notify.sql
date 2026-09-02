-- =============================================================================
-- 110_realtime_notify.sql — Remplacement de Supabase Realtime (postgres_changes)
--
-- Le front s'abonne aujourd'hui aux changements de 11 tables. En natif, un trigger
-- générique publie un événement LISTEN/NOTIFY sur le canal "table_changes" ;
-- le back-end (worker Socket.IO) écoute ce canal et relaie aux clients WebSocket
-- abonnés (room par table / par user_id / par appointment_id).
-- Payload volontairement minimal (< 8 Ko) : table, opération, id, user_id/… clés.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_table_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record; payload jsonb;
BEGIN
  rec := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', to_jsonb(rec) ->> 'id',
    'user_id', to_jsonb(rec) ->> 'user_id',
    'patient_id', to_jsonb(rec) ->> 'patient_id',
    'practitioner_id', to_jsonb(rec) ->> 'practitioner_id',
    'appointment_id', to_jsonb(rec) ->> 'appointment_id',
    'session_id', to_jsonb(rec) ->> 'session_id',
    'status', to_jsonb(rec) ->> 'status',
    'at', now());
  PERFORM pg_notify('table_changes', jsonb_strip_nulls(payload)::text);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','messages','notifications','practitioner_balances',
                           'practitioner_payouts','payments','support_tickets','practitioners',
                           'group_sessions','group_session_participants']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS notify_%s_change ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER notify_%s_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.notify_table_change()', t, t);
  END LOOP;
END $$;

COMMIT;

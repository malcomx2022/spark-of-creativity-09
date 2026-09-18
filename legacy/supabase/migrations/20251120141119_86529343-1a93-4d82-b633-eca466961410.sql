-- Activer le realtime pour les séances de groupe et participants
-- Cela permettra de voir les mises à jour de paiement en temps réel

ALTER TABLE group_sessions REPLICA IDENTITY FULL;
ALTER TABLE group_session_participants REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE group_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE group_session_participants;
-- Ajouter des index pour améliorer les performances des requêtes fréquentes

-- Index pour les appointments (requêtes par patient_id et practitioner_id)
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_id ON appointments(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(date, time);

-- Index pour les payments (requêtes par patient_id et appointment_id)
CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Index pour les messages (requêtes par appointment_id et sender_id)
CREATE INDEX IF NOT EXISTS idx_messages_appointment_id ON messages(appointment_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Index pour les notifications (requêtes par user_id et is_read)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Index composite pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_appointments_patient_status ON appointments(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_status ON appointments(practitioner_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_patient_status ON payments(patient_id, status);

-- Index pour les practitioners (recherche géographique et disponibilité)
CREATE INDEX IF NOT EXISTS idx_practitioners_available ON practitioners(available) WHERE available = true;
CREATE INDEX IF NOT EXISTS idx_practitioners_kyc_status ON practitioners(kyc_status);
CREATE INDEX IF NOT EXISTS idx_practitioners_lat_lon ON practitioners(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index pour les practitioner_balances (requêtes fréquentes)
CREATE INDEX IF NOT EXISTS idx_practitioner_balances_updated_at ON practitioner_balances(updated_at DESC);

-- Index pour group_sessions
CREATE INDEX IF NOT EXISTS idx_group_sessions_coach_id ON group_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_status ON group_sessions(status);
CREATE INDEX IF NOT EXISTS idx_group_sessions_scheduled_date ON group_sessions(scheduled_date);

-- Index pour group_session_participants
CREATE INDEX IF NOT EXISTS idx_group_session_participants_patient_id ON group_session_participants(patient_id);
CREATE INDEX IF NOT EXISTS idx_group_session_participants_session_id ON group_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_group_session_participants_payment_status ON group_session_participants(payment_status);

-- Analyser les tables pour mettre à jour les statistiques
ANALYZE appointments;
ANALYZE payments;
ANALYZE messages;
ANALYZE notifications;
ANALYZE practitioners;
ANALYZE practitioner_balances;
ANALYZE group_sessions;
ANALYZE group_session_participants;
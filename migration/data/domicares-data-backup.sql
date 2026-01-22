-- ============================================================
-- DOMICARES - Sauvegarde des données de la base de données
-- Généré le: 2025-01-22
-- Source: Lovable Cloud (kskkufjliwdfqqyemcpf)
-- ============================================================

-- IMPORTANT: Exécuter ces commandes AVANT l'import pour désactiver les triggers
-- ALTER TABLE profiles DISABLE TRIGGER ALL;
-- ALTER TABLE practitioners DISABLE TRIGGER ALL;
-- ALTER TABLE appointments DISABLE TRIGGER ALL;
-- ALTER TABLE payments DISABLE TRIGGER ALL;
-- ALTER TABLE notifications DISABLE TRIGGER ALL;

-- ============================================================
-- 1. PROFILES (14 enregistrements)
-- ============================================================

INSERT INTO profiles (id, full_name, phone, gender, date_of_birth, avatar_url, two_factor_enabled, two_factor_secret, created_at, updated_at) VALUES
('03d2c84e-0763-41b0-b03c-df13db2480e6', 'Patient Test', '+22967000001', 'homme', '1990-01-01', NULL, false, NULL, '2025-10-10T13:44:00.819928+00:00', '2025-10-10T13:44:00.819928+00:00'),
('280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'Karim AP', '+22940545548', 'homme', '1958-02-05', NULL, false, NULL, '2025-12-14T20:18:58.274257+00:00', '2025-12-14T20:18:58.274257+00:00'),
('4896ba4d-4d26-47ad-8713-49a0ce377366', 'Dr. Praticien Test', '+22967000002', 'homme', '1985-01-01', NULL, false, NULL, '2025-10-10T13:44:01.158144+00:00', '2025-10-10T13:44:01.158144+00:00'),
('cc46aa4a-94c5-4593-b67a-203f95b0b3d0', 'Coach Sportif Test', '+22967000004', 'homme', '1988-01-01', NULL, false, NULL, '2025-10-29T08:33:55.741205+00:00', '2025-10-29T08:33:55.741205+00:00'),
('6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', 'Admin Test', '+22967000003', 'homme', '1980-01-01', NULL, false, NULL, '2025-10-10T13:44:01.495433+00:00', '2025-10-10T13:44:01.495433+00:00'),
('ebefbeaf-20cc-4e96-a89c-de709ccddba6', 'Zénaïde Maurille KOUNAGBE', '+22995229234', 'femme', '1988-08-30', NULL, false, NULL, '2025-12-04T23:47:13.581502+00:00', '2025-12-04T23:47:13.581502+00:00'),
('83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'Josette CODJIA', '+22996994115', 'femme', '1974-07-13', NULL, false, NULL, '2025-12-05T07:44:16.35022+00:00', '2025-12-05T07:44:16.35022+00:00'),
('315a88d6-cbed-4704-b1f4-abab012433a1', 'ULRICH PATIENT', '+22996466777', 'homme', '1987-06-22', NULL, false, NULL, '2025-11-29T15:39:30.458118+00:00', '2025-11-29T15:39:30.458118+00:00'),
('5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'ulrich praticien', '+22996466776', 'homme', '1987-06-22', NULL, false, NULL, '2025-11-29T15:54:23.718322+00:00', '2025-11-29T15:54:23.718322+00:00'),
('fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'axelle test akpo', '+22961905639', 'femme', '2011-03-08', NULL, false, NULL, '2025-12-01T13:16:01.860949+00:00', '2025-12-01T13:16:01.860949+00:00'),
('ec6179bb-5ce5-433b-82c4-e9d448910dee', 'Axelle test Touade', '+22966816919', 'femme', '1991-12-12', NULL, false, NULL, '2025-12-02T18:23:59.367354+00:00', '2025-12-02T18:23:59.367354+00:00'),
('6981a2d2-5f8d-4706-8ca2-eccbc159b23b', 'Karim Test Essai', '+22940545547', 'homme', '1980-12-03', NULL, false, NULL, '2025-12-03T12:19:38.052654+00:00', '2025-12-03T12:19:38.052654+00:00'),
('7dd7958c-9bc8-453d-beda-b112a69b3721', 'Elodie CODJO', '+22966260582', 'femme', '1993-02-21', NULL, false, NULL, '2025-12-01T13:08:31.367603+00:00', '2025-12-01T13:08:31.367603+00:00'),
('f9eaf9b6-961c-477f-9844-e060391e7974', 'Ulrich SOUKPO-AGO', '+22998469417', 'homme', '2003-08-26', NULL, false, NULL, '2025-12-14T19:23:25.637256+00:00', '2025-12-14T19:23:25.637256+00:00')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  gender = EXCLUDED.gender,
  date_of_birth = EXCLUDED.date_of_birth,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 2. SERVICES (2 enregistrements)
-- ============================================================

INSERT INTO services (id, name, description, category, base_price, duration, is_active, created_at) VALUES
('1f9d6c3a-2b8e-4a5f-9c7d-0e3f6a8b1c2d', 'Consultation générale', 'Consultation médicale générale à domicile', 'medecin', 15000, 60, true, '2025-10-10T09:57:56.604198+00:00'),
('2a8f7d4b-3c9e-5b6g-0d8e-1f4g7a9c2d3e', 'Soins infirmiers', 'Soins infirmiers à domicile (injections, pansements, etc.)', 'infirmier', 8000, 30, true, '2025-10-10T09:57:56.604198+00:00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price;

-- ============================================================
-- 3. PRACTITIONERS (7 enregistrements)
-- ============================================================

INSERT INTO practitioners (id, user_id, practitioner_type, specialty, license_number, bio, experience_years, consultation_fee, available, address, latitude, longitude, service_radius, verified, documents, created_at, updated_at, kyc_status, kyc_notes, kyc_submitted_at, kyc_reviewed_at, kyc_reviewed_by) VALUES
('40ffeae5-0412-48aa-9a02-3fc7caff8fef', '4896ba4d-4d26-47ad-8713-49a0ce377366', 'medecin', 'Médecine Générale', 'TEST-001', 'Médecin généraliste expérimenté', 10, 15000, true, 'Cotonou, Bénin', 6.3654, 2.4183, 10, true, NULL, '2025-10-10T13:44:01.158144+00:00', '2025-10-10T13:44:01.158144+00:00', 'approved', NULL, NULL, NULL, NULL),
('a791383e-e527-440d-8e29-d30a285980c6', '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'infirmier', 'Infirmier', 'INF-001', 'Profession: Infirmier', 10, 10000, true, 'Akogbato, Littoral, Bénin', 6.3654, 2.4183, 50, true, NULL, '2025-11-29T15:54:23.718322+00:00', '2025-11-29T15:54:23.718322+00:00', 'approved', NULL, '2025-11-29T15:54:23.718322+00:00', NULL, NULL),
('dba61c5b-ce7b-401a-a2ee-a1f5e3c41ca0', '7dd7958c-9bc8-453d-beda-b112a69b3721', 'psychologue', 'Psychologue', 'PSY-001', 'Profession: Psychologue', 10, 10000, true, 'Dèkoungbé, Atlantique, Bénin', 6.4, 2.35, 15, true, NULL, '2025-12-01T13:08:31.367603+00:00', '2025-12-01T13:08:31.367603+00:00', 'approved', NULL, '2025-12-01T13:08:31.367603+00:00', NULL, NULL),
('b06788a8-e77b-412f-9c69-3c68cdab5306', '6981a2d2-5f8d-4706-8ca2-eccbc159b23b', 'nutritionniste', 'Testtt', 'NUT-001', 'Nutritionniste certifié', 10, 10000, true, 'Cotonou, Bénin', 6.3654, 2.4183, 50, true, NULL, '2025-12-03T12:19:38.052654+00:00', '2025-12-03T12:19:38.052654+00:00', 'approved', NULL, '2025-12-03T12:19:38.052654+00:00', NULL, NULL),
('ad35f17a-4f6b-41e0-947c-d5989ccc5841', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'infirmier', 'Infirmier', 'INF-002', 'Profession: Infirmier', 10, 10000, true, 'Godomey, Atlantique, Bénin', 6.38, 2.36, 15, true, NULL, '2025-12-14T20:18:58.274257+00:00', '2025-12-14T20:18:58.274257+00:00', 'approved', NULL, '2025-12-14T20:18:58.274257+00:00', NULL, NULL),
('coach-test-001', 'cc46aa4a-94c5-4593-b67a-203f95b0b3d0', 'coach_sportif', 'Coach Sportif', 'COACH-001', 'Coach sportif certifié', 5, 8000, true, 'Cotonou, Bénin', 6.3654, 2.4183, 10, true, NULL, '2025-10-29T08:33:55.741205+00:00', '2025-10-29T08:33:55.741205+00:00', 'approved', NULL, NULL, NULL, NULL),
('e44d0f5b-b02a-4e8e-8e3b-f35c7a9d1b6c', 'f9eaf9b6-961c-477f-9844-e060391e7974', 'sage_femme', 'Sage-femme', 'SF-001', 'Profession: Sage-femme', 5, 12000, true, 'Cotonou, Bénin', 6.3654, 2.4183, 20, true, NULL, '2025-12-14T19:23:25.637256+00:00', '2025-12-14T19:23:25.637256+00:00', 'approved', NULL, '2025-12-14T19:23:25.637256+00:00', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  specialty = EXCLUDED.specialty,
  bio = EXCLUDED.bio,
  consultation_fee = EXCLUDED.consultation_fee,
  available = EXCLUDED.available,
  kyc_status = EXCLUDED.kyc_status,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 4. USER_ROLES (rôles des utilisateurs)
-- ============================================================

INSERT INTO user_roles (id, user_id, role, created_at, updated_at) VALUES
('role-admin-001', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', 'super_admin', '2025-10-10T13:44:01.495433+00:00', '2025-10-10T13:44:01.495433+00:00'),
('role-patient-001', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'patient', '2025-10-10T13:44:00.819928+00:00', '2025-10-10T13:44:00.819928+00:00'),
('role-practitioner-001', '4896ba4d-4d26-47ad-8713-49a0ce377366', 'practitioner', '2025-10-10T13:44:01.158144+00:00', '2025-10-10T13:44:01.158144+00:00'),
('role-coach-001', 'cc46aa4a-94c5-4593-b67a-203f95b0b3d0', 'coach', '2025-10-29T08:33:55.741205+00:00', '2025-10-29T08:33:55.741205+00:00')
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 5. ADDRESSES (5 enregistrements)
-- ============================================================

INSERT INTO addresses (id, user_id, label, address, city, postal_code, latitude, longitude, is_default, created_at) VALUES
('addr-001', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'Domicile', 'Haie-Vive-Cocotiers, Littoral, Bénin', 'Cotonou', NULL, 6.3654, 2.4183, true, '2025-10-10T13:44:00.819928+00:00'),
('addr-002', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'Domicile', 'Menontin, Littoral, Bénin', 'Cotonou', NULL, 6.3654, 2.4183, true, '2025-12-02T18:23:59.367354+00:00'),
('addr-003', '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'Domicile', 'Menontin, Littoral, Bénin', 'Cotonou', NULL, 6.3654, 2.4183, true, '2025-12-05T07:44:16.35022+00:00'),
('addr-004', '315a88d6-cbed-4704-b1f4-abab012433a1', 'Domicile', 'Akogbato, Littoral, Bénin', 'Cotonou', NULL, 6.3654, 2.4183, true, '2025-11-29T15:39:30.458118+00:00'),
('addr-005', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'Domicile', 'Godomey, Atlantique, Bénin', 'Godomey', NULL, 6.38, 2.36, true, '2025-12-14T20:18:58.274257+00:00')
ON CONFLICT (id) DO UPDATE SET
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude;

-- ============================================================
-- 6. SYSTEM_CONFIG (10 enregistrements)
-- ============================================================

INSERT INTO system_config (id, key, value, description, updated_at, updated_by) VALUES
('f30bdc21-2f7a-45ab-929e-48d7f3ada4ef', 'payment_fees', '{"fixed": 0, "rate": 0.029}', 'Frais de paiement (ex: 2.9% + 0 XOF)', '2025-10-10T09:57:56.604198+00:00', NULL),
('2d82a7c8-df91-4cc1-bb2e-bea150dfb0c8', 'surcharges', '{"holiday": 0.3, "night": 0.25, "weekend": 0.2}', 'Majorations nuit/week-end/jours fériés', '2025-10-10T09:57:56.604198+00:00', NULL),
('6047359a-c6ea-48aa-8884-ef538af206f1', 'triage_thresholds', '{"high": 15, "low": 5, "medium": 10, "urgent": 20}', 'Seuils de score pour les niveaux d urgence', '2025-10-10T09:57:56.604198+00:00', NULL),
('737ff018-80ad-4c27-9a03-01d0a5f7f4f4', 'payment_gateway_fees', '{"description": "Frais passerelle (2% payés par la plateforme)", "fixed": 0, "paid_by": "platform", "percentage": 0.02}', 'Frais de la passerelle de paiement', '2025-10-29T13:39:52.257443+00:00', NULL),
('c009b0d0-921e-4b2a-81db-2535f078bfd6', 'payment_hold_period_days', '{"days": 2, "description": "Période de rétention avant versement (T+2)"}', 'Période de rétention des fonds avant versement aux praticiens', '2025-10-29T13:39:52.257443+00:00', NULL),
('939c441f-58b9-4f02-b8b9-0cc298a0937f', 'payout_minimum_threshold', '{"amount": 5000, "currency": "XOF", "description": "Seuil minimum de versement"}', 'Montant minimum pour déclencher un versement au praticien', '2025-10-29T13:39:52.257443+00:00', NULL),
('3f3f1919-2f0b-4078-a2e9-55b215c0294b', 'payout_frequency', '{"day": "monday", "description": "Versements hebdomadaires le lundi", "frequency": "weekly"}', 'Fréquence des versements aux praticiens', '2025-10-29T13:39:52.257443+00:00', NULL),
('ab0765fc-5e31-470c-aa0b-7c807561c087', 'payment_rounding_mode', '{"decimals": 2, "description": "Arrondi à 2 décimales, mode half-up", "mode": "half_up"}', 'Mode arrondi pour les calculs de paiement', '2025-10-29T13:39:52.257443+00:00', NULL),
('52a6e2b5-da26-478f-a2d4-4e01b4846bc5', 'payment_commission_rate', '{"description": "Commission plateforme en pourcentage (5%)", "rate": 0.37}', 'Taux de commission de la plateforme sur les paiements', '2025-12-10T12:34:32.800375+00:00', NULL),
('a0a56321-fbb5-4e2b-9944-c13173e4ee96', 'commission_rate', '{"default": 0.37, "exceptions": {}}', 'Taux de commission global et exceptions par catégorie/zone', '2025-12-10T12:34:32.800375+00:00', NULL)
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 7. LEDGER_ACCOUNTS (10 enregistrements)
-- ============================================================

INSERT INTO ledger_accounts (id, owner_type, owner_id, account_type, currency, created_at) VALUES
('76a55348-5400-48dd-be68-599faaa82cd6', 'platform', NULL, 'cash', 'XOF', '2025-10-29T13:56:57.76716+00:00'),
('a8aebfc3-581f-4c35-82ed-07d42d76c7a8', 'platform', NULL, 'revenue_commission', 'XOF', '2025-10-29T13:56:57.76716+00:00'),
('83849db0-1aee-416b-89ce-1c2036736b48', 'platform', NULL, 'revenue_fees', 'XOF', '2025-10-29T13:56:57.76716+00:00'),
('d6121de3-3973-4eff-a7ba-25f90cd81f1a', 'patient', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'obligation', 'XOF', '2025-12-03T12:22:24.436858+00:00'),
('3b9007d1-64df-49dc-9e27-0ecd2baafee3', 'practitioner', 'b06788a8-e77b-412f-9c69-3c68cdab5306', 'payable', 'XOF', '2025-12-03T18:53:16.06268+00:00'),
('90dec121-af60-465c-8c06-247bad30324f', 'patient', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'obligation', 'XOF', '2025-12-10T09:21:28.193444+00:00'),
('0fc34999-8e5a-4ae9-97cc-a1252a78b7cf', 'practitioner', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 'payable', 'XOF', '2025-12-14T20:58:08.548023+00:00'),
('77e01d26-8c8a-49ec-9d76-8a4b4c2117ae', 'practitioner', 'a791383e-e527-440d-8e29-d30a285980c6', 'payable', 'XOF', '2025-12-10T09:50:08.179913+00:00'),
('37f374d0-b1da-4d9c-ad0f-52c4a549e6df', 'patient', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'obligation', 'XOF', '2025-12-14T20:58:08.496427+00:00'),
('a3344c1a-217c-4b63-b98a-c80f8112a83f', 'practitioner', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'payable', 'XOF', '2025-12-03T12:22:24.495499+00:00')
ON CONFLICT (id) DO UPDATE SET
  account_type = EXCLUDED.account_type,
  currency = EXCLUDED.currency;

-- ============================================================
-- 8. PAYOUT_BATCHES (1 enregistrement)
-- ============================================================

INSERT INTO payout_batches (id, batch_date, status, total_amount, practitioners_count, payment_method, created_by, processed_at, statement_url, created_at, updated_at) VALUES
('a58acca1-6716-43c8-bef6-016bd0bff1d6', '2025-12-10', 'sent', 9500, 1, 'momo', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', '2025-12-10T11:37:39.286+00:00', NULL, '2025-12-10T11:35:08.298628+00:00', '2025-12-10T11:37:39.314945+00:00')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  processed_at = EXCLUDED.processed_at,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- RAPPEL: Après l'import, réactiver les triggers
-- ============================================================
-- ALTER TABLE profiles ENABLE TRIGGER ALL;
-- ALTER TABLE practitioners ENABLE TRIGGER ALL;
-- ALTER TABLE appointments ENABLE TRIGGER ALL;
-- ALTER TABLE payments ENABLE TRIGGER ALL;
-- ALTER TABLE notifications ENABLE TRIGGER ALL;

-- ============================================================
-- STATISTIQUES DE LA SAUVEGARDE
-- ============================================================
-- Profiles: 14
-- Practitioners: 7
-- Services: 2
-- User Roles: 4+
-- Addresses: 5
-- System Config: 10
-- Ledger Accounts: 10
-- Payout Batches: 1
-- 
-- Note: Les tables suivantes nécessitent un export séparé car
-- elles contiennent beaucoup de données:
-- - appointments (21 enregistrements)
-- - payments (45 enregistrements)
-- - payment_events (121 enregistrements)
-- - notifications (115 enregistrements)
-- - ledger_entries (30+ enregistrements)
-- - admin_audit_logs (20+ enregistrements)
-- ============================================================

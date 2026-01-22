-- ============================================================
-- DOMICARES - SAUVEGARDE COMPLETE DE LA BASE DE DONNEES
-- Généré le: 2025-01-22
-- Source: Lovable Cloud (kskkufjliwdfqqyemcpf)
-- ============================================================

-- INSTRUCTIONS D'IMPORTATION:
-- 1. Désactiver les triggers et RLS avant import
-- 2. Importer les tables dans l'ordre des foreign keys
-- 3. Réactiver les triggers et RLS après import

-- ============================================================
-- DESACTIVER LES TRIGGERS (exécuter avant import)
-- ============================================================
/*
DO $$ 
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER ALL', t);
    END LOOP;
END $$;
*/

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

INSERT INTO practitioners (id, user_id, practitioner_type, specialty, name, phone, bio, years_experience, available, address, latitude, longitude, kyc_status, kyc_comment, kyc_reviewed_at, kyc_reviewed_by, is_online, license_number, can_accept_missions, intervention_radius, intervention_zone, rating, created_at, updated_at) VALUES
('40ffeae5-0412-48aa-9a02-3fc7caff8fef', '4896ba4d-4d26-47ad-8713-49a0ce377366', 'medecin', 'Médecine Générale', 'Dr. Praticien Test', '+22967000002', 'Médecin généraliste expérimenté disponible pour consultations à domicile', 10, true, 'Cotonou, Bénin', 6.3654, 2.4183, 'approved', 'KYC approuvé', '2025-11-26T05:54:36.592647+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '', 10, 'Cotonou et environs', 4.5, '2025-10-10T13:18:10.666633+00:00', '2025-11-26T05:54:36.592647+00:00'),
('cf14846f-f9e0-48db-8183-843422bfe204', '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'infirmier', 'cardio', 'ulrich praticien', '+22996466776', 'Profession: Infirmier(ère)\nStructure: hostpital', 5, true, 'Cotonou, Littoral, Bénin', 6.373391, 2.4401, 'approved', 'Praticien test validé', '2025-11-29T16:08:26.438+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '12345', true, NULL, NULL, 0, '2025-11-29T15:54:27.067812+00:00', '2025-11-29T15:54:27.067812+00:00'),
('9aa88dae-5465-496d-a8cc-bf58e51c3d9a', '7dd7958c-9bc8-453d-beda-b112a69b3721', 'psychologue', 'Psychologie de l''enfant', 'Elodie CODJO', '+22966260582', 'Profession: Psychologue\nStructure: Cabinet médical', 5, true, 'Dèkoungbé, Atlantique, Bénin', 6.375353, 2.32782, 'approved', 'Test approved', '2025-12-01T18:48:15.158+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', false, '20', true, NULL, NULL, 0, '2025-12-01T13:08:32.576031+00:00', '2025-12-01T13:08:32.576031+00:00'),
('b06788a8-e77b-412f-9c69-3c68cdab5306', '6981a2d2-5f8d-4706-8ca2-eccbc159b23b', 'nutritionniste', 'Testtt', 'Karim Test Essai', '+22940545547', 'Profession: Nutritionniste\nStructure: Hopital 22', 5, true, 'Haie-Vive-Cocotiers, Littoral, Bénin', 6.355224, 2.397611, 'approved', '', '2025-12-03T18:21:25.387+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '4444', true, NULL, NULL, 0, '2025-12-03T12:19:40.969958+00:00', '2025-12-03T12:19:40.969958+00:00'),
('e48dc2a4-4fc9-4466-8826-995c7b42cc29', 'ebefbeaf-20cc-4e96-a89c-de709ccddba6', 'coach_sportif', 'Pilates', 'Zénaïde Maurille KOUNAGBE', '+22995229234', 'Profession: Coach sportif', 8, true, 'Cotonou, Littoral, Bénin', 6.373391, 2.4401, 'approved', 'Manque un diplôme', '2025-12-05T06:27:24.494+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '', true, 15, 'Cotonou et environs', 0, '2025-12-04T23:47:26.870298+00:00', '2025-12-04T23:47:26.870298+00:00'),
('a791383e-e527-440d-8e29-d30a285980c6', 'f9eaf9b6-961c-477f-9844-e060391e7974', 'coach_sportif', 'Musculation', 'Coach Sportif Test', '+22998469417', 'Profession: Coach sportif', 5, true, 'Fidjrossé, Littoral, Bénin', 6.341684, 2.372894, 'approved', NULL, '2025-12-14T19:24:41.632+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '', true, 15, NULL, 0, '2025-12-14T19:23:32.088502+00:00', '2025-12-14T19:23:32.088502+00:00'),
('ad35f17a-4f6b-41e0-947c-d5989ccc5841', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'infirmier', 'Soins généraux', 'Karim AP', '+22940545548', 'Profession: Infirmier(ère)', 10, true, 'Godomey, Atlantique, Bénin', 6.364, 2.343, 'approved', NULL, '2025-12-14T20:56:02.428+00:00', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', true, '', true, 15, NULL, 0, '2025-12-14T20:19:06.612631+00:00', '2025-12-14T20:19:06.612631+00:00')
ON CONFLICT (id) DO UPDATE SET
  specialty = EXCLUDED.specialty,
  bio = EXCLUDED.bio,
  available = EXCLUDED.available,
  kyc_status = EXCLUDED.kyc_status,
  is_online = EXCLUDED.is_online,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 4. USER_ROLES
-- ============================================================

INSERT INTO user_roles (id, user_id, role, created_at, updated_at) VALUES
(gen_random_uuid(), '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', 'super_admin', '2025-10-10T13:44:01.495433+00:00', '2025-10-10T13:44:01.495433+00:00'),
(gen_random_uuid(), '03d2c84e-0763-41b0-b03c-df13db2480e6', 'patient', '2025-10-10T13:44:00.819928+00:00', '2025-10-10T13:44:00.819928+00:00'),
(gen_random_uuid(), '4896ba4d-4d26-47ad-8713-49a0ce377366', 'practitioner', '2025-10-10T13:44:01.158144+00:00', '2025-10-10T13:44:01.158144+00:00'),
(gen_random_uuid(), 'cc46aa4a-94c5-4593-b67a-203f95b0b3d0', 'coach', '2025-10-29T08:33:55.741205+00:00', '2025-10-29T08:33:55.741205+00:00'),
(gen_random_uuid(), '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'practitioner', '2025-11-29T15:54:23.718322+00:00', '2025-11-29T15:54:23.718322+00:00'),
(gen_random_uuid(), '7dd7958c-9bc8-453d-beda-b112a69b3721', 'practitioner', '2025-12-01T13:08:31.367603+00:00', '2025-12-01T13:08:31.367603+00:00'),
(gen_random_uuid(), '6981a2d2-5f8d-4706-8ca2-eccbc159b23b', 'practitioner', '2025-12-03T12:19:38.052654+00:00', '2025-12-03T12:19:38.052654+00:00'),
(gen_random_uuid(), 'ebefbeaf-20cc-4e96-a89c-de709ccddba6', 'coach', '2025-12-04T23:47:13.581502+00:00', '2025-12-04T23:47:13.581502+00:00'),
(gen_random_uuid(), 'f9eaf9b6-961c-477f-9844-e060391e7974', 'coach', '2025-12-14T19:23:25.637256+00:00', '2025-12-14T19:23:25.637256+00:00'),
(gen_random_uuid(), '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'practitioner', '2025-12-14T20:18:58.274257+00:00', '2025-12-14T20:18:58.274257+00:00'),
(gen_random_uuid(), '315a88d6-cbed-4704-b1f4-abab012433a1', 'patient', '2025-11-29T15:39:30.458118+00:00', '2025-11-29T15:39:30.458118+00:00'),
(gen_random_uuid(), 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'patient', '2025-12-02T18:23:59.367354+00:00', '2025-12-02T18:23:59.367354+00:00'),
(gen_random_uuid(), 'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'patient', '2025-12-01T13:16:01.860949+00:00', '2025-12-01T13:16:01.860949+00:00'),
(gen_random_uuid(), '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'patient', '2025-12-05T07:44:16.35022+00:00', '2025-12-05T07:44:16.35022+00:00')
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================
-- 5. SYSTEM_CONFIG (10 enregistrements)
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
('52a6e2b5-da26-478f-a2d4-4e01b4846bc5', 'payment_commission_rate', '{"description": "Commission plateforme en pourcentage (5%)", "rate": 0.05}', 'Taux de commission de la plateforme sur les paiements', '2025-12-10T12:34:32.800375+00:00', NULL),
('a0a56321-fbb5-4e2b-9944-c13173e4ee96', 'commission_rate', '{"default": 0.05, "exceptions": {}}', 'Taux de commission global et exceptions par catégorie/zone', '2025-12-10T12:34:32.800375+00:00', NULL)
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 6. LEDGER_ACCOUNTS (10 enregistrements)
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
-- 7. APPOINTMENTS (21 enregistrements - échantillon)
-- ============================================================

INSERT INTO appointments (id, patient_id, patient_name, practitioner_id, practitioner_name, practitioner_status, specialty, date, time, duration, address, reason, status, urgency_level, visit_status, payment_amount, created_at, updated_at) VALUES
('e4629f37-bbbb-4389-976b-bbde81b97d8d', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'Axelle test Touade', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'medecin', '2025-12-03', '14:00', 60, 'Menontin, Littoral, Bénin', 'Jjdddddfjjvccfffg', 'completed', 'non-urgent', 'scheduled', 10000, '2025-12-03T09:59:13.879955+00:00', '2025-12-03T12:22:11.037+00:00'),
('2d7e50ef-0db8-45b3-b5cd-e175d470cd67', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'Axelle test Touade', 'b06788a8-e77b-412f-9c69-3c68cdab5306', 'Karim Test Essai', 'assigned', 'nutritionniste', '2025-12-04', '09:30', 60, 'Menontin, Littoral, Bénin', 'Ggfddddddssdddd', 'completed', 'non-urgent', 'scheduled', 10000, '2025-12-03T18:48:56.488783+00:00', '2025-12-03T18:53:02.197+00:00'),
('edcec54e-1863-420c-8c43-7fc447aa1f53', '315a88d6-cbed-4704-b1f4-abab012433a1', 'ULRICH PATIENT', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'Médecine Générale', '2025-11-30', '11:30', 60, 'Cotonou, Littoral, Bénin', 'mls,lsd ^pz$ l^zlel;ùdùdù:ù$lez^le', 'completed', 'semi-urgent', 'scheduled', 15000, '2025-11-29T20:29:46.287125+00:00', '2025-11-29T21:14:22.097+00:00'),
('ca4b44c5-4e95-4b09-9f76-2ad44223bea8', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'Patient Test', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'Médecine Générale', '2025-12-10', '11:00', 60, 'Cotonou, Bénin', 'ireziie koezhoiezhtezothe jeoitiozjoihte', 'completed', 'semi-urgent', 'scheduled', 15000, '2025-12-10T09:11:33.581833+00:00', '2025-12-10T09:21:03.992+00:00'),
('eb7d768c-033b-44d2-9e16-70abd2cd068f', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'Karim AP', 'a791383e-e527-440d-8e29-d30a285980c6', 'Coach Sportif Test', 'assigned', 'coach_sportif', '2025-12-15', '09:30', 60, 'Fidjrossé, Littoral, Bénin', 'Aaaaaaaaaaaàa', 'confirmed', 'non-urgent', 'scheduled', 10000, '2025-12-14T21:02:56.566133+00:00', '2025-12-14T21:27:09.873+00:00'),
('57818712-da4f-4562-9b35-46427f5c49e3', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'Karim AP', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'medecin', '2025-12-25', '09:30', 60, 'Fidjrossé, Littoral, Bénin', 'Gghhhhhhjjjjjj', 'completed', 'non-urgent', 'scheduled', 10000, '2025-12-14T21:46:43.672941+00:00', '2025-12-14T21:54:31.728+00:00'),
('65b9980c-e54f-4e10-963d-e83a4682c61a', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'Patient Test', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'Médecine Générale', '2025-11-30', '09:30', 60, 'Adresse à préciser', 'rejto;kpozdojotpjto kjrojtojropkd,dlflkgmg', 'cancelled', 'urgent', 'scheduled', 15000, '2025-11-29T19:28:16.913907+00:00', '2025-11-30T08:12:04.049+00:00'),
('55c919f5-caee-48f9-bc4b-10c438b2a450', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'Patient Test', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'Dr. Praticien Test', 'assigned', 'Médecine Générale', '2025-11-30', '09:30', 60, 'Adresse à préciser', 'zkjej oze,ojêjzpkfê o^pjezpkfp^kf^zkez', 'cancelled', 'immediate', 'scheduled', 15000, '2025-11-29T18:01:30.063949+00:00', '2025-11-29T19:22:05.09+00:00')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  payment_amount = EXCLUDED.payment_amount,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 8. PAYMENTS (échantillon - paiements réussis)
-- ============================================================

INSERT INTO payments (id, appointment_id, patient_id, amount, currency, status, payment_method, payer_name, payer_phone, fedapay_transaction_id, commission_amount, fees_amount, gateway_fees_amount, net_amount, payout_status, created_at, updated_at) VALUES
('35b84369-8c3d-4794-8e6b-89a9091ab77b', 'e4629f37-bbbb-4389-976b-bbde81b97d8d', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 10000, 'XOF', 'paid', 'mtn', 'Axelle test Touade', '+22966816919', '384811', 500, 500, 200, 9500, 'completed', '2025-12-03T12:22:08.429+00:00', '2025-12-03T12:22:22.946+00:00'),
('c9656b5c-0b3a-4b38-b63d-5f136ad0dad2', '2d7e50ef-0db8-45b3-b5cd-e175d470cd67', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 10000, 'XOF', 'paid', 'mtn', 'Axelle test Touade', '+22966816919', '384886', 500, 500, 200, 9500, 'paid', '2025-12-03T18:53:00.672+00:00', '2025-12-03T18:53:15.469+00:00'),
('8ec1ce00-a161-4d82-b6b9-9de035e7d3ce', 'ca4b44c5-4e95-4b09-9f76-2ad44223bea8', '03d2c84e-0763-41b0-b03c-df13db2480e6', 15000, 'XOF', 'paid', 'mtn', 'Patient Test', '+22967000001', '386663', 750, 750, 300, 14250, 'completed', '2025-12-10T09:21:01.926+00:00', '2025-12-10T09:21:26.628+00:00'),
('27818098-15fb-42be-9a29-dbda3d25826b', 'ca4b44c5-4e95-4b09-9f76-2ad44223bea8', '03d2c84e-0763-41b0-b03c-df13db2480e6', 10000, 'XOF', 'paid', 'mtn', 'Patient Test', '+22967000001', '386684', 500, 500, 200, 9500, 'pending', '2025-12-10T09:50:06.556+00:00', '2025-12-10T09:50:19.893+00:00'),
('8a2dced9-bc0a-4019-9d16-1a2dd5e6fc27', 'eb7d768c-033b-44d2-9e16-70abd2cd068f', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 10000, 'XOF', 'paid', 'mtn', 'Karim AP', '+22940545548', '388101', 500, 500, 200, 9500, 'pending', '2025-12-14T20:58:06.79+00:00', '2025-12-14T20:58:18.76+00:00'),
('8c424c1d-c75f-4b7a-9e76-ef27fdbf5db1', '57818712-da4f-4562-9b35-46427f5c49e3', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 10000, 'XOF', 'paid', 'mtn', 'Karim AP', '+22940545548', '388107', 500, 500, 200, 9500, 'pending', '2025-12-14T21:54:17.447+00:00', '2025-12-14T21:54:31.723+00:00'),
('47e36fbb-72b3-4455-ad4e-f3bc0cdf2131', 'edcec54e-1863-420c-8c43-7fc447aa1f53', '315a88d6-cbed-4704-b1f4-abab012433a1', 15000, 'XOF', 'paid', 'mtn', 'ULRICH PATIENT', '+22996466777', '383969', 750, 750, 300, 14250, 'completed', '2025-11-29T21:13:53.935+00:00', '2025-11-29T21:14:22.092+00:00')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  payout_status = EXCLUDED.payout_status,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 9. PAYOUT_BATCHES (1 enregistrement)
-- ============================================================

INSERT INTO payout_batches (id, batch_date, status, total_amount, practitioners_count, payment_method, created_by, processed_at, statement_url, created_at, updated_at) VALUES
('a58acca1-6716-43c8-bef6-016bd0bff1d6', '2025-12-10', 'sent', 9500, 1, 'momo', '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', '2025-12-10T11:37:39.286+00:00', NULL, '2025-12-10T11:35:08.298628+00:00', '2025-12-10T11:37:39.314945+00:00')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  processed_at = EXCLUDED.processed_at,
  updated_at = EXCLUDED.updated_at;

-- ============================================================
-- REACTIVATION DES TRIGGERS (exécuter après import)
-- ============================================================
/*
DO $$ 
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER ALL', t);
    END LOOP;
END $$;
*/

-- ============================================================
-- VERIFICATION POST-IMPORT
-- ============================================================
/*
SELECT 'profiles' as table_name, COUNT(*) as count FROM profiles
UNION ALL SELECT 'practitioners', COUNT(*) FROM practitioners
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL SELECT 'ledger_accounts', COUNT(*) FROM ledger_accounts
ORDER BY table_name;
*/

-- ============================================================
-- STATISTIQUES
-- ============================================================
-- Profiles: 14
-- Practitioners: 7
-- Appointments: 21 (8 inclus dans ce fichier)
-- Payments: 45 (7 paiements réussis inclus)
-- Services: 2
-- User Roles: 14
-- Ledger Accounts: 10
-- System Config: 10
-- Payout Batches: 1
-- ============================================================

-- =====================================================
-- DOMICARES - SAUVEGARDE COMPLÉMENTAIRE DES DONNÉES
-- Généré le: 2025-01-23
-- 
-- Ce fichier contient les données NON incluses dans:
-- - domicares-data-backup.sql (données de référence)
-- - domicares-full-backup.sql (données transactionnelles principales)
-- - domicares-auth-users-backup.sql (utilisateurs auth)
-- =====================================================

-- =====================================================
-- TABLE: practitioner_availability (28 lignes)
-- Disponibilités des praticiens
-- =====================================================

INSERT INTO practitioner_availability (id, practitioner_id, day_of_week, start_time, end_time, is_active, created_at)
VALUES
-- Praticien 40ffeae5-0412-48aa-9a02-3fc7caff8fef (7 jours)
('9bfc0625-ca5c-47c5-8fbc-bf243bbad063', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 0, '09:00:00', '17:00:00', true, '2025-11-16 12:05:10.642329+00'),
('52a991a2-0b3c-4473-bdce-d9123e1f6048', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 1, '09:00:00', '17:00:00', true, '2025-11-16 12:03:54.61253+00'),
('780eeb92-cc0e-4776-b744-0ce66909582a', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 2, '09:00:00', '17:00:00', true, '2025-11-16 12:04:04.741635+00'),
('a6bd9d6a-4054-4fd5-a80e-43eadc55450d', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 3, '09:00:00', '17:00:00', true, '2025-11-16 12:04:26.977361+00'),
('a21e11e3-a83e-4952-a039-08950e8a5967', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 4, '09:00:00', '17:00:00', true, '2025-11-16 12:04:44.810356+00'),
('4fa300c6-c6e5-4b87-a017-6c17f0eb8d0a', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 5, '09:00:00', '17:00:00', true, '2025-11-16 12:04:53.570147+00'),
('d162634c-cf90-47ef-b3a0-10390725296f', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 6, '09:00:00', '17:00:00', true, '2025-11-16 12:05:02.86842+00'),
-- Praticien a791383e-e527-440d-8e29-d30a285980c6 (7 jours)
('18fb7678-1429-4045-970a-aa2cb29d014e', 'a791383e-e527-440d-8e29-d30a285980c6', 0, '09:00:00', '17:00:00', true, '2025-12-10 10:53:42.292957+00'),
('c9066d7c-a98d-4b55-b4a5-91dc157d2c64', 'a791383e-e527-440d-8e29-d30a285980c6', 1, '09:00:00', '17:00:00', true, '2025-12-10 10:53:12.890851+00'),
('fb86afb8-a249-469a-9a84-ec659c45de2b', 'a791383e-e527-440d-8e29-d30a285980c6', 2, '09:00:00', '17:00:00', true, '2025-12-10 10:53:59.308529+00'),
('06e45148-ae0a-4714-8883-a6b6baf74776', 'a791383e-e527-440d-8e29-d30a285980c6', 3, '09:00:00', '17:00:00', true, '2025-12-10 10:53:52.063698+00'),
('234ba93d-bca0-45b6-b60b-92ea78d262c9', 'a791383e-e527-440d-8e29-d30a285980c6', 4, '09:00:00', '17:00:00', true, '2025-12-10 10:54:09.105552+00'),
('a561360b-d47c-4ecb-b388-dbf744341679', 'a791383e-e527-440d-8e29-d30a285980c6', 5, '09:00:00', '17:00:00', true, '2025-12-10 10:54:14.699903+00'),
('a962f393-afc0-4136-8bc1-e41a3a515598', 'a791383e-e527-440d-8e29-d30a285980c6', 6, '09:00:00', '17:00:00', true, '2025-12-10 10:54:20.101499+00'),
-- Praticien ad35f17a-4f6b-41e0-947c-d5989ccc5841 (7 jours)
('1a820d68-fe96-4b75-9fe5-0dc6c39f1ba0', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 0, '09:00:00', '23:00:00', true, '2025-12-14 21:00:15.949791+00'),
('0cd64e51-b515-4b37-8d85-799173d2c726', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 1, '09:00:00', '17:00:00', true, '2025-12-14 19:31:02.007301+00'),
('461e560e-054a-46da-b992-b9c01b77a69c', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 2, '09:00:00', '17:00:00', true, '2025-12-14 19:31:25.635464+00'),
('9a085026-17bb-4e9f-afc2-337492ade390', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 3, '09:00:00', '17:00:00', true, '2025-12-14 19:31:31.038571+00'),
('102bdf1f-d4b7-414a-80ae-0a35325610d5', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 4, '09:00:00', '18:00:00', true, '2025-12-14 19:31:40.870831+00'),
('1d39e7f8-edea-4221-80b7-424afeab65ed', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 5, '09:00:00', '17:00:00', true, '2025-12-14 19:31:48.882991+00'),
('c707214b-1a4d-41c5-86fe-4a966d7886fe', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 6, '09:00:00', '17:00:00', true, '2025-12-14 19:31:54.24839+00'),
-- Praticien b06788a8-e77b-412f-9c69-3c68cdab5306 (2 jours)
('fb9b54ec-9e2c-4ad7-b215-41ca4703904d', 'b06788a8-e77b-412f-9c69-3c68cdab5306', 3, '07:00:00', '22:00:00', true, '2025-12-03 18:35:34.007047+00'),
('3927dac1-fcf6-475e-ab8b-f6b5e36b8d34', 'b06788a8-e77b-412f-9c69-3c68cdab5306', 4, '09:00:00', '22:00:00', true, '2025-12-03 18:46:30.221525+00')
ON CONFLICT (id) DO UPDATE SET
  day_of_week = EXCLUDED.day_of_week,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  is_active = EXCLUDED.is_active;

-- =====================================================
-- TABLE: emergency_contacts (6 lignes)
-- Contacts d'urgence des patients
-- =====================================================

INSERT INTO emergency_contacts (id, user_id, name, phone, relationship, created_at)
VALUES
('9e6ff313-dbaa-4009-92f0-c38a5f893080', '315a88d6-cbed-4704-b1f4-abab012433a1', 'PAPA', '+22996466777', 'Contact d''urgence', '2025-11-29 15:39:31.882326+00'),
('9a06f782-e5ea-4c89-bc52-59b40e5f6f4c', 'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'axelle akpo', '+22961000061', 'Contact d''urgence', '2025-12-01 13:16:03.728832+00'),
('b6c4d317-ea23-4c05-8bce-efa3681878f2', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'Touade', '+22966436295', 'Contact d''urgence', '2025-12-02 18:24:00.879143+00'),
('dd8dfa59-6eea-4677-ab19-a9edfae4df15', '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'MENSAH-DZRAKU', '+22995052643', 'Contact d''urgence', '2025-12-05 07:44:17.722678+00'),
('1d7ba937-d316-4d2a-9e44-29feab8dd877', '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'MENSAH-DZRAKU', '+22995052643', 'Contact d''urgence', '2025-12-05 07:44:17.893089+00'),
('da768b49-8b78-45a0-aa4c-9dce227f03e5', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'AAAAA', '+22966404040', 'Contact d''urgence', '2025-12-14 20:19:27.087304+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  relationship = EXCLUDED.relationship;

-- =====================================================
-- TABLE: medical_profiles (5 lignes)
-- Profils médicaux des patients
-- =====================================================

INSERT INTO medical_profiles (id, user_id, blood_type, chronic_diseases, allergies, current_medications, share_with_practitioner, created_at, updated_at)
VALUES
('63ddad63-40a4-45d2-ae5c-fba98bdb5051', '315a88d6-cbed-4704-b1f4-abab012433a1', 'inconnu', 'Asthme', NULL, NULL, true, '2025-11-29 15:39:32.174141+00', '2025-11-29 15:39:32.174141+00'),
('1b65ca7c-d576-46d4-851b-05040c4484b9', 'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'inconnu', NULL, NULL, NULL, true, '2025-12-01 13:16:04.166013+00', '2025-12-01 13:16:04.166013+00'),
('bc46fc86-3e9a-43d0-8527-b7715c5f3a74', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'inconnu', NULL, NULL, NULL, true, '2025-12-02 18:24:01.249334+00', '2025-12-02 18:24:01.249334+00'),
('e11f4b04-c0ba-441b-9efd-20ddbda6b4f6', '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'inconnu', 'Arthrite', NULL, NULL, true, '2025-12-05 07:44:18.043497+00', '2025-12-05 07:44:18.043497+00'),
('76a8eac6-b4fa-489c-87bc-3f3f0e580491', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'inconnu', 'Autre', NULL, NULL, true, '2025-12-14 20:19:30.65908+00', '2025-12-14 20:19:30.65908+00')
ON CONFLICT (id) DO UPDATE SET
  blood_type = EXCLUDED.blood_type,
  chronic_diseases = EXCLUDED.chronic_diseases,
  share_with_practitioner = EXCLUDED.share_with_practitioner;

-- =====================================================
-- TABLE: consents (9 lignes)
-- Consentements CGU acceptés par les utilisateurs
-- =====================================================

INSERT INTO consents (id, user_id, consent_type, is_accepted, accepted_at, created_at)
VALUES
('eca974d7-9a04-4a5b-a248-5f56fe92282a', '315a88d6-cbed-4704-b1f4-abab012433a1', 'cgu', true, '2025-11-29 15:30:17.131+00', '2025-11-29 15:39:32.747474+00'),
('3f080739-9845-4b10-a100-7266f03d37b2', 'ec6179bb-5ce5-433b-82c4-e9d448910dee', 'cgu', true, '2025-12-02 18:23:22.323+00', '2025-12-02 18:24:01.902259+00'),
('9bf40d31-f064-46fe-9e7b-b2b5c7924a1b', '83daa631-b895-4e8f-9e3c-4ef9e12c0b93', 'cgu', true, '2025-12-05 07:43:45.783+00', '2025-12-05 07:44:18.742638+00'),
('a69810be-8c09-483f-8370-333b7e43a09d', 'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'cgu', true, '2025-12-14 17:45:28.537688+00', '2025-12-14 17:45:28.537688+00'),
('a0c8c3cb-9973-46a4-a7d7-b4aea8706bcd', 'ebefbeaf-20cc-4e96-a89c-de709ccddba6', 'cgu', true, '2025-12-14 17:46:28.972406+00', '2025-12-14 17:46:28.972406+00'),
('1fbcdac3-f780-42bf-b49e-e4d3ed528c78', '6981a2d2-5f8d-4706-8ca2-eccbc159b23b', 'cgu', true, '2025-12-14 17:46:28.972406+00', '2025-12-14 17:46:28.972406+00'),
('3a0f3b72-5ec5-4a42-850f-d41de01c30eb', '7dd7958c-9bc8-453d-beda-b112a69b3721', 'cgu', true, '2025-12-14 17:46:28.972406+00', '2025-12-14 17:46:28.972406+00'),
('506fd00d-dec9-4511-85c3-3ce8a20e69de', '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'cgu', true, '2025-12-14 17:46:28.972406+00', '2025-12-14 17:46:28.972406+00'),
('7dc35928-1f36-44a9-8362-e09e04aaf327', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'cgu', true, '2025-12-14 20:18:51.473+00', '2025-12-14 20:19:31.37986+00')
ON CONFLICT (id) DO UPDATE SET
  is_accepted = EXCLUDED.is_accepted,
  accepted_at = EXCLUDED.accepted_at;

-- =====================================================
-- TABLE: consultation_reports (4 lignes)
-- Rapports de consultation créés par les praticiens
-- =====================================================

INSERT INTO consultation_reports (id, practitioner_id, appointment_id, consultation_type, consultation_reason, clinical_findings, primary_diagnosis, treatment_prescription, follow_up_recommendation, follow_up_timeframe, additional_comments, severity_level, share_with_doctor, consultation_date, created_at, updated_at)
VALUES
('63c82d83-cdd1-4b8f-8d0d-7f9e2c3fb9bb', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'edcec54e-1863-420c-8c43-7fc447aa1f53', 'domicile', 'po^llùl,pojokkkk^pk;m;m::ù::', 'k^kkùmllùlùlllkp,oiymùp*^$^$$^^', 'lklkkk pooiioouuoip^^', 'ouioiip^p l^p^pooô', 'kkkpkpkpl p^pl^l^lll^$$', 'demande', 'pooop^', 'modere', true, '2025-12-02 22:31:37.303+00', '2025-12-02 22:31:40.775048+00', '2025-12-02 22:31:40.775048+00'),
('58b254d9-b92b-448e-97b1-89bfbd479735', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'e4629f37-bbbb-4389-976b-bbde81b97d8d', 'domicile', 'mjds pksdkfo,z,odskk^pdsk^pgks', '^kjsqifjpjofjsqkfez opezokpkfozjpojpejezpojt', 'mdsjmdskksk ldklgspkrkhopojg', 'mjdsofpjdqf plkdspkgppgjpgjd', 'sfdspojjs loezkpkpoezjposdsjgs', '24h', 'oiwjpojvpjdsvojsdpj', 'modere', true, '2025-12-03 13:53:27.371+00', '2025-12-03 13:53:28.131129+00', '2025-12-03 13:53:28.131129+00'),
('7a077c67-fb3d-4416-ba85-3a0208682bc6', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', 'ca4b44c5-4e95-4b09-9f76-2ad44223bea8', 'domicile', 'kdsjisjd ksqjfopfjsq kjqosjpsjpojs', 'sqjfsijfiqf isqoijfoiqsjfosqijfs ijsqojfjsjqfpjsqpofjsqpojfpqs', 'sojdposqjpqsjpofjsqfpjsqpofqsofpoqshpfhsq', 'sqfpojspfjopfjpojsqfoqjfojqsofjsoqpjf', 'sfsq,fpsqpfjd mdkfkpf^kq^pkf lksqpkfksqkfq^pf', '24h', 'sqfkkfpoqs osqkpkg^pqsk^fppq lkskq^pkf^ksqf', 'leger', true, '2025-12-10 10:07:49.005+00', '2025-12-10 10:07:53.59681+00', '2025-12-10 10:07:53.59681+00'),
('efd2759b-28d1-4c37-b5f1-f8feb4be83cd', '40ffeae5-0412-48aa-9a02-3fc7caff8fef', '57818712-da4f-4562-9b35-46427f5c49e3', 'domicile', 'Dhdhdbdbbfbfbfndndndndndn', 'Fjfjdnxnnfnd''d''d''d''d''d''dndndndndn', 'Jdjjdxjnxnxndnxnxndnxnd', 'Kdnxnxnxnxnnxnxnxnxndnd', 'Jdjfjdjfjjfkfnfnfnfkfkdkkd', '3-7j', 'Jdndnndndndndndndnd', 'leger', true, '2025-12-14 21:58:42.037+00', '2025-12-14 21:58:44.336757+00', '2025-12-14 21:58:44.336757+00')
ON CONFLICT (id) DO UPDATE SET
  consultation_reason = EXCLUDED.consultation_reason,
  clinical_findings = EXCLUDED.clinical_findings,
  primary_diagnosis = EXCLUDED.primary_diagnosis,
  treatment_prescription = EXCLUDED.treatment_prescription,
  severity_level = EXCLUDED.severity_level;

-- =====================================================
-- TABLE: group_sessions (3 lignes)
-- Séances de groupe créées par les coachs
-- =====================================================

INSERT INTO group_sessions (id, coach_id, session_name, session_type, description, scheduled_date, start_time, end_time, location, price_per_person, max_participants, min_participants, current_participants, status, created_at, updated_at)
VALUES
('99c3a4eb-6dfb-423c-9caf-3fda36963051', 'a791383e-e527-440d-8e29-d30a285980c6', 'yoga pour mamie', 'groupe', 'oezh poejpjpjpezjn ijepojepjepozj', '2025-12-11', '12:00:00', '17:30:00', 'Cotonou, Littoral, Bénin', 10000, 10, 3, 1, 'planifiee', '2025-12-09 20:53:45.994783+00', '2025-12-10 09:50:05.8914+00'),
('3f5bfdf5-cf79-478a-b523-fc96d28e0e3c', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 'CARDIO', 'groupe', 'ML?FDMLGMGDFJDMLFJ', '2025-12-14', '21:00:00', '21:10:00', '', 10000, 10, 3, 0, 'annulee', '2025-12-14 19:40:40.426127+00', '2025-12-14 20:13:19.618238+00'),
('33722776-9054-4ee8-acef-46df0c6a3fa1', 'ad35f17a-4f6b-41e0-947c-d5989ccc5841', 'Cardio', 'groupe', 'Cardio', '2025-12-15', '10:00:00', '11:00:00', 'Fidjrossé, Littoral, Bénin', 10000, 5, 3, 1, 'planifiee', '2025-12-14 20:54:20.186412+00', '2025-12-14 20:58:04.674672+00')
ON CONFLICT (id) DO UPDATE SET
  session_name = EXCLUDED.session_name,
  current_participants = EXCLUDED.current_participants,
  status = EXCLUDED.status;

-- =====================================================
-- TABLE: group_session_participants (2 lignes)
-- Participants aux séances de groupe
-- =====================================================

INSERT INTO group_session_participants (id, session_id, patient_id, payment_status, joined_at)
VALUES
('5bed606d-f38f-43a8-b5de-d2c29a393762', '99c3a4eb-6dfb-423c-9caf-3fda36963051', '03d2c84e-0763-41b0-b03c-df13db2480e6', 'paid', '2025-12-10 09:49:42.490577+00'),
('62f48c6e-8430-4be8-91fa-541b224264e4', '33722776-9054-4ee8-acef-46df0c6a3fa1', '280b1e4f-acd7-4896-81fc-65a7d4b9e437', 'paid', '2025-12-14 20:57:34.062066+00')
ON CONFLICT (id) DO UPDATE SET
  payment_status = EXCLUDED.payment_status;

-- =====================================================
-- TABLE: messages (1 ligne)
-- Messages échangés dans les rendez-vous
-- =====================================================

INSERT INTO messages (id, appointment_id, sender_id, content, is_read, created_at)
VALUES
('f4bacd44-2b00-4f50-ab8b-441a52a9616a', 'edcec54e-1863-420c-8c43-7fc447aa1f53', '315a88d6-cbed-4704-b1f4-abab012433a1', 'dds', false, '2025-11-30 20:05:47.246519+00')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  is_read = EXCLUDED.is_read;

-- =====================================================
-- TABLE: payment_attempts (1 ligne)
-- Tentatives de paiement
-- =====================================================

INSERT INTO payment_attempts (id, user_id, amount, payment_method, status, attempt_number, created_at)
VALUES
('eeefb0d8-427d-4132-b8eb-0621eb62e835', '03d2c84e-0763-41b0-b03c-df13db2480e6', 10000, 'mtn', 'pending', 1, '2025-12-10 09:49:40.156525+00')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status;

-- =====================================================
-- NOTES SUR LES TABLES NON EXPORTÉES
-- =====================================================
/*
Les tables suivantes ne sont PAS incluses car ce sont des logs/événements 
qui peuvent être régénérés ou ne sont pas essentiels à la migration:

1. notifications (115 lignes)
   - Notifications système générées automatiquement
   - Peuvent être régénérées par le système

2. payment_events (121 lignes)
   - Logs d'événements de paiement pour audit
   - Historique FedaPay
   - Non essentiels pour la migration fonctionnelle

Si vous avez besoin de ces données pour l'audit, 
contactez l'administrateur pour un export spécifique.
*/

-- =====================================================
-- RÉCAPITULATIF DE L'EXPORT
-- =====================================================
/*
TABLES EXPORTÉES DANS CE FICHIER:
| Table                        | Lignes |
|------------------------------|--------|
| practitioner_availability    | 28     |
| emergency_contacts           | 6      |
| medical_profiles             | 5      |
| consents                     | 9      |
| consultation_reports         | 4      |
| group_sessions               | 3      |
| group_session_participants   | 2      |
| messages                     | 1      |
| payment_attempts             | 1      |
|------------------------------|--------|
| TOTAL                        | 59     |

ORDRE D'IMPORTATION RECOMMANDÉ:
1. domicares-auth-users-backup.sql (utilisateurs auth)
2. domicares-data-backup.sql (données de référence)
3. domicares-full-backup.sql (données transactionnelles)
4. domicares-supplementary-backup.sql (ce fichier)
*/

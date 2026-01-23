-- =====================================================
-- DOMICARES - SAUVEGARDE DES UTILISATEURS AUTH
-- Généré le: 2025-01-23
-- 
-- IMPORTANT: Ce fichier contient les données des utilisateurs auth.users
-- Pour l'importation, utilisez la fonction admin de Supabase ou pg_dump
-- Les mots de passe ne peuvent PAS être exportés directement
-- =====================================================

-- =====================================================
-- OPTION 1: Recréer les utilisateurs via l'API Admin
-- Utilisez le script Node.js ci-dessous avec supabase-js
-- =====================================================

/*
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'VOTRE_SUPABASE_URL',
  'VOTRE_SERVICE_ROLE_KEY' // Clé service_role, pas anon!
);

const users = [
  // Patient Test
  {
    id: '03d2c84e-0763-41b0-b03c-df13db2480e6',
    email: 'patient@test.com',
    password: 'Patient123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Patient Test',
      user_type: 'patient',
      email_verified: true
    }
  },
  // Praticien Test
  {
    id: '4896ba4d-4d26-47ad-8713-49a0ce377366',
    email: 'praticien@test.com',
    password: 'Praticien123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Dr. Praticien Test',
      user_type: 'practitioner',
      email_verified: true
    }
  },
  // Admin Test
  {
    id: '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0',
    email: 'admin@test.com',
    password: 'Admin123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Admin Test',
      user_type: 'admin',
      email_verified: true
    }
  },
  // Coach Test
  {
    id: 'cc46aa4a-94c5-4593-b67a-203f95b0b3d0',
    email: 'coach@test.com',
    password: 'Coach123!',
    email_confirm: true,
    user_metadata: {
      full_name: 'Coach Sportif Test',
      user_type: 'practitioner',
      practitioner_type: 'coach_sportif',
      email_verified: true
    }
  },
  // Ulrich Patient
  {
    id: '315a88d6-cbed-4704-b1f4-abab012433a1',
    email: 'developpeurulrichsegla@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'ULRICH PATIENT',
      user_type: 'patient',
      patient_onboarding_completed: true,
      email_verified: true
    }
  },
  // Ulrich Praticien
  {
    id: '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8',
    email: 'usegla@gouv.bj',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'ulrich praticien',
      user_type: 'practitioner',
      practitioner_type: 'infirmier',
      phone: '+22996466776',
      email_verified: true
    }
  },
  // Axelle Test Akpo
  {
    id: 'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a',
    email: 'axelle.akpo21@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'axelle test akpo',
      user_type: 'patient',
      email_verified: true
    }
  },
  // Elodie CODJO (Psychologue)
  {
    id: '7dd7958c-9bc8-453d-beda-b112a69b3721',
    email: 'codjoelodie@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Elodie CODJO',
      user_type: 'practitioner',
      practitioner_type: 'psychologue',
      phone: '+22966260582',
      email_verified: true
    }
  },
  // Axelle Touade
  {
    id: 'ec6179bb-5ce5-433b-82c4-e9d448910dee',
    email: 'managementservices229@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Axelle test Touade',
      user_type: 'patient',
      patient_onboarding_completed: true,
      email_verified: true
    }
  },
  // Karim Test Essai (Nutritionniste)
  {
    id: '8c4f9f46-5be5-43e9-af42-ca51dfbebdf4',
    email: 'karimessaitest@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Karim Test Essai',
      user_type: 'practitioner',
      practitioner_type: 'nutritionniste',
      phone: '+22961000000',
      email_verified: true
    }
  },
  // Audrey Patient
  {
    id: 'ad97ef7a-7f9c-4a8a-8add-9068ced3f1c9',
    email: 'audreypatienttest@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Audrey Patient',
      user_type: 'patient',
      email_verified: true
    }
  },
  // John Doe
  {
    id: 'f2108c7d-fc39-486a-bfa7-eb1f6e1e89f5',
    email: 'john.doe@example.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'John Doe',
      user_type: 'patient',
      email_verified: true
    }
  },
  // Oluwa Test
  {
    id: '0193f2dd-0f66-79f7-b99c-a56e8edfff2b',
    email: 'oluwatest@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Oluwa Test',
      user_type: 'patient',
      patient_onboarding_completed: true,
      email_verified: true
    }
  },
  // Mariam Toka
  {
    id: '01944403-b521-7da5-860e-e0084047f7e2',
    email: 'mariamtoka@gmail.com',
    password: 'DEMANDER_NOUVEAU_MDP',
    email_confirm: true,
    user_metadata: {
      full_name: 'Mariam Toka',
      user_type: 'patient',
      patient_onboarding_completed: true,
      email_verified: true
    }
  }
];

// Fonction pour créer les utilisateurs
async function createUsers() {
  for (const user of users) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: user.email_confirm,
        user_metadata: user.user_metadata,
        // Optionnel: forcer le même ID
        // id: user.id  // Attention: peut ne pas fonctionner selon la version
      });
      
      if (error) {
        console.error(`Erreur pour ${user.email}:`, error.message);
      } else {
        console.log(`✅ Utilisateur créé: ${user.email}`);
      }
    } catch (e) {
      console.error(`Exception pour ${user.email}:`, e);
    }
  }
}

createUsers();
*/

-- =====================================================
-- OPTION 2: Données de référence pour mapping des IDs
-- Utilisez cette table pour mapper les anciens IDs aux nouveaux
-- =====================================================

-- Table de mapping des utilisateurs (à créer dans votre nouvelle base)
-- CREATE TABLE IF NOT EXISTS migration_user_mapping (
--   old_id UUID PRIMARY KEY,
--   new_id UUID,
--   email TEXT NOT NULL,
--   user_type TEXT,
--   migrated_at TIMESTAMPTZ DEFAULT now()
-- );

-- Données des utilisateurs à migrer
-- INSERT INTO migration_user_mapping (old_id, email, user_type) VALUES
-- ('03d2c84e-0763-41b0-b03c-df13db2480e6', 'patient@test.com', 'patient'),
-- ('4896ba4d-4d26-47ad-8713-49a0ce377366', 'praticien@test.com', 'practitioner'),
-- ('6e247f5d-687e-4ad8-b3da-3d0d6a2058b0', 'admin@test.com', 'admin'),
-- ('cc46aa4a-94c5-4593-b67a-203f95b0b3d0', 'coach@test.com', 'practitioner'),
-- ('315a88d6-cbed-4704-b1f4-abab012433a1', 'developpeurulrichsegla@gmail.com', 'patient'),
-- ('5be3b214-c3d5-4f90-bfc8-02dd7513f4b8', 'usegla@gouv.bj', 'practitioner'),
-- ('fdf4a81b-9041-4e47-a6e4-5893d1b84a3a', 'axelle.akpo21@gmail.com', 'patient'),
-- ('7dd7958c-9bc8-453d-beda-b112a69b3721', 'codjoelodie@gmail.com', 'practitioner'),
-- ('ec6179bb-5ce5-433b-82c4-e9d448910dee', 'managementservices229@gmail.com', 'patient'),
-- ('8c4f9f46-5be5-43e9-af42-ca51dfbebdf4', 'karimessaitest@gmail.com', 'practitioner'),
-- ('ad97ef7a-7f9c-4a8a-8add-9068ced3f1c9', 'audreypatienttest@gmail.com', 'patient'),
-- ('f2108c7d-fc39-486a-bfa7-eb1f6e1e89f5', 'john.doe@example.com', 'patient'),
-- ('0193f2dd-0f66-79f7-b99c-a56e8edfff2b', 'oluwatest@gmail.com', 'patient'),
-- ('01944403-b521-7da5-860e-e0084047f7e2', 'mariamtoka@gmail.com', 'patient');

-- =====================================================
-- OPTION 3: Script SQL pour insertion directe (AVANCÉ)
-- ATTENTION: Nécessite accès superuser à PostgreSQL
-- =====================================================

-- IMPORTANT: Les mots de passe sont hashés et ne peuvent pas être récupérés
-- Les utilisateurs devront utiliser "Mot de passe oublié" pour se reconnecter

-- Désactiver les triggers temporairement
-- ALTER TABLE auth.users DISABLE TRIGGER ALL;

-- Utilisateurs auth.users (14 utilisateurs)
-- Note: encrypted_password doit être généré avec pgcrypto
INSERT INTO auth.users (
  id, 
  instance_id,
  aud,
  role,
  email, 
  encrypted_password,
  email_confirmed_at,
  created_at, 
  updated_at,
  raw_user_meta_data,
  raw_app_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES 
-- Patient Test
(
  '03d2c84e-0763-41b0-b03c-df13db2480e6',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'patient@test.com',
  crypt('Patient123!', gen_salt('bf')),
  NOW(),
  '2025-10-10 12:11:52.038367+00',
  NOW(),
  '{"full_name": "Patient Test", "user_type": "patient", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Praticien Test
(
  '4896ba4d-4d26-47ad-8713-49a0ce377366',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'praticien@test.com',
  crypt('Praticien123!', gen_salt('bf')),
  NOW(),
  '2025-10-10 13:18:10.143418+00',
  NOW(),
  '{"full_name": "Dr. Praticien Test", "user_type": "practitioner", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Admin Test (super_admin)
(
  '6e247f5d-687e-4ad8-b3da-3d0d6a2058b0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@test.com',
  crypt('Admin123!', gen_salt('bf')),
  NOW(),
  '2025-10-10 13:18:10.832365+00',
  NOW(),
  '{"full_name": "Admin Test", "user_type": "admin", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Coach Test
(
  'cc46aa4a-94c5-4593-b67a-203f95b0b3d0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'coach@test.com',
  crypt('Coach123!', gen_salt('bf')),
  NOW(),
  '2025-10-29 08:33:55.653251+00',
  NOW(),
  '{"full_name": "Coach Sportif Test", "user_type": "practitioner", "practitioner_type": "coach_sportif", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Ulrich Patient
(
  '315a88d6-cbed-4704-b1f4-abab012433a1',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'developpeurulrichsegla@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-11-29 15:30:24.135256+00',
  NOW(),
  '{"full_name": "ULRICH PATIENT", "user_type": "patient", "patient_onboarding_completed": true, "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Ulrich Praticien (Infirmier)
(
  '5be3b214-c3d5-4f90-bfc8-02dd7513f4b8',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'usegla@gouv.bj',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-11-29 15:54:20.762155+00',
  NOW(),
  '{"full_name": "ulrich praticien", "user_type": "practitioner", "practitioner_type": "infirmier", "phone": "+22996466776", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Axelle Test Akpo
(
  'fdf4a81b-9041-4e47-a6e4-5893d1b84a3a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'axelle.akpo21@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-01 12:32:10.47083+00',
  NOW(),
  '{"full_name": "axelle test akpo", "user_type": "patient", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Elodie CODJO (Psychologue)
(
  '7dd7958c-9bc8-453d-beda-b112a69b3721',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'codjoelodie@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-01 13:08:06.013069+00',
  NOW(),
  '{"full_name": "Elodie CODJO", "user_type": "practitioner", "practitioner_type": "psychologue", "phone": "+22966260582", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Axelle Touade
(
  'ec6179bb-5ce5-433b-82c4-e9d448910dee',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'managementservices229@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-02 18:23:21.832256+00',
  NOW(),
  '{"full_name": "Axelle test Touade", "user_type": "patient", "patient_onboarding_completed": true, "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Karim Test Essai (Nutritionniste)
(
  '8c4f9f46-5be5-43e9-af42-ca51dfbebdf4',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'karimessaitest@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-03 11:32:29.310627+00',
  NOW(),
  '{"full_name": "Karim Test Essai", "user_type": "practitioner", "practitioner_type": "nutritionniste", "phone": "+22961000000", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Audrey Patient
(
  'ad97ef7a-7f9c-4a8a-8add-9068ced3f1c9',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'audreypatienttest@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-04 08:33:03.605315+00',
  NOW(),
  '{"full_name": "Audrey Patient", "user_type": "patient", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- John Doe
(
  'f2108c7d-fc39-486a-bfa7-eb1f6e1e89f5',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'john.doe@example.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-04 19:37:05.009588+00',
  NOW(),
  '{"full_name": "John Doe", "user_type": "patient", "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Oluwa Test
(
  '0193f2dd-0f66-79f7-b99c-a56e8edfff2b',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'oluwatest@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-05 00:22:54.469+00',
  NOW(),
  '{"full_name": "Oluwa Test", "user_type": "patient", "patient_onboarding_completed": true, "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
),
-- Mariam Toka
(
  '01944403-b521-7da5-860e-e0084047f7e2',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'mariamtoka@gmail.com',
  crypt('TempPassword123!', gen_salt('bf')),
  NOW(),
  '2025-12-22 04:35:21.985+00',
  NOW(),
  '{"full_name": "Mariam Toka", "user_type": "patient", "patient_onboarding_completed": true, "email_verified": true}'::jsonb,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  false,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- Réactiver les triggers
-- ALTER TABLE auth.users ENABLE TRIGGER ALL;

-- =====================================================
-- RÉCAPITULATIF DES UTILISATEURS (14 total)
-- =====================================================
/*
| Email                              | Type         | Rôle          | ID                                   |
|------------------------------------|--------------|---------------|--------------------------------------|
| patient@test.com                   | patient      | -             | 03d2c84e-0763-41b0-b03c-df13db2480e6 |
| praticien@test.com                 | practitioner | -             | 4896ba4d-4d26-47ad-8713-49a0ce377366 |
| admin@test.com                     | admin        | super_admin   | 6e247f5d-687e-4ad8-b3da-3d0d6a2058b0 |
| coach@test.com                     | practitioner | coach_sportif | cc46aa4a-94c5-4593-b67a-203f95b0b3d0 |
| developpeurulrichsegla@gmail.com   | patient      | -             | 315a88d6-cbed-4704-b1f4-abab012433a1 |
| usegla@gouv.bj                     | practitioner | infirmier     | 5be3b214-c3d5-4f90-bfc8-02dd7513f4b8 |
| axelle.akpo21@gmail.com            | patient      | -             | fdf4a81b-9041-4e47-a6e4-5893d1b84a3a |
| codjoelodie@gmail.com              | practitioner | psychologue   | 7dd7958c-9bc8-453d-beda-b112a69b3721 |
| managementservices229@gmail.com    | patient      | -             | ec6179bb-5ce5-433b-82c4-e9d448910dee |
| karimessaitest@gmail.com           | practitioner | nutritionniste| 8c4f9f46-5be5-43e9-af42-ca51dfbebdf4 |
| audreypatienttest@gmail.com        | patient      | -             | ad97ef7a-7f9c-4a8a-8add-9068ced3f1c9 |
| john.doe@example.com               | patient      | -             | f2108c7d-fc39-486a-bfa7-eb1f6e1e89f5 |
| oluwatest@gmail.com                | patient      | -             | 0193f2dd-0f66-79f7-b99c-a56e8edfff2b |
| mariamtoka@gmail.com               | patient      | -             | 01944403-b521-7da5-860e-e0084047f7e2 |

Comptes de test avec mots de passe connus:
- patient@test.com       -> Patient123!
- praticien@test.com     -> Praticien123!
- admin@test.com         -> Admin123!
- coach@test.com         -> Coach123!

Autres utilisateurs: TempPassword123! (devront utiliser "Mot de passe oublié")
*/

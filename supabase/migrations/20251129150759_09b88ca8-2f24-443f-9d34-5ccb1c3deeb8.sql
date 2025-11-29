-- Modifier le trigger pour qu'il ne crée PAS automatiquement les profils
-- car cela interfère avec la fonction complete-user-registration

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- On garde la fonction mais elle ne sera pas utilisée automatiquement
-- Elle reste disponible en cas de besoin manuel
DROP FUNCTION IF EXISTS public.handle_new_user();
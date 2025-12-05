-- Autoriser l'accès anonyme à la vue publique sécurisée
-- La vue ne contient que des données non-sensibles (pas de téléphone, adresse, GPS, documents)
GRANT SELECT ON public.practitioners_public_view TO anon;
GRANT SELECT ON public.practitioners_public_view TO authenticated;
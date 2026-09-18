-- Déplacer les extensions du schéma public vers le schéma extensions
-- Certaines extensions système (pg_net, pgsodium) ne peuvent pas être déplacées

-- Créer le schéma extensions s'il n'existe pas
CREATE SCHEMA IF NOT EXISTS extensions;

-- Accorder les privilèges nécessaires
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Définir les privilèges par défaut pour les futurs objets
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- Fonction pour déplacer une extension si elle existe dans public
-- Gère les exceptions pour les extensions qui ne peuvent pas être déplacées
CREATE OR REPLACE FUNCTION move_extension_to_extensions_schema(extension_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ext_schema text;
BEGIN
  -- Vérifier si l'extension existe et dans quel schéma
  SELECT n.nspname INTO ext_schema
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname = extension_name;
  
  -- Si l'extension existe et est dans public, essayer de la déplacer
  IF ext_schema = 'public' THEN
    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', extension_name);
      RAISE NOTICE 'Extension % déplacée vers le schéma extensions', extension_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Extension % ne peut pas être déplacée (extension système): %', extension_name, SQLERRM;
    END;
  ELSIF ext_schema IS NOT NULL THEN
    RAISE NOTICE 'Extension % déjà dans le schéma %', extension_name, ext_schema;
  ELSE
    RAISE NOTICE 'Extension % non trouvée', extension_name;
  END IF;
END;
$$;

-- Déplacer les extensions qui le permettent
-- pgcrypto, uuid-ossp, pgjwt peuvent généralement être déplacées
-- pg_net, pgsodium sont des extensions système qui ne peuvent pas être déplacées
SELECT move_extension_to_extensions_schema('pgcrypto');
SELECT move_extension_to_extensions_schema('uuid-ossp');
SELECT move_extension_to_extensions_schema('pg_stat_statements');
SELECT move_extension_to_extensions_schema('pgjwt');
SELECT move_extension_to_extensions_schema('pg_net');
SELECT move_extension_to_extensions_schema('pgsodium');

-- Nettoyer la fonction temporaire
DROP FUNCTION IF EXISTS move_extension_to_extensions_schema(text);

COMMENT ON SCHEMA extensions IS 'Schéma dédié aux extensions PostgreSQL pour suivre les meilleures pratiques de sécurité Supabase';

-- Note: Les extensions système comme pg_net et pgsodium ne peuvent pas être déplacées
-- Cela est normal et ne pose pas de risque de sécurité car elles sont gérées par Supabase
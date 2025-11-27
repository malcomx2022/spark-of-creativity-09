/**
 * Script de diagnostic pour tester la connexion Supabase
 * À utiliser temporairement pour diagnostiquer les problèmes de connexion
 */

import { supabase } from '@/integrations/supabase/client';

export async function testSupabaseConnection() {
  console.log('🔍 TEST SUPABASE CONNECTION - START');
  console.log('-----------------------------------');

  // Test 1: Vérifier que le client est initialisé
  console.log('Test 1: Client Supabase initialisé?', supabase ? '✅' : '❌');

  if (!supabase) {
    console.error('❌ Client Supabase non initialisé');
    return { success: false, error: 'Client non initialisé' };
  }

  // Test 2: Vérifier les variables d'environnement
  console.log('Test 2: Variables d\'environnement');
  console.log('  - VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL ? '✅' : '❌');
  console.log('  - VITE_SUPABASE_PUBLISHABLE_KEY:', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? '✅' : '❌');

  // Test 3: Tester une requête simple sur practitioners (anonyme)
  console.log('Test 3: Query practitioners (anonyme)');
  try {
    const { data, error } = await supabase
      .from('practitioners')
      .select('id, name, specialty')
      .eq('available', true)
      .eq('kyc_status', 'approved')
      .limit(5);

    if (error) {
      console.error('❌ Erreur query:', error);
      console.error('   Code:', error.code);
      console.error('   Message:', error.message);
      console.error('   Details:', error.details);
      console.error('   Hint:', error.hint);
      return { success: false, error };
    }

    console.log('✅ Query réussie! Praticiens trouvés:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('   Premier praticien:', data[0].name);
    }
    return { success: true, data };

  } catch (err) {
    console.error('❌ Exception:', err);
    return { success: false, error: err };
  } finally {
    console.log('-----------------------------------');
    console.log('🔍 TEST SUPABASE CONNECTION - END');
  }
}

// Auto-exécution si importé
if (import.meta.env.DEV) {
  console.log('💡 Pour tester la connexion, exécute: testSupabaseConnection()');
}

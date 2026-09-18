import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge function appelée par un cron job pour :
 * 1. Nettoyer les créneaux de paiement expirés
 * 2. Demander confirmation aux patients après consultation
 * 3. Auto-confirmer les consultations après 24h sans réponse
 * 
 * À configurer dans pg_cron pour s'exécuter toutes les 5 minutes
 */
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔄 Démarrage des tâches planifiées...');

    // 1. Nettoyer les créneaux de paiement expirés (pending_payment > 15 min)
    console.log('🧹 Nettoyage des créneaux expirés...');
    const { error: cleanupError } = await supabase.rpc('cleanup_expired_payment_slots');
    
    if (cleanupError) {
      console.error('❌ Erreur nettoyage:', cleanupError);
    } else {
      console.log('✅ Nettoyage des créneaux terminé');
    }

    // 2. Demander confirmation pour les consultations terminées
    console.log('📬 Demande de confirmation aux patients...');
    const { error: confirmError } = await supabase.rpc('request_consultation_confirmation');
    
    if (confirmError) {
      console.error('❌ Erreur demande confirmation:', confirmError);
    } else {
      console.log('✅ Demandes de confirmation envoyées');
    }

    // 3. Auto-confirmer les consultations après 24h sans réponse
    console.log('✅ Auto-confirmation des consultations...');
    const { error: autoConfirmError } = await supabase.rpc('auto_confirm_consultations');
    
    if (autoConfirmError) {
      console.error('❌ Erreur auto-confirmation:', autoConfirmError);
    } else {
      console.log('✅ Auto-confirmations effectuées');
    }

    // 4. Récupérer les statistiques pour logging
    const { data: stats } = await supabase
      .from('appointments')
      .select('status')
      .in('status', ['pending_payment', 'awaiting_confirmation', 'cancelled_unpaid']);

    const statsSummary = {
      pending_payment: stats?.filter(a => a.status === 'pending_payment').length || 0,
      awaiting_confirmation: stats?.filter(a => a.status === 'awaiting_confirmation').length || 0,
      cancelled_unpaid: stats?.filter(a => a.status === 'cancelled_unpaid').length || 0,
    };

    console.log('📊 Statistiques:', statsSummary);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Tâches planifiées exécutées avec succès',
        stats: statsSummary,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erreur critique:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { appointmentId } = await req.json();

    if (!appointmentId) {
      return new Response(
        JSON.stringify({ error: 'appointmentId requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cancelling pending payment for appointment:', appointmentId);

    // Trouver le paiement en attente
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('payments')
      .select('id, patient_id, practitioner_id, net_amount')
      .eq('appointment_id', appointmentId)
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching payment:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la récupération du paiement' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Aucun paiement en attente trouvé' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payment = pendingPayments[0];

    // Vérifier que l'utilisateur est bien le patient
    if (payment.patient_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé à annuler ce paiement' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Annuler le paiement de manière atomique avec mise à jour du balance
    if (payment.practitioner_id && payment.net_amount) {
      const { error: atomicError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: payment.id,
        p_practitioner_id: payment.practitioner_id,
        p_net_amount: payment.net_amount,
        p_new_status: 'canceled',
        p_new_payout_status: 'failed',
        p_hold_until: null
      });

      if (atomicError) {
        console.error('Error cancelling payment atomically:', atomicError);
        return new Response(
          JSON.stringify({ error: 'Erreur lors de l\'annulation du paiement' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Fallback: annulation simple si pas de practitioner_id
      const { error: updateError } = await supabase
        .from('payments')
        .update({ 
          status: 'canceled',
          payout_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Error cancelling payment:', updateError);
        return new Response(
          JSON.stringify({ error: 'Erreur lors de l\'annulation du paiement' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Remettre l'appointment en "confirmed" pour permettre un nouveau paiement
    await supabase
      .from('appointments')
      .update({ 
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);

    console.log('Payment cancelled successfully:', payment.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Paiement annulé avec succès',
        paymentId: payment.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur inattendue lors de l\'annulation' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

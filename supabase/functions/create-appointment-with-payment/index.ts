import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateAppointmentRequest {
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  specialty: string;
  date: string;
  time: string;
  duration: number;
  address: string;
  reason: string;
  urgencyLevel?: string;
  amount: number;
  paymentMethod: string;
  phoneNumber: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: CreateAppointmentRequest = await req.json();
    
    console.log('🚀 Création atomique RDV + Paiement:', {
      patient: body.patientId,
      practitioner: body.practitionerId,
      amount: body.amount
    });

    // Validation des données
    if (!body.patientId || !body.practitionerId || !body.amount || !body.phoneNumber) {
      throw new Error('Données manquantes: patientId, practitionerId, amount et phoneNumber requis');
    }

    // Transaction atomique via RPC ou séquence contrôlée
    let appointmentId: string;
    let paymentResult: any;

    try {
      // 1. Créer le rendez-vous
      const { data: appointment, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          patient_id: body.patientId,
          patient_name: body.patientName,
          practitioner_id: body.practitionerId,
          practitioner_name: body.practitionerName,
          specialty: body.specialty,
          date: body.date,
          time: body.time,
          duration: body.duration,
          address: body.address,
          reason: body.reason,
          urgency_level: body.urgencyLevel || 'non-urgent',
          status: 'pending',
        })
        .select('id')
        .single();

      if (appointmentError) {
        console.error('❌ Erreur création RDV:', appointmentError);
        throw appointmentError;
      }

      appointmentId = appointment.id;
      console.log('✅ RDV créé:', appointmentId);

      // 2. Créer le paiement via l'edge function dédiée
      const { data: payment, error: paymentError } = await supabase.functions.invoke(
        'create-payment',
        {
          body: {
            appointmentId: appointmentId,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            phoneNumber: body.phoneNumber,
          }
        }
      );

      if (paymentError) {
        console.error('❌ Erreur création paiement:', paymentError);
        // Rollback: supprimer le RDV créé
        await supabase
          .from('appointments')
          .delete()
          .eq('id', appointmentId);
        
        console.log('🔄 Rollback effectué: RDV supprimé');
        throw new Error(`Échec paiement: ${paymentError.message}`);
      }

      paymentResult = payment;
      console.log('✅ Paiement créé:', paymentResult.paymentId);

      // 3. Vérifier que le paiement a bien été créé
      if (!paymentResult.success || !paymentResult.paymentId) {
        // Rollback: supprimer le RDV
        await supabase
          .from('appointments')
          .delete()
          .eq('id', appointmentId);
        
        console.log('🔄 Rollback effectué: paiement invalide');
        throw new Error('Paiement créé mais invalide');
      }

      console.log('✅ Transaction atomique réussie');

      return new Response(
        JSON.stringify({
          success: true,
          appointmentId,
          paymentId: paymentResult.paymentId,
          paymentUrl: paymentResult.paymentUrl,
          transactionId: paymentResult.transactionId,
          status: paymentResult.status,
          expiresAt: paymentResult.expiresAt,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (error: any) {
      console.error('❌ Erreur transaction:', error);
      
      // Si un RDV a été créé mais pas le paiement, on le supprime
      if (appointmentId) {
        try {
          await supabase
            .from('appointments')
            .delete()
            .eq('id', appointmentId);
          console.log('🔄 Rollback automatique effectué');
        } catch (rollbackError) {
          console.error('❌ Erreur rollback:', rollbackError);
        }
      }
      
      throw error;
    }

  } catch (error: any) {
    console.error('❌ Erreur globale:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de la création du rendez-vous',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

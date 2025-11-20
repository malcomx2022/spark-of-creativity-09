import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PendingPayment {
  id: string;
  patient_id: string;
  session_id: string;
  joined_at: string;
  session: {
    session_name: string;
    scheduled_date: string;
    start_time: string;
    price_per_person: number;
  };
  patient: {
    full_name: string;
    phone: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔔 Starting payment reminders check...');

    // Récupérer les inscriptions avec paiement en attente depuis plus de 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingPayments, error: fetchError } = await supabase
      .from('group_session_participants')
      .select(`
        id,
        patient_id,
        session_id,
        joined_at,
        session:group_sessions(
          session_name,
          scheduled_date,
          start_time,
          price_per_person
        ),
        patient:profiles!group_session_participants_patient_id_fkey(
          full_name,
          phone
        )
      `)
      .eq('payment_status', 'pending')
      .lt('joined_at', twentyFourHoursAgo);

    if (fetchError) {
      console.error('Error fetching pending payments:', fetchError);
      throw fetchError;
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log('✅ No pending payments to remind');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending payments found',
          reminders_sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📧 Found ${pendingPayments.length} pending payments to remind`);

    let remindersSent = 0;
    const errors: any[] = [];

    // Envoyer un rappel pour chaque paiement en attente
    for (const payment of pendingPayments as unknown as PendingPayment[]) {
      try {
        const sessionDate = new Date(payment.session.scheduled_date);
        const formattedDate = sessionDate.toLocaleDateString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Créer la notification
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: payment.patient_id,
            title: '⏰ Rappel de paiement',
            message: `Votre inscription à la séance "${payment.session.session_name}" le ${formattedDate} à ${payment.session.start_time} est en attente de paiement (${payment.session.price_per_person} XOF). Finalisez votre paiement pour confirmer votre place.`,
            type: 'payment_reminder',
            link: '/dashboard/patient?tab=group-sessions'
          });

        if (notifError) {
          console.error(`Error creating notification for patient ${payment.patient_id}:`, notifError);
          errors.push({
            patient_id: payment.patient_id,
            error: notifError.message
          });
          continue;
        }

        // Envoyer un SMS si le numéro de téléphone est disponible
        if (payment.patient?.phone) {
          try {
            const { error: smsError } = await supabase.functions.invoke('send-otp', {
              body: {
                phone: payment.patient.phone,
                message: `Rappel: Votre inscription à "${payment.session.session_name}" attend le paiement de ${payment.session.price_per_person} XOF. Finalisez sur votre dashboard.`,
                type: 'reminder'
              }
            });

            if (smsError) {
              console.warn(`Failed to send SMS to ${payment.patient.phone}:`, smsError);
            }
          } catch (smsErr) {
            console.warn(`SMS sending failed for ${payment.patient.phone}:`, smsErr);
          }
        }

        remindersSent++;
        console.log(`✅ Reminder sent to patient ${payment.patient_id} for session ${payment.session_id}`);

      } catch (error) {
        console.error(`Error processing payment reminder for ${payment.id}:`, error);
        errors.push({
          payment_id: payment.id,
          error: error.message
        });
      }
    }

    console.log(`✅ Payment reminders completed. Sent: ${remindersSent}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        reminders_sent: remindersSent,
        total_pending: pendingPayments.length,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Critical error in send-payment-reminders:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

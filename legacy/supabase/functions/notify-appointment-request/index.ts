import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifyAppointmentRequest {
  appointmentId: string;
  practitionerId: string;
  patientName: string;
  date: string;
  time: string;
  reason: string;
  specialty: string;
}

function normalizePhoneNumber(phone: string): string {
  let normalized = phone.trim();
  normalized = normalized.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }
  return normalized;
}

function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: NotifyAppointmentRequest = await req.json();
    
    console.log('📩 Notification RDV demandée:', {
      appointment: body.appointmentId,
      practitioner: body.practitionerId,
      patient: body.patientName
    });

    if (!body.appointmentId || !body.practitionerId) {
      throw new Error('appointmentId et practitionerId sont requis');
    }

    // Récupérer les infos du praticien
    const { data: practitioner, error: practitionerError } = await supabase
      .from('practitioners')
      .select('user_id, name, practitioner_type')
      .eq('id', body.practitionerId)
      .single();

    if (practitionerError || !practitioner?.user_id) {
      console.error('❌ Praticien non trouvé:', practitionerError);
      throw new Error('Praticien non trouvé');
    }

    console.log('✅ Praticien trouvé:', practitioner.name, '- Type:', practitioner.practitioner_type);

    // Récupérer le téléphone du praticien depuis son profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('phone, full_name')
      .eq('id', practitioner.user_id)
      .single();

    if (profileError) {
      console.error('⚠️ Profil praticien non trouvé:', profileError);
    }

    const practitionerPhone = profile?.phone ? normalizePhoneNumber(profile.phone) : null;
    const dashboardLink = practitioner.practitioner_type === 'coach_sportif' 
      ? '/dashboard/coach' 
      : '/dashboard/practitioner';

    // Formater la date pour affichage
    const formatDateForDisplay = (dateStr: string): string => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      return dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      });
    };

    const formattedDate = formatDateForDisplay(body.date);
    const notificationTitle = '🩺 Nouvelle demande de rendez-vous';
    const notificationMessage = `${body.patientName} souhaite prendre rendez-vous le ${formattedDate} à ${body.time}. Raison: ${body.reason}`;

    // 1. Créer une notification dans la base de données
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: practitioner.user_id,
        title: notificationTitle,
        message: notificationMessage,
        type: 'appointment',
        link: dashboardLink,
      })
      .select()
      .single();

    if (notifError) {
      console.error('❌ Erreur création notification DB:', notifError);
    } else {
      console.log('✅ Notification DB créée:', notification.id);
    }

    // 2. Envoyer un SMS si le numéro est valide
    let smsSent = false;
    if (practitionerPhone && isValidPhoneNumber(practitionerPhone)) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER');

      if (accountSid && authToken && fromNumber) {
        try {
          const smsBody = `DomiCares: ${body.patientName} demande un RDV le ${formattedDate} à ${body.time}. Connectez-vous pour accepter ou refuser.`;
          
          const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
          const params = new URLSearchParams({
            To: practitionerPhone,
            From: fromNumber,
            Body: smsBody,
          });

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });

          if (response.ok) {
            console.log('✅ SMS envoyé au praticien:', practitionerPhone);
            smsSent = true;
          } else {
            const errorText = await response.text();
            console.error('❌ Erreur envoi SMS:', errorText);
          }
        } catch (smsError) {
          console.error('❌ Exception envoi SMS:', smsError);
        }
      } else {
        console.warn('⚠️ Configuration Twilio incomplète, SMS non envoyé');
      }
    } else {
      console.warn('⚠️ Numéro invalide ou manquant pour le praticien:', practitionerPhone);
    }

    // 3. Envoyer une notification push si disponible
    let pushSent = false;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId: practitioner.user_id,
          title: notificationTitle,
          message: notificationMessage,
          url: dashboardLink,
          notificationId: notification?.id,
        }),
      });

      if (pushResponse.ok) {
        console.log('✅ Notification push envoyée');
        pushSent = true;
      } else {
        console.warn('⚠️ Push non envoyée:', await pushResponse.text());
      }
    } catch (pushError) {
      console.warn('⚠️ Exception push:', pushError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationId: notification?.id,
        channels: {
          database: !!notification,
          sms: smsSent,
          push: pushSent,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Erreur globale:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de l\'envoi de la notification',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

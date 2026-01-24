import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  practitionerId: string;
  status: 'approved' | 'rejected' | 'incomplete';
  comment?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const resend = new Resend(RESEND_API_KEY);

    const { practitionerId, status, comment }: NotificationRequest = await req.json();

    console.log('[send-kyc-status-notification] Processing:', { practitionerId, status });

    // Récupérer les informations du praticien avec son type
    const { data: practitioner, error: practitionerError } = await supabase
      .from('practitioners')
      .select('user_id, name, phone, practitioner_type')
      .eq('id', practitionerId)
      .single();

    if (practitionerError || !practitioner) {
      throw new Error('Praticien introuvable');
    }

    // Récupérer l'email de l'utilisateur
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      practitioner.user_id
    );

    if (userError || !userData.user?.email) {
      throw new Error('Email du praticien introuvable');
    }

    const email = userData.user.email;
    const fullName = practitioner.name;
    const phone = practitioner.phone;
    
    // Déterminer le dashboard approprié selon le type de praticien
    const siteUrl = Deno.env.get('SITE_URL') || 'https://domicares.life';
    const dashboardPath = practitioner.practitioner_type === 'coach_sportif' 
      ? '/dashboard/coach' 
      : '/dashboard/practitioner';
    const dashboardUrl = `${siteUrl}${dashboardPath}`;

    // Préparer le contenu selon le statut
    let emailSubject = '';
    let emailContent = '';
    let smsContent = '';

    switch (status) {
      case 'approved':
        emailSubject = '✅ Votre compte DomiCares est activé !';
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">🎉 Félicitations ${fullName} !</h2>
            <p>Votre dossier a été vérifié et validé avec succès.</p>
            <p><strong>Votre compte praticien DomiCares est maintenant actif !</strong></p>
            
            <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #059669; margin-top: 0;">Que pouvez-vous faire maintenant ?</h3>
              <ul style="color: #065f46;">
                <li>✅ Recevoir et accepter des consultations</li>
                <li>✅ Gérer votre disponibilité</li>
                <li>✅ Accéder à votre dashboard praticien</li>
                <li>✅ Commencer à aider des patients</li>
              </ul>
            </div>

            <p style="margin-top: 30px;">
              <a href="${dashboardUrl}" 
                 style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accéder à mon dashboard
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Bienvenue dans l'équipe DomiCares ! 🩺
            </p>
          </div>
        `;
        smsContent = `✅ DomiCares : Votre compte ${practitioner.practitioner_type === 'coach_sportif' ? 'coach' : 'praticien'} est activé ! Vous pouvez maintenant recevoir des consultations. Connectez-vous : ${dashboardUrl}`;
        break;

      case 'rejected':
        emailSubject = '❌ Votre dossier DomiCares nécessite votre attention';
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Dossier non validé</h2>
            <p>Bonjour ${fullName},</p>
            <p>Après examen de votre dossier, nous ne pouvons pas valider votre inscription pour le moment.</p>
            
            ${comment ? `
              <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
                <h3 style="color: #dc2626; margin-top: 0;">Raison du refus :</h3>
                <p style="color: #991b1b; margin: 0;">${comment}</p>
              </div>
            ` : ''}

            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #d97706; margin-top: 0;">📞 Que faire maintenant ?</h3>
              <p style="color: #92400e; margin: 0;">
                Contactez notre équipe support pour plus d'informations :<br>
                📧 Email : support@domicares.life<br>
                📱 Téléphone : +229 XX XX XX XX
              </p>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Cordialement,<br>
              L'équipe DomiCares
            </p>
          </div>
        `;
        smsContent = `❌ DomiCares : Votre dossier n'a pas été validé. ${comment ? `Raison: ${comment.substring(0, 80)}...` : ''} Contactez le support pour plus d'infos.`;
        break;

      case 'incomplete':
        emailSubject = '⚠️ Votre dossier DomiCares est incomplet';
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Dossier incomplet</h2>
            <p>Bonjour ${fullName},</p>
            <p>Votre dossier d'inscription nécessite des informations ou documents complémentaires.</p>
            
            ${comment ? `
              <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <h3 style="color: #d97706; margin-top: 0;">Éléments manquants :</h3>
                <p style="color: #92400e; margin: 0;">${comment}</p>
              </div>
            ` : ''}

            <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1d4ed8; margin-top: 0;">📝 Action requise</h3>
              <p style="color: #1e40af; margin: 0;">
                Connectez-vous à votre dashboard pour compléter votre dossier :<br>
                - Téléverser les documents manquants<br>
                - Remplir les informations requises<br>
                - Resoummettre pour validation
              </p>
            </div>

            <p style="margin-top: 30px;">
              <a href="${dashboardUrl}" 
                 style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Compléter mon dossier
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              Notre équipe reste disponible pour vous accompagner.<br>
              L'équipe DomiCares
            </p>
          </div>
        `;
        smsContent = `⚠️ DomiCares : Votre dossier est incomplet. ${comment ? `À compléter: ${comment.substring(0, 70)}...` : ''} Connectez-vous pour finaliser.`;
        break;

      default:
        throw new Error('Statut invalide');
    }

    let emailSent = false;
    let smsSent = false;

    // Envoyer l'email via Resend
    try {
      const { data, error } = await resend.emails.send({
        from: 'DomiCares <noreply@domicares.life>',
        to: [email],
        subject: emailSubject,
        html: emailContent,
      });

      if (error) {
        console.error('[send-kyc-status-notification] Resend error:', error);
      } else {
        emailSent = true;
        console.log('[send-kyc-status-notification] Email sent successfully via Resend:', data);
      }
    } catch (error) {
      console.error('[send-kyc-status-notification] Email error:', error);
    }

    // Envoyer le SMS via Twilio (si configuré et si téléphone disponible)
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber && phone) {
      try {
        const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: formattedPhone,
              From: twilioPhoneNumber,
              Body: smsContent,
            }),
          }
        );

        if (twilioResponse.ok) {
          smsSent = true;
          console.log('[send-kyc-status-notification] SMS sent successfully');
        } else {
          const errorText = await twilioResponse.text();
          console.error('[send-kyc-status-notification] Twilio error:', errorText);
        }
      } catch (error) {
        console.error('[send-kyc-status-notification] SMS error:', error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        smsSent,
        message: `Notification ${status} envoyée à ${fullName}`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('[send-kyc-status-notification] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de l\'envoi de la notification'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

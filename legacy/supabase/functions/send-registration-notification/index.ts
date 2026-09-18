import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  email: string;
  phone: string;
  fullName: string;
  userType: 'patient' | 'practitioner';
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, phone, fullName, userType }: NotificationRequest = await req.json();

    console.log('Sending registration notification:', { email, phone, fullName, userType });

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const resend = new Resend(RESEND_API_KEY);

    // Prepare messages based on user type
    let emailSubject: string;
    let emailContent: string;
    let smsContent: string;

    if (userType === 'patient') {
      emailSubject = 'Bienvenue sur DomiCares !';
      emailContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0EA5E9;">Bienvenue ${fullName} !</h2>
              <p>Votre inscription sur DomiCares a été confirmée avec succès.</p>
              <p>Vous pouvez maintenant accéder à notre plateforme et bénéficier de services de santé à domicile.</p>
              <p>Pour commencer :</p>
              <ul>
                <li>Connectez-vous à votre compte</li>
                <li>Complétez votre profil médical</li>
                <li>Recherchez un praticien près de chez vous</li>
                <li>Prenez rendez-vous en quelques clics</li>
              </ul>
              <p style="margin-top: 30px;">
                <a href="${Deno.env.get('SITE_URL') || 'https://domicares.life'}" 
                   style="background-color: #0EA5E9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Accéder à mon compte
                </a>
              </p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Si vous avez des questions, n'hésitez pas à nous contacter.
              </p>
            </div>
          </body>
        </html>
      `;
      smsContent = `Bienvenue ${fullName} ! Votre inscription sur DomiCares est confirmée. Connectez-vous pour prendre rendez-vous avec un praticien.`;
    } else {
      // Practitioner
      emailSubject = 'Demande d\'inscription reçue - DomiCares';
      emailContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0EA5E9;">Bienvenue ${fullName} !</h2>
              <p>Nous avons bien reçu votre demande d'inscription en tant que praticien sur DomiCares.</p>
              <p><strong>Statut actuel :</strong> <span style="color: #F59E0B;">En attente de vérification</span></p>
              <p>Notre équipe examine actuellement votre dossier, notamment :</p>
              <ul>
                <li>Vos informations professionnelles</li>
                <li>Vos diplômes et certifications</li>
                <li>Votre licence d'exercice</li>
                <li>Vos documents d'identité</li>
              </ul>
              <p>Ce processus prend généralement <strong>24 à 48 heures</strong>.</p>
              <p style="background-color: #EFF6FF; padding: 15px; border-left: 4px solid #0EA5E9; margin: 20px 0;">
                <strong>Prochaines étapes :</strong><br>
                Vous recevrez une notification par email dès que votre dossier sera validé. 
                Vous pourrez alors commencer à recevoir des demandes de consultation.
              </p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Si vous avez des questions concernant votre inscription, contactez-nous à support@domicares.life
              </p>
            </div>
          </body>
        </html>
      `;
      smsContent = `Bonjour ${fullName}, votre demande d'inscription praticien DomiCares est en cours de vérification. Vous serez notifié sous 24-48h.`;
    }

    const notifications = {
      email: false,
      sms: false,
    };

    // Send email via Resend
    try {
      const { data, error } = await resend.emails.send({
        from: 'DomiCares <noreply@domicares.life>',
        to: [email],
        subject: emailSubject,
        html: emailContent,
      });

      if (error) {
        console.error('Resend error:', error);
      } else {
        console.log('Email sent successfully via Resend:', data);
        notifications.email = true;
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);
    }

    // Send SMS via Twilio if credentials are configured
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && phone) {
      try {
        // Format phone number for Twilio (ensure it starts with +)
        const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

        const smsResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: formattedPhone,
              From: TWILIO_PHONE_NUMBER,
              Body: smsContent,
            }),
          }
        );

        if (smsResponse.ok) {
          console.log('SMS sent successfully via Twilio');
          notifications.sms = true;
        } else {
          const errorText = await smsResponse.text();
          console.error('Twilio error:', smsResponse.status, errorText);
        }
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications,
        message: 'Notification sent successfully'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-registration-notification:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

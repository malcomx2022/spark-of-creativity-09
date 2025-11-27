import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivationRequest {
  practitionerId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { practitionerId }: ActivationRequest = await req.json();

    console.log('Sending account activation notification for practitioner:', practitionerId);

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Get practitioner info
    const practitionerResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/practitioners?id=eq.${practitionerId}&select=name,phone,user_id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!practitionerResponse.ok) {
      throw new Error('Failed to fetch practitioner');
    }

    const practitioners = await practitionerResponse.json();
    if (!practitioners || practitioners.length === 0) {
      throw new Error('Practitioner not found');
    }

    const practitioner = practitioners[0];

    // Get user email from profile
    const profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${practitioner.user_id}&select=id`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    // Get email from auth.users via admin API
    const authResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${practitioner.user_id}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!authResponse.ok) {
      throw new Error('Failed to fetch user auth info');
    }

    const authUser = await authResponse.json();
    const email = authUser.email;

    console.log('Practitioner info:', { name: practitioner.name, email, phone: practitioner.phone });

    // Prepare notification content
    const emailSubject = 'Votre compte praticien est activé ! - DomiCares';
    const emailContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0EA5E9;">Félicitations ${practitioner.name} !</h2>
            <p style="font-size: 18px; color: #10B981; font-weight: bold;">
              ✅ Votre compte praticien a été validé avec succès !
            </p>
            <p>Nous sommes heureux de vous accueillir dans la communauté DomiCares.</p>
            
            <div style="background-color: #F0F9FF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0EA5E9;">
              <h3 style="margin-top: 0; color: #0EA5E9;">Vous pouvez maintenant :</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Recevoir des demandes de consultation</li>
                <li>Gérer vos disponibilités</li>
                <li>Communiquer avec vos patients</li>
                <li>Suivre vos rendez-vous en temps réel</li>
                <li>Gérer vos paiements et revenus</li>
              </ul>
            </div>

            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;">
                <strong>💡 Conseil :</strong> Configurez vos disponibilités dès maintenant pour commencer à recevoir des demandes !
              </p>
            </div>

            <p style="margin-top: 30px;">
              <a href="${Deno.env.get('SITE_URL') || 'https://domicares.life'}/practitioner-dashboard" 
                 style="background-color: #0EA5E9; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Accéder à mon tableau de bord
              </a>
            </p>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
              <p style="color: #6B7280; font-size: 14px; margin: 0;">
                Bienvenue dans l'équipe DomiCares ! 🎉
              </p>
              <p style="color: #6B7280; font-size: 14px;">
                Pour toute question, contactez-nous à <a href="mailto:support@domicares.life" style="color: #0EA5E9;">support@domicares.life</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const smsContent = `Félicitations ${practitioner.name} ! Votre compte praticien DomiCares est activé. Connectez-vous pour commencer à recevoir des consultations. ${Deno.env.get('SITE_URL') || 'https://domicares.life'}`;

    const notifications = {
      email: false,
      sms: false,
    };

    // Send email via SendGrid
    try {
      const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email }],
              subject: emailSubject,
            }
          ],
          from: {
            email: 'noreply@domicares.life',
            name: 'DomiCares'
          },
          content: [
            {
              type: 'text/html',
              value: emailContent
            }
          ]
        })
      });

      if (emailResponse.ok) {
        console.log('Activation email sent successfully');
        notifications.email = true;
      } else {
        const errorText = await emailResponse.text();
        console.error('SendGrid error:', emailResponse.status, errorText);
      }
    } catch (emailError) {
      console.error('Error sending activation email:', emailError);
    }

    // Send SMS via Twilio if credentials are configured
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER && practitioner.phone) {
      try {
        const formattedPhone = practitioner.phone.startsWith('+') ? practitioner.phone : `+${practitioner.phone}`;

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
          console.log('Activation SMS sent successfully');
          notifications.sms = true;
        } else {
          const errorText = await smsResponse.text();
          console.error('Twilio error:', smsResponse.status, errorText);
        }
      } catch (smsError) {
        console.error('Error sending activation SMS:', smsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications,
        message: 'Account activation notification sent'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-account-activation:', error);
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

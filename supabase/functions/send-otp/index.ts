import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EPIC 1: Envoi de codes OTP via Twilio
 * Envoie un code de vérification par SMS à un numéro de téléphone
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      throw new Error('Twilio credentials not configured');
    }

    const { phoneNumber, channel = 'sms' } = await req.json();

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone number format (E.164)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use E.164 format (e.g., +22890123456)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending OTP to:', phoneNumber, 'via', channel);

    // Send verification code via Twilio Verify API
    const verifyUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`;
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Channel: channel,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Twilio error:', errorData);
      throw new Error(`Twilio API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        status: data.status,
        channel: data.channel,
        to: data.to,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-otp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

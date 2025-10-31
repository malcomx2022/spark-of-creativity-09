import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EPIC 1: Vérification des codes OTP via Twilio
 * Vérifie qu'un code OTP est correct pour un numéro de téléphone
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

    const { phoneNumber, code } = await req.json();

    if (!phoneNumber || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone number and code are required' }),
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

    // Validate code format (6 digits)
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(code)) {
      return new Response(
        JSON.stringify({ error: 'Invalid code format. Must be 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verifying OTP for:', phoneNumber);

    // Verify code via Twilio Verify API
    const verifyUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        Code: code,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Twilio verification error:', errorData);
      throw new Error(`Twilio API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    if (data.status === 'approved') {
      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          status: data.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          status: data.status,
          error: 'Invalid or expired code',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in verify-otp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

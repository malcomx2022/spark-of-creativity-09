import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-csrf-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Normalise un numéro de téléphone au format E.164
 */
function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return normalized;
}

/**
 * Valide le format d'un numéro de téléphone E.164
 */
function validatePhoneNumber(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * EPIC 1: Envoi de codes OTP via Twilio Verify
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      console.error('Twilio credentials missing');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Service de SMS non configuré. Contactez le support.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phoneNumber, channel = 'sms' } = await req.json();

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Numéro de téléphone requis' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate channel
    const validChannels = ['sms', 'whatsapp', 'call'];
    if (!validChannels.includes(channel)) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Canal invalide. Utilisez: ${validChannels.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Validate phone number format (E.164)
    if (!validatePhoneNumber(normalizedPhone)) {
      await supabase.from('otp_attempts').insert({
        phone_number: phoneNumber,
        channel,
        status: 'failed',
        error_message: 'Format de numéro invalide',
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Format de numéro invalide. Utilisez le format international (ex: +22890123456)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limiting
    const { data: rateLimitCheck, error: rateLimitError } = await supabase.rpc('check_otp_rate_limit', {
      phone: normalizedPhone
    });

    if (rateLimitError) {
      console.error('Error checking rate limit:', rateLimitError);
    } else if (rateLimitCheck && !rateLimitCheck.allowed) {
      await supabase.from('otp_attempts').insert({
        phone_number: normalizedPhone,
        channel,
        status: 'failed',
        error_message: rateLimitCheck.reason === 'blocked' 
          ? 'Compte temporairement bloqué' 
          : 'Limite de tentatives atteinte',
      });

      const message = rateLimitCheck.reason === 'blocked'
        ? `Compte temporairement bloqué. Réessayez dans ${Math.ceil(rateLimitCheck.retry_after / 60)} minutes.`
        : 'Trop de tentatives. Veuillez réessayer plus tard.';

      return new Response(
        JSON.stringify({ 
          success: false,
          error: message,
          retry_after: rateLimitCheck.retry_after
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending OTP to:', normalizedPhone, 'via', channel);

    // Send verification code via Twilio Verify API
    const verifyUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`;
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: normalizedPhone,
        Channel: channel,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Twilio error response:', JSON.stringify(responseData, null, 2));
      
      const errorMessage = responseData.message || `Erreur Twilio: ${response.status}`;
      
      await supabase.from('otp_attempts').insert({
        phone_number: normalizedPhone,
        channel,
        status: 'failed',
        error_message: `${errorMessage} - Code: ${responseData.code || 'unknown'}`,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMessage,
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log successful attempt
    await supabase.from('otp_attempts').insert({
      phone_number: normalizedPhone,
      channel,
      status: responseData.status || 'sent',
      twilio_sid: responseData.sid,
    });

    console.log('OTP sent successfully:', responseData.sid);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Code envoyé avec succès',
        status: responseData.status,
        channel: responseData.channel,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-otp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    try {
      await supabase.from('otp_attempts').insert({
        phone_number: 'unknown',
        channel: 'sms',
        status: 'error',
        error_message: errorMessage,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

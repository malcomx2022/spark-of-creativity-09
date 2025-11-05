import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Normalise un numéro de téléphone au format E.164
 * Ajoute le + si manquant et valide le format international
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Add + prefix if missing
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  
  return normalized;
}

/**
 * Valide le format d'un numéro de téléphone E.164
 * Format: +[country code][subscriber number]
 * Exemple: +22890123456 (Bénin)
 */
function validatePhoneNumber(phone: string): boolean {
  // E.164 format: + followed by 1-3 digits country code and 4-15 total digits
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * EPIC 1: Envoi de codes OTP via Twilio Verify
 * 
 * Fonctionnalités:
 * - Normalisation et validation du numéro de téléphone
 * - Envoi d'OTP via SMS, WhatsApp ou appel vocal
 * - Traçabilité des tentatives dans otp_attempts
 * - Gestion d'erreurs complète avec messages clairs
 */
serve(async (req) => {
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
      throw new Error('Twilio credentials not configured');
    }

    const { phoneNumber, channel = 'sms' } = await req.json();

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Phone number is required' 
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
          error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` 
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
        error_message: 'Invalid phone number format',
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid phone number format. Use international format (e.g., +22890123456 or 22890123456)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limiting: max 5 attempts per hour per phone number
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentAttempts, error: attemptsError } = await supabase
      .from('otp_attempts')
      .select('id')
      .eq('phone_number', normalizedPhone)
      .gte('created_at', oneHourAgo);

    if (attemptsError) {
      console.error('Error checking OTP attempts:', attemptsError);
    } else if (recentAttempts && recentAttempts.length >= 5) {
      await supabase.from('otp_attempts').insert({
        phone_number: normalizedPhone,
        channel,
        status: 'failed',
        error_message: 'Rate limit exceeded',
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Trop de tentatives. Veuillez réessayer dans 1 heure.' 
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
      console.error('Twilio error:', responseData);
      
      // Extract error message from Twilio response
      const errorMessage = responseData.message || `Twilio API error: ${response.status}`;
      
      // Log failed attempt
      await supabase.from('otp_attempts').insert({
        phone_number: normalizedPhone,
        channel,
        status: 'failed',
        error_message: errorMessage,
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMessage,
          details: responseData
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
        message: 'OTP sent successfully',
        status: responseData.status,
        channel: responseData.channel,
        to: responseData.to,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-otp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log unexpected error
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

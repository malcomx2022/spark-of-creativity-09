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
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Normalise un numéro de téléphone pour créer un email temporaire
 * +22890123456 -> 22890123456@temp.sparkofcreativity.app
 */
function generateTempEmail(phoneNumber: string): string {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  return `${cleanPhone}@temp.sparkofcreativity.app`;
}

/**
 * EPIC 1: Vérification des codes OTP via Twilio avec authentification automatique
 * 
 * Fonctionnalités:
 * - Vérifie le code OTP avec Twilio Verify
 * - Crée automatiquement un utilisateur Supabase si nouveau
 * - Génère une session de connexion
 * - Enregistre les tentatives dans admin_audit_logs
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      throw new Error('Twilio credentials not configured');
    }

    const { phoneNumber: rawPhoneNumber, code } = await req.json();

    if (!rawPhoneNumber || !code) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Phone number and code are required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(rawPhoneNumber);

    // Validate phone number format (E.164)
    if (!validatePhoneNumber(normalizedPhone)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid phone number format. Use international format (e.g., +22890123456 or 22890123456)'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate code format (exactly 6 digits)
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(code)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid code format. Must be exactly 6 digits' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verifying OTP for:', normalizedPhone);

    // Verify code via Twilio Verify API
    const verifyUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
    
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: normalizedPhone,
        Code: code,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Twilio verification error:', responseData);
      
      // Log failed verification attempt
      await supabase.from('admin_audit_logs').insert({
        admin_id: '00000000-0000-0000-0000-000000000000',
        action: 'otp_verification_failed',
        entity_type: 'auth',
        entity_id: normalizedPhone,
        details: {
          phone: normalizedPhone,
          error: responseData.message,
        },
      });

      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid or expired OTP',
          details: responseData.message
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if OTP was approved
    if (responseData.status !== 'approved') {
      // Log invalid OTP attempt
      await supabase.from('admin_audit_logs').insert({
        admin_id: '00000000-0000-0000-0000-000000000000',
        action: 'otp_verification_rejected',
        entity_type: 'auth',
        entity_id: normalizedPhone,
        details: {
          phone: normalizedPhone,
          status: responseData.status,
        },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid or expired OTP',
          status: responseData.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('OTP verified successfully, checking for existing user...');

    // Generate temporary email from phone number
    const tempEmail = generateTempEmail(normalizedPhone);

    // Check if user exists with this phone number
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    let user;
    let session;
    let isNewUser = false;

    if (existingProfile) {
      console.log('Existing user found:', existingProfile.id);

      // Generate a temporary password for session creation
      const tempPassword = crypto.randomUUID();
      
      // Update user with temporary password
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        existingProfile.id,
        { password: tempPassword }
      );

      if (updateError) {
        console.error('Error updating user password:', updateError);
        throw updateError;
      }

      user = updatedUser.user;

      // Create a non-admin client to sign in
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const clientSupabase = createClient(supabaseUrl, anonKey);

      // Sign in with temporary password to get session
      const { data: signInData, error: signInError } = await clientSupabase.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword,
      });

      if (signInError) {
        console.error('Error signing in:', signInError);
        throw signInError;
      }

      session = signInData.session;

    } else {
      console.log('New user, creating account...');
      isNewUser = true;

      // Generate a temporary password for the new user
      const tempPassword = crypto.randomUUID();

      // Create new user with temporary email and password
      const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
        email: tempEmail,
        password: tempPassword,
        email_confirm: true,
        phone: normalizedPhone,
        phone_confirm: true,
        user_metadata: {
          phone: normalizedPhone,
          phone_verified: true,
        },
      });

      if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
      }

      user = newUserData.user;

      // Create profile
      const { error: profileInsertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          phone: normalizedPhone,
          full_name: normalizedPhone, // Default to phone number
        });

      if (profileInsertError) {
        console.error('Error creating profile:', profileInsertError);
        // Continue anyway as the user was created in auth
      }

      // Create a non-admin client to sign in
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const clientSupabase = createClient(supabaseUrl, anonKey);

      // Sign in with email/password to get session
      const { data: signInData, error: signInError } = await clientSupabase.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword,
      });

      if (signInError) {
        console.error('Error signing in new user:', signInError);
        throw signInError;
      }

      session = signInData.session;
    }

    // Log successful verification and authentication
    await supabase.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: isNewUser ? 'otp_signup_success' : 'otp_login_success',
      entity_type: 'auth',
      entity_id: user.id,
      details: {
        phone: normalizedPhone,
        is_new_user: isNewUser,
      },
    });

    console.log('Authentication successful for user:', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        is_new_user: isNewUser,
        session: {
          access_token: session?.access_token,
          refresh_token: session?.refresh_token,
          expires_at: session?.expires_at,
          expires_in: session?.expires_in,
        },
        user: {
          id: user.id,
          phone: normalizedPhone,
          email: user.email,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-otp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_id: '00000000-0000-0000-0000-000000000000',
        action: 'otp_verification_error',
        entity_type: 'auth',
        entity_id: 'unknown',
        details: {
          error: errorMessage,
        },
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

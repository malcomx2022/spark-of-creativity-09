import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EPIC 7: Génération d'URLs signées pour accès temporaire aux fichiers Wasabi
 * Génère une URL signée valide pour 1 heure permettant l'accès à un fichier privé
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const wasabiAccessKeyId = Deno.env.get('WASABI_ACCESS_KEY_ID');
    const wasabiSecretAccessKey = Deno.env.get('WASABI_SECRET_ACCESS_KEY');
    const wasabiBucketName = Deno.env.get('WASABI_BUCKET_NAME');
    const wasabiRegion = Deno.env.get('WASABI_REGION');
    const wasabiEndpoint = Deno.env.get('WASABI_ENDPOINT');

    if (!wasabiAccessKeyId || !wasabiSecretAccessKey || !wasabiBucketName || !wasabiRegion || !wasabiEndpoint) {
      throw new Error('Wasabi credentials not configured');
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { filePath, expiresIn = 3600 } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'filePath is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin (only specific admin roles)
    const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst'];
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ADMIN_ROLES);

    const isAdmin = !roleError && roleData && roleData.length > 0;
    
    console.log('User access check:', {
      userId: user.id,
      filePath,
      isAdmin,
      roleDataCount: roleData?.length || 0
    });

    // Verify user has access to this file
    // 1. Admins can access all files
    // 2. Users can access files in paths containing their user ID
    // 3. Practitioners can access their KYC documents
    let hasAccess = isAdmin || filePath.includes(user.id);
    
    if (!hasAccess) {
      // Check if user is a practitioner and the file is one of their documents
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('id_document_url, license_document_url, insurance_document_url')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (practitioner) {
        const practitionerDocs = [
          practitioner.id_document_url,
          practitioner.license_document_url,
          practitioner.insurance_document_url
        ].filter(Boolean);
        
        hasAccess = practitionerDocs.some(doc => doc === filePath);
        console.log('Practitioner document check:', {
          filePath,
          practitionerDocs,
          hasAccess
        });
      }
    }
    
    if (!hasAccess) {
      console.log('Access denied: User does not have permission to access this file');
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to this file' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating presigned URL for:', filePath);

    // Create AWS Signature V4 for presigned URL
    const now = new Date();
    const expirationTime = Math.floor(now.getTime() / 1000) + expiresIn;
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    // Helper function to create HMAC
    const hmac = async (key: Uint8Array, data: string): Promise<Uint8Array> => {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
      return new Uint8Array(signature);
    };

    // Create signing key
    const kDate = await hmac(new TextEncoder().encode(`AWS4${wasabiSecretAccessKey}`), dateStamp);
    const kRegion = await hmac(kDate, wasabiRegion);
    const kService = await hmac(kRegion, 's3');
    const kSigning = await hmac(kService, 'aws4_request');

    // Create canonical request for presigned URL
    const credential = `${wasabiAccessKeyId}/${dateStamp}/${wasabiRegion}/s3/aws4_request`;
    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host',
    });

    const canonicalRequest = [
      'GET',
      `/${wasabiBucketName}/${filePath}`,
      queryParams.toString(),
      `host:${wasabiEndpoint}`,
      '',
      'host',
      'UNSIGNED-PAYLOAD'
    ].join('\n');

    // Create string to sign
    const canonicalRequestHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)))
    ).map(b => b.toString(16).padStart(2, '0')).join('');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      `${dateStamp}/${wasabiRegion}/s3/aws4_request`,
      canonicalRequestHash
    ].join('\n');

    // Create signature
    const signature = Array.from(await hmac(kSigning, stringToSign))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Create presigned URL
    queryParams.append('X-Amz-Signature', signature);
    const presignedUrl = `https://${wasabiEndpoint}/${wasabiBucketName}/${filePath}?${queryParams.toString()}`;

    console.log('Presigned URL generated successfully:', {
      filePath,
      urlLength: presignedUrl.length,
      expiresIn,
      userId: user.id,
      isAdmin
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: presignedUrl,
        expiresAt: new Date(expirationTime * 1000).toISOString(),
        expiresIn,
        filePath,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-presigned-url:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

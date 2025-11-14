import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EPIC 7: Upload de fichiers vers Wasabi S3
 * Permet d'uploader des documents (reçus, factures, PDF) vers Wasabi
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

    const { fileName, fileContent, contentType, folder = 'documents' } = await req.json();

    if (!fileName || !fileContent) {
      return new Response(
        JSON.stringify({ error: 'fileName and fileContent are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode base64 file content
    const binaryContent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${folder}/${user.id}/${timestamp}-${sanitizedFileName}`;

    console.log('Uploading file to Wasabi:', filePath);

    // Create AWS Signature V4
    const now = new Date();
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

    // Create canonical request
    const canonicalRequest = [
      'PUT',
      `/${wasabiBucketName}/${filePath}`,
      '',
      `host:${wasabiEndpoint}`,
      `x-amz-content-sha256:UNSIGNED-PAYLOAD`,
      `x-amz-date:${amzDate}`,
      '',
      'host;x-amz-content-sha256;x-amz-date',
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

    // Create authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${wasabiAccessKeyId}/${dateStamp}/${wasabiRegion}/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

    // Upload to Wasabi
    const uploadUrl = `https://${wasabiEndpoint}/${wasabiBucketName}/${filePath}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authorization,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'Content-Type': contentType || 'application/octet-stream',
      },
      body: binaryContent,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Wasabi upload error:', errorText);
      throw new Error(`Wasabi upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    console.log('File uploaded successfully:', filePath);

    return new Response(
      JSON.stringify({
        success: true,
        filePath,
        url: uploadUrl,
        bucket: wasabiBucketName,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-to-wasabi:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

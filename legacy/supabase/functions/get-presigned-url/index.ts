import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Génération d'URLs signées pour accès temporaire aux fichiers Supabase Storage
 * (migré depuis Wasabi S3)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Check if user is admin
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
      }
    }
    
    if (!hasAccess) {
      console.log('Access denied: User does not have permission to access this file');
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to this file' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating signed URL for:', filePath);

    // Parse the filePath to extract bucket and storage path
    // Format: {folder}/{userId}/{timestamp}-{filename}
    // folder determines the bucket: 'avatars' -> avatars bucket, anything else -> documents bucket
    const pathParts = filePath.split('/');
    const folder = pathParts[0];
    const bucketName = folder === 'avatars' ? 'avatars' : 'documents';
    // The storage path is everything after the folder prefix
    const storagePath = pathParts.slice(1).join('/');

    // Generate a signed URL using Supabase Storage
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, expiresIn);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('Error generating signed URL:', signedUrlError);
      throw new Error(`Failed to generate signed URL: ${signedUrlError?.message || 'Unknown error'}`);
    }

    const signedUrl = signedUrlData.signedUrl;

    console.log('Signed URL generated successfully:', {
      filePath,
      urlLength: signedUrl.length,
      expiresIn,
      userId: user.id,
      isAdmin,
      bucket: bucketName
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: signedUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
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

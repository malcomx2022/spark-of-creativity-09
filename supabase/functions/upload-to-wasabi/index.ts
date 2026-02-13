import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Upload de fichiers vers Supabase Storage (migré depuis Wasabi S3)
 * Permet d'uploader des documents (reçus, factures, PDF, images) vers le stockage natif
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authenticate: accept both user tokens and service role key
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace('Bearer ', '');
    
    // Parse body first
    const { fileName, fileContent, contentType, folder = 'documents', userId: providedUserId } = await req.json();

    if (!fileName || !fileContent) {
      return new Response(
        JSON.stringify({ error: 'fileName and fileContent are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validation des types MIME autorisés
    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (contentType && !ALLOWED_MIME_TYPES.includes(contentType)) {
      return new Response(
        JSON.stringify({ error: `Type de fichier non autorisé: ${contentType}. Types acceptés: PDF, JPEG, PNG, GIF, WebP` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validation taille fichier (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const fileSizeBytes = (fileContent.length * 3) / 4; // Approximation taille base64
    if (fileSizeBytes > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `Fichier trop volumineux. Taille max: 10MB` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check if it's a service role key call (from another edge function)
    const isServiceRoleCall = token === supabaseKey;
    
    let userId: string;
    
    if (isServiceRoleCall) {
      if (!providedUserId) {
        return new Response(
          JSON.stringify({ error: 'userId is required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = providedUserId;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    // Decode base64 file content
    const binaryContent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));

    // Generate unique file path: {userId}/{timestamp}-{filename}
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${userId}/${timestamp}-${sanitizedFileName}`;

    // Determine bucket based on folder
    const bucketName = folder === 'avatars' ? 'avatars' : 'documents';

    console.log(`Uploading file to Supabase Storage bucket '${bucketName}':`, storagePath);

    // Upload to Supabase Storage using service role client (bypasses RLS)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, binaryContent, {
        contentType: contentType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Build the file path for later retrieval
    const filePath = `${folder}/${storagePath}`;

    console.log('File uploaded successfully:', filePath);

    return new Response(
      JSON.stringify({
        success: true,
        filePath,
        url: filePath, // Keep same interface - URL will be generated via get-presigned-url
        bucket: bucketName,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-to-storage:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

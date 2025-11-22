import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";

interface UploadResult {
  url: string;
  path: string;
}

interface WasabiUploadResponse {
  filePath: string;
  url: string;
}

interface PresignedUrlResponse {
  url: string;
}

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export async function uploadUserDocument({
  file,
  folder,
  userId,
}: {
  file: File;
  folder: string;
  userId: string;
}): Promise<UploadResult> {
  const content = await file.arrayBuffer();
  const fileContent = arrayBufferToBase64(content);

  const { data, error } = await invokeEdgeFunctionWithRetry<WasabiUploadResponse>("upload-to-wasabi", {
    body: {
      fileName: file.name,
      fileContent,
      contentType: file.type,
      folder,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.filePath || !data?.url) {
    throw new Error("Échec du téléchargement du document");
  }

  // Enregistrer la référence dans la table files pour audit
  const { error: logError } = await supabase.from("files").insert({
    user_id: userId,
    file_name: file.name,
    file_path: data.filePath,
    file_size: file.size,
    file_type: file.type,
    folder,
    metadata: {
      originalName: file.name,
    },
  });

  if (logError) {
    console.warn("Impossible d'enregistrer la trace du fichier", logError);
  }

  return {
    url: data.url as string,
    path: data.filePath as string,
  };
}

export async function getSignedFileUrl(filePath?: string | null): Promise<string | null> {
  if (!filePath) {
    console.warn("getSignedFileUrl called with empty filePath");
    return null;
  }

  // Already a full URL, return as is
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    console.log("File path is already a full URL:", filePath.substring(0, 50) + "...");
    return filePath;
  }

  try {
    console.log("Requesting presigned URL for:", filePath);
    
    const { data, error } = await invokeEdgeFunctionWithRetry<PresignedUrlResponse>("get-presigned-url", {
      body: {
        filePath,
        expiresIn: 3600,
      },
    });

    if (error) {
      console.error("Error getting presigned URL:", {
        filePath,
        error: error.message,
      });
      throw error;
    }

    if (!data?.url) {
      console.error("No URL returned from presigned URL function for:", filePath);
      return null;
    }

    console.log("Presigned URL generated successfully for:", filePath);
    return data.url;
  } catch (error) {
    console.error("Failed to get signed file URL:", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function getFileExtension(filePath: string): string {
  // Extract extension from path, handling URLs with query parameters
  const pathWithoutQuery = filePath.split('?')[0];
  const extension = pathWithoutQuery.split('.').pop()?.toLowerCase() || '';
  return extension;
}

export function isImageFile(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension);
}

export function isPdfFile(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return extension === 'pdf';
}

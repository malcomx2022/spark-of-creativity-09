import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";

interface UploadResult {
  url: string;
  path: string;
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

  const { data, error } = await invokeEdgeFunctionWithRetry("upload-to-wasabi", {
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
    return null;
  }

  if (filePath.startsWith("http")) {
    return filePath;
  }

  const { data, error } = await invokeEdgeFunctionWithRetry("get-presigned-url", {
    body: {
      filePath,
      expiresIn: 3600,
    },
  });

  if (error) {
    throw error;
  }

  return data?.url ?? null;
}

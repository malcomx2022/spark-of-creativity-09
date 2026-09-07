import { uploadFile, getSignedFileUrl as getSignedUrl, type StorageFolder } from '@/lib/api';

interface UploadResult {
  url: string;
  path: string;
}

/**
 * Téléverse un document de l'utilisateur (ex Edge Function upload-to-wasabi + table files) :
 * URL pré-signée PUT vers S3 puis enregistrement dans `files` via l'API.
 */
export async function uploadUserDocument({
  file,
  folder,
  userId,
}: {
  file: File;
  folder: string;
  userId: string;
}): Promise<UploadResult> {
  void userId; // l'API déduit le propriétaire du jeton
  const allowed: StorageFolder[] = ['documents', 'avatars', 'message-attachments'];
  const target = (allowed.includes(folder as StorageFolder) ? folder : 'documents') as StorageFolder;
  const result = await uploadFile(file, { folder: target, metadata: { originalName: file.name, requestedFolder: folder } });
  return { url: result.url, path: result.path };
}

export async function getSignedFileUrl(filePath?: string | null): Promise<string | null> {
  if (!filePath) {
    console.warn("getSignedFileUrl called with empty filePath");
    return null;
  }

  try {
    return await getSignedUrl(filePath, 3600);
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

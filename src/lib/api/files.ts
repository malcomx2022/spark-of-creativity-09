/**
 * Fichiers (ex Edge Functions upload-to-wasabi / get-presigned-url et table `files`).
 * Flux navigateur → S3 : `POST /api/files/upload-url` (URL pré-signée PUT) puis `POST /api/files`.
 */
import { api, ApiError } from './client';

export type StorageFolder = 'documents' | 'avatars' | 'message-attachments';

export interface UploadResult {
  url: string;
  path: string;
}

interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  filePath: string;
  bucket: string;
}

export const UPLOAD_TIMEOUT_MS = 90_000;

export async function uploadFile(file: File | Blob, options: { folder: StorageFolder; fileName?: string; metadata?: Record<string, unknown> }): Promise<UploadResult> {
  const fileName = options.fileName ?? (file instanceof File ? file.name : `fichier-${Date.now()}`);
  const contentType = file.type || 'application/octet-stream';
  const presigned = await api.post<PresignedUpload>('/files/upload-url', { fileName, contentType, fileSize: file.size, folder: options.folder });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const put = await fetch(presigned.url, { method: presigned.method, headers: presigned.headers, body: file, signal: controller.signal });
    if (!put.ok) throw new ApiError(put.status, `Échec du téléversement vers le stockage (${put.status})`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Le téléversement a échoué ou a pris trop de temps. Vérifiez votre connexion internet.');
  } finally {
    clearTimeout(timer);
  }
  await api.post('/files', { filePath: presigned.filePath, fileName, fileSize: file.size, fileType: contentType, metadata: { originalName: fileName, ...options.metadata } });
  return { url: presigned.filePath, path: presigned.filePath };
}

/** Flux hérité (contenu base64 via l'API), utilisé quand le navigateur ne peut pas joindre S3 directement. */
export async function uploadFileBase64(file: File, folder: StorageFolder): Promise<UploadResult> {
  const fileContent = await fileToBase64(file);
  const res = await api.post<{ success: boolean; filePath: string; url: string }>('/files/upload', { fileName: file.name, fileContent, contentType: file.type, folder }, { timeoutMs: UPLOAD_TIMEOUT_MS });
  return { url: res.url, path: res.filePath };
}

/** URL de téléchargement pré-signée (journalisée côté API). */
export async function getSignedFileUrl(filePath?: string | null, expiresIn = 3600): Promise<string | null> {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  const res = await api.get<{ url: string }>('/files/url', { query: { filePath, expiresIn } });
  return res.url ?? null;
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

/** data-URL complète (`data:<type>;base64,…`), format attendu par `POST /api/practitioners/register`. */
export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

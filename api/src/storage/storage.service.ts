import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { STORAGE_PROVIDER, StorageFolder, StorageProvider } from './storage.provider';

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo (upload-to-wasabi)
export const MAX_KYC_DOCUMENT_SIZE = 5 * 1024 * 1024; // 5 Mo (create-practitioner-account)

/**
 * Chemins de fichiers : `<dossier>/<userId>/<timestamp>-<nom>` — identiques à ceux produits
 * par upload-to-wasabi, donc les valeurs déjà stockées en base (practitioners.*_url,
 * files.file_path) restent résolubles après migration.
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  bucketFor(folder: StorageFolder): string {
    switch (folder) {
      case 'avatars':
        return this.config.S3_BUCKET_AVATARS;
      case 'message-attachments':
        return this.config.S3_BUCKET_ATTACHMENTS;
      default:
        return this.config.S3_BUCKET_DOCUMENTS;
    }
  }

  buildKey(userId: string, fileName: string): string {
    const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${userId}/${Date.now()}-${sanitized}`;
  }

  /** `documents/<userId>/…` → { bucket, key }. Tolère les anciens chemins `practitioner-documents/…`. */
  resolve(filePath: string): { folder: StorageFolder; bucket: string; key: string } {
    const [first, ...rest] = filePath.split('/');
    const folder: StorageFolder = first === 'avatars' ? 'avatars' : first === 'message-attachments' ? 'message-attachments' : 'documents';
    const key = first === 'documents' || first === 'avatars' || first === 'message-attachments' || first === 'practitioner-documents' ? rest.join('/') : filePath;
    if (!key) throw new BadRequestException('Chemin de fichier invalide');
    return { folder, bucket: this.bucketFor(folder), key };
  }

  assertAllowedType(contentType: string): void {
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new BadRequestException(`Type de fichier non autorisé : ${contentType}. Types acceptés : PDF, JPEG, PNG, GIF, WebP`);
    }
  }

  presignUpload(folder: StorageFolder, key: string, contentType: string, expiresIn = 900) {
    return this.provider.presignUpload(this.bucketFor(folder), key, contentType, expiresIn);
  }

  presignDownload(filePath: string, expiresIn = this.config.FILE_URL_TTL_SECONDS): Promise<string> {
    const { bucket, key } = this.resolve(filePath);
    return this.provider.presignDownload(bucket, key, expiresIn);
  }

  putObject(folder: StorageFolder, key: string, body: Buffer, contentType: string): Promise<void> {
    return this.provider.putObject(this.bucketFor(folder), key, body, contentType);
  }

  deleteByPath(filePath: string): Promise<void> {
    const { bucket, key } = this.resolve(filePath);
    return this.provider.deleteObject(bucket, key);
  }
}

/** Décode une data-URL base64 (`data:<mime>;base64,<contenu>`) avec vérification des magic bytes. */
export function decodeDataUrl(dataUrl: string, label: string, maxSize = MAX_FILE_SIZE): { contentType: string; body: Buffer } {
  const m = dataUrl.match(/^data:([A-Za-z-+/.]+);base64,(.+)$/s);
  if (!m) throw new BadRequestException(`${label} : format base64 invalide`);
  const contentType = m[1].toLowerCase();
  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (!allowed.includes(contentType)) throw new BadRequestException(`${label} : type non supporté (PDF, JPG, PNG uniquement)`);
  const body = Buffer.from(m[2], 'base64');
  if (body.length > maxSize) throw new BadRequestException(`${label} : fichier trop volumineux (max ${Math.round(maxSize / 1024 / 1024)} Mo)`);
  const magic = body.subarray(0, 4).toString('hex');
  const valid =
    (contentType === 'application/pdf' && body.subarray(0, 4).toString('latin1') === '%PDF') ||
    ((contentType === 'image/jpeg' || contentType === 'image/jpg') && magic.startsWith('ffd8ff')) ||
    (contentType === 'image/png' && magic === '89504e47');
  if (!valid) throw new BadRequestException(`${label} : le contenu ne correspond pas au type ${contentType}`);
  return { contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType, body };
}

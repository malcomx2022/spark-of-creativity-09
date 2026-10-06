import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APP_CONFIG, AppConfig } from '../config/config.module';

export type StorageFolder = 'documents' | 'avatars' | 'message-attachments';

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StorageProvider {
  /** URL pré-signée PUT : le navigateur envoie directement l'objet au stockage. */
  presignUpload(bucket: string, key: string, contentType: string, expiresIn: number, fileSize: number): Promise<PresignedUpload>;
  /** URL pré-signée GET (remplace supabase.storage.createSignedUrl). */
  presignDownload(bucket: string, key: string, expiresIn: number): Promise<string>;
  /** Écriture côté serveur (inscription praticien : documents envoyés en base64). */
  putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
  readObject(bucket: string, key: string, maxSize: number): Promise<{ body: Buffer; contentType: string }>;
  cleanupPending(bucket: string, before: Date): Promise<number>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: config.S3_ACCESS_KEY ?? '', secretAccessKey: config.S3_SECRET_KEY ?? '' },
    });
  }

  async presignUpload(bucket: string, key: string, contentType: string, expiresIn: number, fileSize: number): Promise<PresignedUpload> {
    // Le navigateur fixe Content-Length à partir du Blob : la taille fait partie de la signature.
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: fileSize }), { expiresIn, signableHeaders: new Set(['content-length']) });
    return { url, method: 'PUT', headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  presignDownload(bucket: string, key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async readObject(bucket: string, key: string, maxSize: number): Promise<{ body: Buffer; contentType: string }> {
    const params = { Bucket: bucket, Key: key };
    const head = await this.client.send(new HeadObjectCommand(params));
    if (head.ContentLength === undefined || head.ContentLength > maxSize) throw new Error('Fichier trop volumineux');
    const controller = new AbortController();
    const obj = await this.client.send(new GetObjectCommand(params), { abortSignal: controller.signal });
    if (!obj.Body) throw new Error('Fichier vide');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > maxSize) throw new Error('Fichier trop volumineux');
        chunks.push(Buffer.from(chunk));
      }
      return { body: Buffer.concat(chunks), contentType: obj.ContentType ?? '' };
    } finally { controller.abort(); }
  }

  async cleanupPending(bucket: string, before: Date): Promise<number> {
    let token: string | undefined;
    let deleted = 0;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: '_pending/', ContinuationToken: token }));
      for (const obj of page.Contents ?? []) {
        if (obj.Key && obj.LastModified && obj.LastModified < before) {
          await this.deleteObject(bucket, obj.Key);
          deleted++;
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }
}

/** Stockage en mémoire pour dev/test (interdit en production par loadConfig). */
@Injectable()
export class FakeStorageProvider implements StorageProvider {
  private readonly logger = new Logger(FakeStorageProvider.name);
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async presignUpload(bucket: string, key: string, contentType: string, expiresIn: number): Promise<PresignedUpload> {
    return { url: `https://storage.fake/${bucket}/${key}?upload=1&exp=${expiresIn}`, method: 'PUT', headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async presignDownload(bucket: string, key: string, expiresIn: number): Promise<string> {
    return `https://storage.fake/${bucket}/${key}?sig=fake&exp=${expiresIn}`;
  }

  async putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(`${bucket}/${key}`, { body, contentType });
    this.logger.debug(`[storage:fake] put ${bucket}/${key} (${body.length} octets)`);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    this.objects.delete(`${bucket}/${key}`);
  }

  async readObject(bucket: string, key: string, maxSize: number): Promise<{ body: Buffer; contentType: string }> {
    const obj = this.objects.get(`${bucket}/${key}`);
    if (!obj) throw new Error('Fichier absent');
    if (obj.body.length > maxSize) throw new Error('Fichier trop volumineux');
    return { ...obj, body: Buffer.from(obj.body) };
  }

  async cleanupPending(): Promise<number> { return 0; }
}

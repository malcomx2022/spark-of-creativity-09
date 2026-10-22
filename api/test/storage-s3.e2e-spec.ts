import { randomUUID } from 'node:crypto';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { loadConfig } from '../src/config/config.schema';
import { S3StorageProvider } from '../src/storage/storage.provider';
import { StorageService } from '../src/storage/storage.service';

// Essai réel sur un MinIO isolé : aucune connexion aux buckets de production.
// En CI, S3_TEST_REQUIRED=1 transforme l'absence de serveur en échec au lieu d'un saut silencieux.
if (process.env.S3_TEST_REQUIRED === '1' && !process.env.S3_TEST_ENDPOINT) throw new Error('S3_TEST_REQUIRED=1 sans S3_TEST_ENDPOINT : la suite S3 ne peut pas être ignorée');
const integration = process.env.S3_TEST_ENDPOINT ? describe : describe.skip;
integration('S3 signed uploads (real isolated storage)', () => {
  const bucket = `security-test-${randomUUID()}`;
  const config = loadConfig({
    DATABASE_URL: 'postgresql://unused:unused@localhost/unused',
    JWT_ACCESS_SECRET: 'unused-test-secret-unused-test-secret-123456', NODE_ENV: 'test',
    STORAGE_PROVIDER: 's3', S3_ENDPOINT: process.env.S3_TEST_ENDPOINT,
    S3_ACCESS_KEY: process.env.S3_TEST_ACCESS_KEY ?? 'review',
    S3_SECRET_KEY: process.env.S3_TEST_SECRET_KEY ?? 'review-local-password',
    S3_BUCKET_DOCUMENTS: bucket,
  });
  const provider = new S3StorageProvider(config);
  const storage = new StorageService(provider, config);
  const client = new S3Client({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: config.S3_ACCESS_KEY!, secretAccessKey: config.S3_SECRET_KEY! } });
  const body = Buffer.from('%PDF-1.4\nintegration');

  beforeAll(async () => { await client.send(new CreateBucketCommand({ Bucket: bucket })); });
  afterAll(async () => {
    const list = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (list.Contents?.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) } }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    client.destroy();
  });

  it('signs Content-Length and refuses a larger object before upload', async () => {
    const upload = await storage.presignUpload('documents', 'user/size.pdf', 'application/pdf', body.length);
    expect(new URL(upload.url).searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    const oversized = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: Buffer.concat([body, Buffer.alloc(100)]) });
    expect(oversized.ok).toBe(false);
    const valid = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
    expect(valid.status).toBe(200);
    expect((await storage.validatePending('documents', 'user/size.pdf')).body).toEqual(body);
  });

  it('publishes validated bytes without exposing later pending overwrites', async () => {
    const key = 'user/stable.pdf';
    const upload = await storage.presignUpload('documents', key, 'application/pdf', body.length);
    expect((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body })).ok).toBe(true);
    const validated = await storage.validatePending('documents', key);
    await storage.putObject('documents', key, validated.body, validated.contentType);
    await provider.putObject(bucket, `_pending/${key}`, Buffer.from('%PDF-replaced'), 'application/pdf');
    expect((await provider.readObject(bucket, key, 1024)).body).toEqual(body);
  });

  it('rejects a forged MIME type and removes the pending object', async () => {
    await provider.putObject(bucket, '_pending/user/forged.pdf', Buffer.from('not a PDF'), 'application/pdf');
    await expect(storage.validatePending('documents', 'user/forged.pdf')).rejects.toThrow('contenu invalide');
    await expect(provider.readObject(bucket, '_pending/user/forged.pdf', 1024)).rejects.toThrow();
  });

  it('cleans expired quarantine objects without deleting published files', async () => {
    expect(await provider.cleanupPending(bucket, new Date(Date.now() + 1000))).toBeGreaterThan(0);
    expect((await provider.readObject(bucket, 'user/stable.pdf', 1024)).body).toEqual(body);
  });
});

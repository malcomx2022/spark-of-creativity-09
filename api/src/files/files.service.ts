import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { FileRow } from '../database/types';
import { MAX_FILE_SIZE, StorageService } from '../storage/storage.service';
import type { FileUrlQuery, RegisterFileDto, UploadBase64Dto, UploadUrlDto } from './files.dto';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Remplace upload-to-wasabi, get-presigned-url et l'accès direct à la table files. */
@Injectable()
export class FilesService {
  constructor(private readonly database: DatabaseService, private readonly storage: StorageService) {}

  async createUploadUrl(userId: string, dto: UploadUrlDto) {
    this.storage.assertAllowedType(dto.contentType);
    if (dto.fileSize > MAX_FILE_SIZE) throw new BadRequestException('Fichier trop volumineux. Taille max : 10 Mo');
    const key = this.storage.buildKey(userId, dto.fileName);
    const upload = await this.storage.presignUpload(dto.folder, key, dto.contentType);
    return { ...upload, filePath: `${dto.folder}/${key}`, bucket: this.storage.bucketFor(dto.folder) };
  }

  async register(userId: string, dto: RegisterFileDto): Promise<FileRow> {
    const { folder, key } = this.storage.resolve(dto.filePath);
    if (!key.startsWith(`${userId}/`)) throw new ForbiddenException('Ce chemin ne vous appartient pas');
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx
        .insertInto('files')
        .values({
          user_id: userId,
          file_name: dto.fileName,
          file_path: dto.filePath,
          file_size: dto.fileSize,
          file_type: dto.fileType ?? null,
          storage_provider: 's3',
          folder,
          metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
        })
        .onConflict((oc) => oc.column('file_path').doUpdateSet({ file_name: dto.fileName, file_size: dto.fileSize, file_type: dto.fileType ?? null, updated_at: new Date() }))
        .returningAll()
        .executeTakeFirstOrThrow(),
    );
  }

  /** Contrat identique à upload-to-wasabi : { success, filePath, url, bucket }. */
  async uploadBase64(userId: string, dto: UploadBase64Dto) {
    const contentType = dto.contentType ?? 'application/octet-stream';
    this.storage.assertAllowedType(contentType);
    const body = Buffer.from(dto.fileContent.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (body.length > MAX_FILE_SIZE) throw new BadRequestException('Fichier trop volumineux. Taille max : 10 Mo');
    const key = this.storage.buildKey(userId, dto.fileName);
    await this.storage.putObject(dto.folder, key, body, contentType);
    const filePath = `${dto.folder}/${key}`;
    await this.register(userId, { filePath, fileName: dto.fileName, fileSize: body.length, fileType: contentType });
    return { success: true, filePath, url: filePath, bucket: this.storage.bucketFor(dto.folder) };
  }

  listOwn(userId: string): Promise<FileRow[]> {
    return this.database.runAs({ role: 'authenticated', userId }, (trx) =>
      trx.selectFrom('files').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute(),
    );
  }

  /**
   * Règle d'accès de get-presigned-url : administrateur, ou chemin contenant son propre id,
   * ou document KYC référencé par son propre enregistrement praticien.
   */
  async signedUrl(userId: string, query: FileUrlQuery, meta: RequestMeta) {
    const filePath = query.filePath;
    if (/^https?:\/\//.test(filePath)) return { success: true, url: filePath, filePath, expiresIn: 0, expiresAt: null };
    const allowed = await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      if (filePath.includes(userId)) return true;
      const admin = await trx.selectFrom('user_roles').select('id').where('user_id', '=', userId).executeTakeFirst();
      if (admin) return true;
      const p = await trx
        .selectFrom('practitioners')
        .select(['id_document_url', 'license_document_url', 'insurance_document_url', 'image'])
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (p && [p.id_document_url, p.license_document_url, p.insurance_document_url, p.image].includes(filePath)) return true;
      // Pièce jointe de messagerie : le destinataire (patient ou praticien du rendez-vous) y a accès.
      const msg = await trx.selectFrom('messages').select('appointment_id').where('attachment_url', '=', filePath).executeTakeFirst();
      if (!msg) return false;
      const a = await trx.selectFrom('appointments').select(['patient_id', 'practitioner_id']).where('id', '=', msg.appointment_id).executeTakeFirst();
      if (!a) return false;
      if (a.patient_id === userId) return true;
      const pr = await trx.selectFrom('practitioners').select('user_id').where('id', '=', a.practitioner_id).executeTakeFirst();
      return pr?.user_id === userId;
    });
    if (!allowed) throw new ForbiddenException('Accès non autorisé à ce fichier');

    const expiresIn = query.expiresIn ?? undefined;
    const url = await this.storage.presignDownload(filePath, expiresIn);
    const ttl = expiresIn ?? 3600;
    await this.database.runAs({ role: 'service_role', userId }, async (trx) => {
      const file = await trx.selectFrom('files').select('id').where('file_path', '=', filePath).executeTakeFirst();
      await trx
        .insertInto('file_access_logs')
        .values({ file_id: file?.id ?? null, user_id: userId, access_type: 'download' /* valeurs autorisées : view | download | share */, ip_address: meta.ip ?? null, user_agent: meta.userAgent ?? null })
        .execute();
    });
    return { success: true, url, filePath, expiresIn: ttl, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }
}

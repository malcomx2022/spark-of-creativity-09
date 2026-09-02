import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FileUrlQuery, fileUrlQuerySchema, RegisterFileDto, registerFileSchema, UploadBase64Dto, uploadBase64Schema, UploadUrlDto, uploadUrlSchema } from './files.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'URL pré-signée PUT pour envoyer un fichier directement au stockage S3' })
  uploadUrl(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(uploadUrlSchema)) dto: UploadUrlDto) {
    return this.files.createUploadUrl(user.id, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistre un fichier envoyé via upload-url dans la table files' })
  register(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(registerFileSchema)) dto: RegisterFileDto) {
    return this.files.register(user.id, dto);
  }

  @Post('upload')
  @HttpCode(200)
  @ApiOperation({ summary: 'Upload base64 via l’API (contrat de l’ex Edge Function upload-to-wasabi)' })
  uploadBase64(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(uploadBase64Schema)) dto: UploadBase64Dto) {
    return this.files.uploadBase64(user.id, dto);
  }

  @Get()
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.files.listOwn(user.id);
  }

  @Get('url')
  @ApiOperation({ summary: 'URL de téléchargement pré-signée (ex get-presigned-url), journalisée dans file_access_logs' })
  signedUrl(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(fileUrlQuerySchema)) query: FileUrlQuery, @Req() req: FastifyRequest) {
    return this.files.signedUrl(user.id, query, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}

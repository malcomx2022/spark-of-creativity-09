import { Controller, Delete, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AcademyAdminService } from './academy-admin.service';
import { AdminEnrollmentsQuery, adminEnrollmentsQuerySchema, AdminWebhookEventsQuery, adminWebhookEventsQuerySchema } from './academy.dto';

@ApiTags('admin/academy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'ops', 'analyst', 'support')
@Controller('admin/academy')
export class AcademyAdminController {
  constructor(private readonly admin: AcademyAdminService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Indicateurs DomiCares Academy (Akambi GET /reports) et décompte local' })
  reports() {
    return this.admin.reports();
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Inscriptions DomiCares Academy (filtres statut, formation, recherche ; pagination)' })
  enrollments(@Query(new ZodValidationPipe(adminEnrollmentsQuerySchema)) q: AdminEnrollmentsQuery) {
    return this.admin.listEnrollments(q);
  }

  @Get('webhook-events')
  @ApiOperation({ summary: 'Événements Akambi reçus (sans leur corps) et décompte par statut' })
  webhookEvents(@Query(new ZodValidationPipe(adminWebhookEventsQuerySchema)) q: AdminWebhookEventsQuery) {
    return this.admin.listWebhookEvents(q);
  }

  @Get('sync-state')
  @ApiOperation({ summary: 'État des synchronisations (catalogue, inscriptions) ; relance : POST /admin/jobs/:name/run' })
  syncState() {
    return this.admin.syncState();
  }

  @Delete('enrollments/:id')
  @AdminOnly('super_admin', 'ops')
  @ApiOperation({ summary: 'Désinscription d’un praticien (retire l’accès au cours ; refusée après l’attestation), journalisée' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Req() req: FastifyRequest) {
    return this.admin.cancelEnrollment(user.id, id, req.ip);
  }
}

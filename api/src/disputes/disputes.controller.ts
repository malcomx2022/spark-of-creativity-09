import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminDisputesQuery, adminDisputesQuerySchema, CreateDisputeDto, createDisputeSchema, DisputeMessageDto, disputeMessageSchema, MyDisputesQuery, myDisputesQuerySchema, UpdateDisputeDto, updateDisputeSchema } from './disputes.dto';
import { DisputesService } from './disputes.service';

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @ApiOperation({ summary: 'Signale un problème sur un rendez-vous (ex ConsultationConfirmation)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createDisputeSchema)) dto: CreateDisputeDto) {
    return this.disputes.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(myDisputesQuerySchema)) q: MyDisputesQuery) {
    return this.disputes.listMine(user.id, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.get(user.id, id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.listMessages(user.id, id);
  }

  @Post(':id/messages')
  addMessage(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(disputeMessageSchema)) dto: DisputeMessageDto) {
    return this.disputes.addMessage(user.id, id, dto);
  }
}

@ApiTags('admin/disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'ops', 'support')
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminDisputesQuerySchema)) q: AdminDisputesQuery) {
    return this.disputes.adminList(q);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Prise en charge / résolution / réouverture / fermeture (audit `Dispute <status>`)' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateDisputeSchema)) dto: UpdateDisputeDto, @Req() req: FastifyRequest) {
    return this.disputes.adminUpdate(user.id, id, dto, req.ip);
  }
}

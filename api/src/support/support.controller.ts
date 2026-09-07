import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminTicketsQuery, adminTicketsQuerySchema, CreateTicketDto, createTicketSchema, FaqDto, faqSchema, MyTicketsQuery, myTicketsQuerySchema, PublicFaqQuery, publicFaqQuerySchema, UpdateFaqDto, updateFaqSchema, UpdateTicketDto, updateTicketSchema } from './support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Mes tickets (ex useSupportTickets)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(myTicketsQuerySchema)) q: MyTicketsQuery) {
    return this.support.listMine(user.id, q);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un ticket (ex useCreateSupportTicket)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createTicketSchema)) dto: CreateTicketDto) {
    return this.support.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.getMine(user.id, id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.closeMine(user.id, id);
  }
}

@ApiTags('faqs')
@Controller('faqs')
export class FaqsController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'FAQ publiées (public)' })
  list(@Query(new ZodValidationPipe(publicFaqQuerySchema)) q: PublicFaqQuery) {
    return this.support.publicFaqs(q);
  }
}

@ApiTags('admin/support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'support', 'ops')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  tickets(@Query(new ZodValidationPipe(adminTicketsQuerySchema)) q: AdminTicketsQuery) {
    return this.support.adminList(q);
  }

  @Get('tickets/stats')
  stats() {
    return this.support.adminStats();
  }

  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Statut, réponse, priorité, assignation d’un ticket (audit update_ticket_status)' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateTicketSchema)) dto: UpdateTicketDto, @Req() req: FastifyRequest) {
    return this.support.adminUpdate(user.id, id, dto, req.ip);
  }

  @Get('faqs')
  faqs() {
    return this.support.adminFaqs();
  }

  @Post('faqs')
  createFaq(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(faqSchema)) dto: FaqDto, @Req() req: FastifyRequest) {
    return this.support.createFaq(user.id, dto, req.ip);
  }

  @Patch('faqs/:id')
  @ApiOperation({ summary: 'Modifie ou publie / dépublie une FAQ' })
  updateFaq(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateFaqSchema)) dto: UpdateFaqDto, @Req() req: FastifyRequest) {
    return this.support.updateFaq(user.id, id, dto, req.ip);
  }

  @Delete('faqs/:id')
  deleteFaq(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.support.deleteFaq(user.id, id, req.ip);
  }
}

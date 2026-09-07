import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AccessTokenPayload, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import {
  CancelSessionDto, cancelSessionSchema, CoachSessionsQuery, coachSessionsQuerySchema, CreateGroupSessionDto, createGroupSessionSchema, ListGroupSessionsQuery, listGroupSessionsQuerySchema,
  MineQuery, mineQuerySchema, RegisterDto, registerSchema, RetryPaymentDto, retryPaymentSchema, UpdateGroupSessionDto, updateGroupSessionSchema,
} from './group-sessions.dto';
import { GroupSessionsService } from './group-sessions.service';

@ApiTags('group-sessions')
@Controller('group-sessions')
export class GroupSessionsController {
  constructor(private readonly sessions: GroupSessionsService, private readonly jwt: JwtService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Utilisateur optionnel (catalogue public enrichi de « mon inscription » si connecté). */
  private async optionalUser(req: FastifyRequest): Promise<string | undefined> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.['access_token'] as string | undefined);
    if (!token) return undefined;
    try {
      return (await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.JWT_ACCESS_SECRET })).sub;
    } catch {
      return undefined;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Catalogue public des séances à venir (ex useGroupSessions / CoachSearch)' })
  list(@Query(new ZodValidationPipe(listGroupSessionsQuerySchema)) q: ListGroupSessionsQuery) {
    return this.sessions.list(q);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes inscriptions (ex usePatientGroupSessions)' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(mineQuerySchema)) q: MineQuery) {
    return this.sessions.listMine(user.id, q);
  }

  @Get('coach')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Séances du coach connecté (tous statuts, avec compteurs de participants)' })
  coach(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(coachSessionsQuerySchema)) q: CoachSessionsQuery) {
    return this.sessions.listForCoach(user.id, q);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.sessions.get(id, await this.optionalUser(req));
  }

  @Get(':id/participants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  participants(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.listParticipants(user.id, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crée une séance (coach sportif, ex CreateGroupSessionDialog)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createGroupSessionSchema)) dto: CreateGroupSessionDto) {
    return this.sessions.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateGroupSessionSchema)) dto: UpdateGroupSessionDto) {
    return this.sessions.update(user.id, id, dto);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.confirm(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(cancelSessionSchema)) dto: CancelSessionDto) {
    return this.sessions.cancel(user.id, id, dto ?? {});
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.complete(user.id, id);
  }

  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscription + paiement FedaPay (ex register-group-session)' })
  register(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.sessions.register(user.id, id, dto);
  }

  @Post('registrations/:participantId/retry-payment')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nouvelle tentative de paiement (ex retry-group-session-payment)' })
  retry(@CurrentUser() user: AuthenticatedUser, @Param('participantId', ParseUUIDPipe) participantId: string, @Body(new ZodValidationPipe(retryPaymentSchema)) dto: RetryPaymentDto) {
    return this.sessions.retryPayment(user.id, participantId, dto);
  }

  @Delete('registrations/:participantId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Désinscription d’une place non payée' })
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.sessions.withdraw(user.id, participantId);
  }
}

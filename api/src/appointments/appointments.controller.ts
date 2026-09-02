import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { cancelSchema, completeSchema, CreateAppointmentDto, createAppointmentSchema, ListAppointmentsQuery, listAppointmentsQuerySchema, PractitionerStatusDto, practitionerStatusSchema, RespondDto, respondSchema } from './appointments.dto';
import { AppointmentsService } from './appointments.service';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Demande de rendez-vous (patient) → awaiting_practitioner + notification du praticien' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createAppointmentSchema)) dto: CreateAppointmentDto) {
    return this.appointments.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mes rendez-vous (patient ou praticien) ; ?status=active pour les en-cours' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listAppointmentsQuerySchema)) q: ListAppointmentsQuery) {
    return this.appointments.list(user.id, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.get(user.id, id);
  }

  @Post(':id/respond')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réponse du praticien : accept (déclenche le paiement) ou reject (réassignation)' })
  respond(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(respondSchema)) dto: RespondDto) {
    return this.appointments.respond(user.id, id, dto);
  }

  @Patch(':id/practitioner-status')
  @ApiOperation({ summary: 'Progression du praticien (preparing, en_route, arrived, in_progress) + position GPS' })
  practitionerStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(practitionerStatusSchema)) dto: PractitionerStatusDto) {
    return this.appointments.updatePractitionerStatus(user.id, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fin de consultation (praticien) → awaiting_confirmation' })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(completeSchema)) dto: { notes?: string }) {
    return this.appointments.complete(user.id, id, dto.notes);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmation de la consultation par le patient → completed' })
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.confirm(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(cancelSchema)) dto: { reason?: string }) {
    return this.appointments.cancel(user.id, id, dto.reason);
  }
}

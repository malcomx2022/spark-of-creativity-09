import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { AccessTokenPayload, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import {
  AddressDto, addressSchema, CareNoteDto, careNoteSchema, ConsentDto, consentSchema, ConsultationReportDto, consultationReportSchema, EmergencyContactDto, emergencyContactSchema, ListQuery, listQuerySchema, MedicalProfileDto, medicalProfileSchema,
  TriageAnswers, triageAnswersSchema, UpdateCareNoteDto, updateCareNoteSchema, UpdateConsultationReportDto, updateConsultationReportSchema, updateAddressSchema, updateEmergencyContactSchema,
} from './medical.dto';
import { MedicalService } from './medical.service';

/** Profil médical, contacts d'urgence, dossier vu par le praticien, consentements, export RGPD. */
@ApiTags('medical')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('medical')
export class MedicalController {
  constructor(private readonly medical: MedicalService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.getProfile(user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Crée ou met à jour le profil médical (ex useUpdateMedicalProfile / MedicalSection)' })
  upsertProfile(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(medicalProfileSchema)) dto: MedicalProfileDto) {
    return this.medical.upsertProfile(user.id, dto);
  }

  @Get('profile/doctors')
  doctors() {
    return this.medical.doctorCandidates();
  }

  @Get('emergency-contacts')
  contacts(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.listContacts(user.id);
  }

  @Post('emergency-contacts')
  createContact(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(emergencyContactSchema)) dto: EmergencyContactDto) {
    return this.medical.createContact(user.id, dto);
  }

  @Patch('emergency-contacts/:id')
  updateContact(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateEmergencyContactSchema)) dto: Partial<EmergencyContactDto>) {
    return this.medical.updateContact(user.id, id, dto);
  }

  @Delete('emergency-contacts/:id')
  deleteContact(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.medical.deleteContact(user.id, id);
  }

  @Get('patients/:patientId/record')
  @ApiOperation({ summary: 'Dossier d’un patient pour le praticien d’un rendez-vous confirmé / en cours (policy RLS d’origine)' })
  patientRecord(@CurrentUser() user: AuthenticatedUser, @Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.medical.patientRecordForPractitioner(user.id, patientId);
  }

  @Get('consents')
  consents(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.listConsents(user.id);
  }

  @Post('consents')
  @ApiOperation({ summary: 'Enregistre un consentement (version active de consent_versions mémorisée)' })
  consent(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(consentSchema)) dto: ConsentDto) {
    return this.medical.recordConsent(user.id, dto);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export RGPD de mes données (ex SupportSection.handleDataExport)' })
  exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.exportMyData(user.id);
  }
}

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly medical: MedicalService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.listAddresses(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(addressSchema)) dto: AddressDto) {
    return this.medical.createAddress(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateAddressSchema)) dto: Partial<AddressDto>) {
    return this.medical.updateAddress(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.medical.deleteAddress(user.id, id);
  }
}

@ApiTags('care-notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('care-notes')
export class CareNotesController {
  constructor(private readonly medical: MedicalService) {}

  @Get()
  @ApiOperation({ summary: 'Notes SOAP du praticien connecté (ex useCareNotes)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.listCareNotes(user.id);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Notes partagées avec le patient connecté (ex usePatientCareNotes)' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.medical.patientCareNotes(user.id, q);
  }

  @Get('appointment/:appointmentId')
  byAppointment(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') appointmentId: string) {
    return this.medical.careNoteByAppointment(user.id, appointmentId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(careNoteSchema)) dto: CareNoteDto) {
    return this.medical.createCareNote(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateCareNoteSchema)) dto: UpdateCareNoteDto) {
    return this.medical.updateCareNote(user.id, id, dto);
  }

  @Post(':id/share')
  @HttpCode(200)
  @ApiOperation({ summary: 'Partage la note avec le patient (notification + message, journal care_notes_sharing_log)' })
  share(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.medical.shareCareNote(user.id, id);
  }
}

@ApiTags('consultation-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('consultation-reports')
export class ConsultationReportsController {
  constructor(private readonly medical: MedicalService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.medical.listReports(user.id, q);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listQuerySchema)) q: ListQuery) {
    return this.medical.patientReports(user.id, q);
  }

  @Get('appointment/:appointmentId')
  byAppointment(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') appointmentId: string) {
    return this.medical.reportByAppointment(user.id, appointmentId);
  }

  @Post()
  @ApiOperation({ summary: 'Crée le compte rendu (ex ConsultationReportFormDialog ; completeAppointment = ex CompleteConsultationForm)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(consultationReportSchema)) dto: ConsultationReportDto) {
    return this.medical.createReport(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lecture journalisée (consultation_reports_access_log)' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('access') access?: string) {
    return this.medical.getReport(user.id, id, access === 'download' ? 'download' : 'view');
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateConsultationReportSchema)) dto: UpdateConsultationReportDto) {
    return this.medical.updateReport(user.id, id, dto);
  }

  @Get(':id/access-log')
  @UseGuards(AdminRolesGuard)
  @AdminOnly()
  accessLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.medical.reportAccessLog(id);
  }
}

@ApiTags('triage')
@Controller('triage')
export class TriageController {
  constructor(private readonly medical: MedicalService, private readonly jwt: JwtService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Post()
  @ApiOperation({ summary: 'Évaluation d’urgence (ex TriageForm) ; enregistrée si l’utilisateur est connecté' })
  async evaluate(@Body(new ZodValidationPipe(triageAnswersSchema)) answers: TriageAnswers, @Req() req: FastifyRequest) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.['access_token'] as string | undefined);
    let userId: string | null = null;
    if (token) {
      try {
        userId = (await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.config.JWT_ACCESS_SECRET })).sub;
      } catch {
        userId = null;
      }
    }
    return this.medical.triage(userId, answers);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.medical.triageHistory(user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.medical.deleteTriage(user.id, id);
  }
}

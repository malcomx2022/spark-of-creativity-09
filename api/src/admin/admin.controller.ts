import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { AccessTokenPayload, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import {
  AuditQuery, auditQuerySchema, CreateAdminDto, createAdminSchema, CreateConsentVersionDto, createConsentVersionSchema, DeleteUserDto, deleteUserSchema, LogSearchActivityDto, logSearchActivitySchema, ModerateReviewDto, moderateReviewSchema,
  OtpAttemptsQuery, otpAttemptsQuerySchema, RevokeAdminDto, revokeAdminSchema, reviewsQuerySchema, SearchActivityQuery, searchActivityQuerySchema, SystemConfigDto, systemConfigSchema, TodayAppointmentsQuery, todayAppointmentsQuerySchema, UsersQuery, usersQuerySchema,
} from './admin.dto';
import { AdminService } from './admin.service';

/** Points d'entrée publics (statistiques d'accueil, consentement actif, journal de recherche). */
@ApiTags('public')
@Controller()
export class PublicStatsController {
  constructor(private readonly admin: AdminService, private readonly jwt: JwtService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('stats/public')
  @ApiOperation({ summary: 'Statistiques publiques (ex get_public_stats / usePublicStats)' })
  publicStats() {
    return this.admin.publicStats();
  }

  @Get('consents/:type/active')
  activeConsent(@Param('type') type: string) {
    return this.admin.activeConsentVersion(type);
  }

  @Post('search-activity')
  @HttpCode(202)
  @ApiOperation({ summary: 'Journalise une action de recherche (ex useSearchActivityLog ; visiteurs anonymes acceptés)' })
  async logActivity(@Body(new ZodValidationPipe(logSearchActivitySchema)) dto: LogSearchActivityDto, @Req() req: FastifyRequest) {
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
    return this.admin.logSearchActivity(userId, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('me/roles')
  @ApiOperation({ summary: 'Rôles administrateurs de l’utilisateur connecté (ex useAdminRole)' })
  async myRoles(@CurrentUser() user: AuthenticatedUser) {
    const roles = await this.admin.rolesOf(user.id);
    return { roles, isSuperAdmin: roles.includes('super_admin') };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Tableau de bord (ex admin_dashboard_stats / useAdminStats)' })
  stats() {
    return this.admin.dashboardStats();
  }

  // --- Administrateurs (super_admin) -------------------------------------------------
  @Get('admins')
  @AdminOnly('super_admin')
  admins() {
    return this.admin.listAdmins();
  }

  @Post('admins')
  @AdminOnly('super_admin')
  @ApiOperation({ summary: 'Crée un administrateur ou ajoute un rôle (ex admin-management create)' })
  createAdmin(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createAdminSchema)) dto: CreateAdminDto, @Req() req: FastifyRequest) {
    return this.admin.createAdmin(user.id, dto, req.ip);
  }

  @Post('admins/:userId/reset-password')
  @HttpCode(200)
  @AdminOnly('super_admin')
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string, @Req() req: FastifyRequest) {
    return this.admin.resetAdminPassword(user.id, userId, req.ip);
  }

  @Delete('admins/:userId')
  @AdminOnly('super_admin')
  @ApiOperation({ summary: 'Retire les rôles administrateur et révoque les sessions (ex admin-management disable)' })
  revokeAdmin(@CurrentUser() user: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodValidationPipe(revokeAdminSchema)) dto: RevokeAdminDto, @Req() req: FastifyRequest) {
    return this.admin.revokeAdmin(user.id, userId, dto.reason, req.ip);
  }

  // --- Utilisateurs --------------------------------------------------------------------
  @Get('users/patients')
  patients(@Query(new ZodValidationPipe(usersQuerySchema)) q: UsersQuery) {
    return this.admin.listPatients(q);
  }

  @Get('users/patients/:id')
  patient(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getPatient(id);
  }

  @Get('users/practitioners')
  practitioners(@Query(new ZodValidationPipe(usersQuerySchema)) q: UsersQuery) {
    return this.admin.listPractitioners(q);
  }

  @Get('users/practitioners/:id')
  practitioner(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getPractitioner(id);
  }

  @Delete('users/:userId')
  @AdminOnly('super_admin', 'ops')
  @ApiOperation({ summary: 'Suppression définitive d’un utilisateur (ex delete-single-user)' })
  deleteUser(@CurrentUser() user: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodValidationPipe(deleteUserSchema)) dto: DeleteUserDto, @Req() req: FastifyRequest) {
    return this.admin.deleteUser(user.id, user.email, userId, dto, req.ip);
  }

  @Post('users/cleanup-non-test')
  @HttpCode(200)
  @AdminOnly('super_admin')
  @ApiOperation({ summary: 'Supprime tous les comptes hors @test.com (ex cleanup-non-test-accounts)' })
  cleanup(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(deleteUserSchema.pick({ confirm: true }))) _dto: { confirm: 'SUPPRIMER' }, @Req() req: FastifyRequest) {
    return this.admin.cleanupNonTestAccounts(user.id, req.ip);
  }

  // --- Audit, recherche, OTP ------------------------------------------------------------
  @Get('audit-logs')
  auditLogs(@Query(new ZodValidationPipe(auditQuerySchema)) q: AuditQuery) {
    return this.admin.auditLogs(q);
  }

  @Get('audit-logs/filters')
  auditFilters() {
    return this.admin.auditFilters();
  }

  @Get('search-activity')
  searchActivity(@Query(new ZodValidationPipe(searchActivityQuerySchema)) q: SearchActivityQuery) {
    return this.admin.searchActivity(q);
  }

  @Get('otp/attempts')
  otpAttempts(@Query(new ZodValidationPipe(otpAttemptsQuerySchema)) q: OtpAttemptsQuery) {
    return this.admin.otpAttempts(q);
  }

  @Get('otp/stats')
  otpStats() {
    return this.admin.otpStats();
  }

  @Get('otp/blocked')
  otpBlocked() {
    return this.admin.otpBlocked();
  }

  @Delete('otp/attempts/:id')
  deleteOtpAttempt(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.admin.deleteOtpAttempt(user.id, id, req.ip);
  }

  @Post('otp/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Débloque un numéro (tentatives supprimées, limite de débit réinitialisée)' })
  resetOtp(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(otpAttemptsQuerySchema.pick({ phone: true }).required())) dto: { phone: string }, @Req() req: FastifyRequest) {
    return this.admin.resetOtp(user.id, dto.phone, req.ip);
  }

  // --- Configuration et conformité ------------------------------------------------------
  @Get('system-config')
  systemConfig() {
    return this.admin.listSystemConfig();
  }

  @Put('system-config/:key')
  upsertConfig(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string, @Body(new ZodValidationPipe(systemConfigSchema)) dto: SystemConfigDto, @Req() req: FastifyRequest) {
    return this.admin.upsertSystemConfig(user.id, key, dto, req.ip);
  }

  @Get('consents/stats')
  consentStats() {
    return this.admin.consentStats();
  }

  @Get('consent-versions')
  consentVersions(@Query('type') type?: string) {
    return this.admin.listConsentVersions(type);
  }

  @Post('consent-versions')
  createConsentVersion(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createConsentVersionSchema)) dto: CreateConsentVersionDto, @Req() req: FastifyRequest) {
    return this.admin.createConsentVersion(user.id, dto, req.ip);
  }

  @Post('consent-versions/:id/activate')
  @HttpCode(200)
  activateConsent(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.admin.setConsentVersionActive(user.id, id, true, req.ip);
  }

  @Post('consent-versions/:id/deactivate')
  @HttpCode(200)
  deactivateConsent(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.admin.setConsentVersionActive(user.id, id, false, req.ip);
  }

  // --- Opérations ------------------------------------------------------------------------
  @Get('operations/appointments')
  appointments(@Query(new ZodValidationPipe(todayAppointmentsQuerySchema)) q: TodayAppointmentsQuery) {
    return this.admin.appointmentsOfDay(q);
  }

  @Get('operations/reviews')
  reviews(@Query(new ZodValidationPipe(reviewsQuerySchema)) q: { page: number; limit: number }) {
    return this.admin.reviews(q);
  }

  @Post('operations/reviews/:id/moderate')
  @HttpCode(200)
  moderate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(moderateReviewSchema)) dto: ModerateReviewDto, @Req() req: FastifyRequest) {
    return this.admin.moderateReview(user.id, id, dto, req.ip);
  }

  @Get('api/usage')
  apiUsage() {
    return this.admin.apiUsage();
  }
}

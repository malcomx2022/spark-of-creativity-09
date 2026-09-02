import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AuthService, RequestMeta, SessionResponse } from './auth.service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  LoginDto,
  loginSchema,
  RefreshDto,
  refreshSchema,
  RegisterDto,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  SendOtpDto,
  sendOtpSchema,
  UpdateMetadataDto,
  updateMetadataSchema,
  verifyEmailSchema,
  VerifyOtpDto,
  verifyOtpSchema,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private meta(req: FastifyRequest): RequestMeta {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  /** Le front web reçoit les jetons en cookies httpOnly ET dans le corps (clients mobiles). */
  private setSessionCookies(reply: FastifyReply, session: SessionResponse): void {
    const base = { httpOnly: true, secure: this.config.COOKIE_SECURE, sameSite: 'lax' as const };
    reply.setCookie(ACCESS_COOKIE, session.accessToken, { ...base, path: '/', maxAge: session.expiresIn });
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, { ...base, path: `/${this.config.API_PREFIX}/auth`, maxAge: this.config.JWT_REFRESH_TTL_SECONDS });
  }

  private clearSessionCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { path: `/${this.config.API_PREFIX}/auth` });
  }

  @Post('register')
  @ApiOperation({ summary: 'Inscription e-mail + mot de passe (ex supabase.auth.signUp)' })
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.register(dto, this.meta(req));
    if (result.session) this.setSessionCookies(reply, { ...result.session, user: result.user });
    return result;
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Connexion (ex signInWithPassword)' })
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const session = await this.auth.login(dto, this.meta(req));
    this.setSessionCookies(reply, session);
    return session;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotation du refresh token (cookie ou corps)' })
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? '';
    const session = await this.auth.refresh(token, this.meta(req));
    this.setSessionCookies(reply, session);
    return session;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion (?everywhere=true pour toutes les sessions)' })
  async logout(@CurrentUser() user: AuthenticatedUser, @Query('everywhere') everywhere: string | undefined, @Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    const result = await this.auth.logout(token, user.id, everywhere === 'true');
    this.clearSessionCookies(reply);
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compte, profil et rôle applicatif résolu (admin/practitioner/coach/patient/incomplete_practitioner)' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Patch('me/metadata')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fusionne des métadonnées (ex updateUser({ data })) : pending_onboarding, etc.' })
  updateMetadata(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updateMetadataSchema)) dto: UpdateMetadataDto) {
    return this.auth.updateMetadata(user.id, dto.metadata);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: { token: string }) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  resendVerification(@Body(new ZodValidationPipe(resendVerificationSchema)) dto: { email: string }) {
    return this.auth.resendVerification(dto.email);
  }

  @Post('password/forgot')
  @HttpCode(200)
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: { email: string }) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: { token: string; password: string }) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(changePasswordSchema)) dto: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('otp/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envoi OTP SMS/WhatsApp (ex send-otp)' })
  sendOtp(@Body(new ZodValidationPipe(sendOtpSchema)) dto: SendOtpDto, @Req() req: FastifyRequest) {
    return this.auth.sendOtp(dto, this.meta(req));
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérification OTP et ouverture de session (ex verify-otp)' })
  async verifyOtp(@Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const session = await this.auth.verifyOtp(dto, this.meta(req));
    this.setSessionCookies(reply, session);
    return session;
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Révoque toutes les sessions de l’utilisateur' })
  async revokeAll(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.logout(undefined, user.id, true);
    this.clearSessionCookies(reply);
    return result;
  }
}

import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AcademyEnrollmentsService } from './academy-enrollments.service';
import { courseIdSchema, EnrollDto, enrollSchema } from './academy.dto';
import { AcademyService } from './academy.service';

@ApiTags('academy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('academy')
export class AcademyController {
  constructor(private readonly academy: AcademyService, private readonly enrollments: AcademyEnrollmentsService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Catalogue DomiCares Academy (formations Akambi publiées, copie locale synchronisée)' })
  listCourses(@CurrentUser() user: AuthenticatedUser) {
    return this.academy.listCourses(user.id);
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Fiche d’une formation publiée du catalogue DomiCares Academy' })
  getCourse(@CurrentUser() user: AuthenticatedUser, @Param('courseId', new ZodValidationPipe(courseIdSchema)) courseId: string) {
    return this.academy.getCourse(user.id, courseId);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Mes inscriptions DomiCares Academy et leur progression' })
  listEnrollments(@CurrentUser() user: AuthenticatedUser) {
    return this.enrollments.listMine(user.id);
  }

  @Post('enrollments')
  @ApiOperation({ summary: 'Inscription à une formation : rattache le compte de formation Akambi au besoin (201 créée, 200 existante)' })
  async enroll(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(enrollSchema)) dto: EnrollDto, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.enrollments.enroll(user.id, dto);
    void reply.status(result.created ? 201 : 200);
    return result;
  }

  @Post('enrollments/:id/launch')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lien d’accès au cours, à suivre immédiatement (SSO à usage unique de 5 min, ou connexion Akambi pour un compte existant)' })
  launch(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.enrollments.launch(user.id, id);
  }
}

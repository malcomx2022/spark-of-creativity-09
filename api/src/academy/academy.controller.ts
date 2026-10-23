import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { courseIdSchema } from './academy.dto';
import { AcademyService } from './academy.service';

@ApiTags('academy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('academy')
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

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
}

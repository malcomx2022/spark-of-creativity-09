import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { StatsService } from './stats.service';

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format attendu AAAA-MM').optional() });

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('practitioner')
  @ApiOperation({ summary: 'Compteurs du tableau de bord praticien (mois courant par défaut)' })
  practitioner(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(monthSchema)) q: z.infer<typeof monthSchema>) {
    return this.stats.practitioner(user.id, q.month);
  }

  @Get('patient')
  @ApiOperation({ summary: 'Compteurs du tableau de bord patient' })
  patient(@CurrentUser() user: AuthenticatedUser) {
    return this.stats.patient(user.id);
  }

  @Get('coach')
  @ApiOperation({ summary: 'Compteurs et revenus nets du tableau de bord coach' })
  coach(@CurrentUser() user: AuthenticatedUser) {
    return this.stats.coach(user.id);
  }
}

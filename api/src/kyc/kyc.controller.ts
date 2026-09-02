import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { KycDecisionDto, kycDecisionSchema, KycQueueQuery, kycQueueQuerySchema } from './kyc.dto';
import { KycService } from './kyc.service';

@ApiTags('admin/kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard) // ordre : authentification puis rôle admin
@AdminOnly('super_admin', 'compliance', 'ops')
@Controller('admin/kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('queue')
  @ApiOperation({ summary: 'File des dossiers KYC (pending + incomplete par défaut)' })
  queue(@CurrentUser() admin: AuthenticatedUser, @Query(new ZodValidationPipe(kycQueueQuerySchema)) q: KycQueueQuery) {
    return this.kyc.queue(admin.id, q);
  }

  @Post(':practitionerId/decision')
  @HttpCode(200)
  @ApiOperation({ summary: 'Décision KYC (approved via approve_practitioner_kyc(), rejected, incomplete) + notifications' })
  decide(@CurrentUser() admin: AuthenticatedUser, @Param('practitionerId', ParseUUIDPipe) practitionerId: string, @Body(new ZodValidationPipe(kycDecisionSchema)) dto: KycDecisionDto) {
    return this.kyc.decide(admin.id, practitionerId, dto);
  }
}

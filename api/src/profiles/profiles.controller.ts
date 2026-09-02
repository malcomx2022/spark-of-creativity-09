import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateProfileDto, updateProfileSchema } from './profiles.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getOwn(user.id);
  }

  @Patch()
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto) {
    return this.profiles.updateOwn(user.id, dto);
  }
}

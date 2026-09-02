import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { AdminRolesGuard } from '../common/guards/admin-roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JobName, JobsService } from './jobs.service';

@ApiTags('admin/jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminRolesGuard)
@AdminOnly('super_admin', 'ops', 'finance')
@Controller('admin/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list() {
    return this.jobs.definitions;
  }

  @Post(':name/run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exécute un job planifié immédiatement (diagnostic / rattrapage)' })
  run(@Param('name') name: string, @Body() options: Record<string, unknown> = {}) {
    if (!this.jobs.definitions.some((d) => d.name === name)) throw new BadRequestException(`Job inconnu : ${name}`);
    return this.jobs.run(name as JobName, options ?? {});
  }
}

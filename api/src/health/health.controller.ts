import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    const dbOk = await this.database.ping().catch(() => false);
    if (!dbOk) throw new ServiceUnavailableException({ status: 'down', database: 'unreachable' });
    return { status: 'ok', database: 'ok', time: new Date().toISOString() };
  }
}

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PublicConfigController } from './public-config.controller';

@Module({ controllers: [HealthController, PublicConfigController] })
export class HealthModule {}

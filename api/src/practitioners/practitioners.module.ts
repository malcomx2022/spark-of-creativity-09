import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PractitionersController } from './practitioners.controller';
import { PractitionersService } from './practitioners.service';
import { ScheduleService } from './schedule.service';

@Module({ imports: [AuthModule], controllers: [PractitionersController], providers: [PractitionersService, ScheduleService], exports: [PractitionersService] })
export class PractitionersModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminSupportController, FaqsController, SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({ imports: [AuthModule], controllers: [SupportController, FaqsController, AdminSupportController], providers: [SupportService], exports: [SupportService] })
export class SupportModule {}

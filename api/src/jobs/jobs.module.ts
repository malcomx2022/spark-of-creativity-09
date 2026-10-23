import { Module } from '@nestjs/common';
import { AcademyModule } from '../academy/academy.module';
import { AuthModule } from '../auth/auth.module';
import { DisputesModule } from '../disputes/disputes.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsModule } from '../payments/payments.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({ imports: [AuthModule, PaymentsModule, FinanceModule, DisputesModule, AcademyModule], controllers: [JobsController], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}

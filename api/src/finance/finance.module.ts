import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminFinanceController, PractitionerFinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [PractitionerFinanceController, AdminFinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}

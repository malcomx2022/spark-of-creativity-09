import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { GroupSessionsController } from './group-sessions.controller';
import { GroupSessionsService } from './group-sessions.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [GroupSessionsController],
  providers: [GroupSessionsService],
  exports: [GroupSessionsService],
})
export class GroupSessionsModule {}

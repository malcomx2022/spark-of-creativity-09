import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupportModule } from '../support/support.module';
import { AdminDisputesController, DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({ imports: [AuthModule, SupportModule], controllers: [DisputesController, AdminDisputesController], providers: [DisputesService], exports: [DisputesService] })
export class DisputesModule {}

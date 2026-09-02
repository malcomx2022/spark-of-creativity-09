import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { FakeFedaPayClient, FEDAPAY_CLIENT, HttpFedaPayClient } from './fedapay.client';
import { LedgerService } from './ledger.service';
import { AdminPaymentsController, PaymentsController, WebhooksController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, WebhooksController, AdminPaymentsController],
  providers: [
    PaymentsService,
    LedgerService,
    FakeFedaPayClient,
    HttpFedaPayClient,
    { provide: FEDAPAY_CLIENT, inject: [APP_CONFIG, FakeFedaPayClient, HttpFedaPayClient], useFactory: (c: AppConfig, fake: FakeFedaPayClient, http: HttpFedaPayClient) => (c.FEDAPAY_PROVIDER === 'fedapay' ? http : fake) },
  ],
  exports: [PaymentsService, FEDAPAY_CLIENT, FakeFedaPayClient],
})
export class PaymentsModule {}

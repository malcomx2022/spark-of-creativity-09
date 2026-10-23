import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AcademyEnrollmentsService } from './academy-enrollments.service';
import { AcademySyncService } from './academy-sync.service';
import { AcademyWebhooksController } from './academy-webhooks.controller';
import { AcademyController } from './academy.controller';
import { AcademyService } from './academy.service';
import { AKAMBI_CLIENT, FakeAkambiClient, HttpAkambiClient } from './akambi.client';

/**
 * DomiCares Academy — intégration de l'API partenaires Akambi v1
 * (plan : docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md). Lots A3 à A5 : catalogue, compte de formation, inscription, accès au cours, webhooks et rapprochement.
 */
@Module({
  imports: [AuthModule],
  controllers: [AcademyController, AcademyWebhooksController],
  providers: [
    FakeAkambiClient,
    HttpAkambiClient,
    { provide: AKAMBI_CLIENT, inject: [APP_CONFIG, FakeAkambiClient, HttpAkambiClient], useFactory: (c: AppConfig, fake: FakeAkambiClient, http: HttpAkambiClient) => (c.AKAMBI_PROVIDER === 'akambi' ? http : fake) },
    AcademyService,
    AcademyEnrollmentsService,
    AcademySyncService,
  ],
  exports: [AKAMBI_CLIENT, FakeAkambiClient, AcademyService, AcademyEnrollmentsService, AcademySyncService],
})
export class AcademyModule {}

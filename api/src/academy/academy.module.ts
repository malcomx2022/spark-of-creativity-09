import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AcademyEnrollmentsService } from './academy-enrollments.service';
import { AcademyController } from './academy.controller';
import { AcademyService } from './academy.service';
import { AKAMBI_CLIENT, FakeAkambiClient, HttpAkambiClient } from './akambi.client';

/**
 * DomiCares Academy — intégration de l'API partenaires Akambi v1
 * (plan : docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md). Lots A3-A4 : catalogue, compte de formation, inscription et accès au cours.
 */
@Module({
  imports: [AuthModule],
  controllers: [AcademyController],
  providers: [
    FakeAkambiClient,
    HttpAkambiClient,
    { provide: AKAMBI_CLIENT, inject: [APP_CONFIG, FakeAkambiClient, HttpAkambiClient], useFactory: (c: AppConfig, fake: FakeAkambiClient, http: HttpAkambiClient) => (c.AKAMBI_PROVIDER === 'akambi' ? http : fake) },
    AcademyService,
    AcademyEnrollmentsService,
  ],
  exports: [AKAMBI_CLIENT, FakeAkambiClient, AcademyService, AcademyEnrollmentsService],
})
export class AcademyModule {}

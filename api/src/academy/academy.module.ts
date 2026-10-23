import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AcademyController } from './academy.controller';
import { AcademyService } from './academy.service';
import { AKAMBI_CLIENT, FakeAkambiClient, HttpAkambiClient } from './akambi.client';

/**
 * DomiCares Academy — intégration de l'API partenaires Akambi v1
 * (plan : docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md). Lot A3 : catalogue synchronisé et routes de lecture.
 */
@Module({
  imports: [AuthModule],
  controllers: [AcademyController],
  providers: [
    FakeAkambiClient,
    HttpAkambiClient,
    { provide: AKAMBI_CLIENT, inject: [APP_CONFIG, FakeAkambiClient, HttpAkambiClient], useFactory: (c: AppConfig, fake: FakeAkambiClient, http: HttpAkambiClient) => (c.AKAMBI_PROVIDER === 'akambi' ? http : fake) },
    AcademyService,
  ],
  exports: [AKAMBI_CLIENT, FakeAkambiClient, AcademyService],
})
export class AcademyModule {}

import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AKAMBI_CLIENT, FakeAkambiClient, HttpAkambiClient } from './akambi.client';

/**
 * DomiCares Academy — intégration de l'API partenaires Akambi v1
 * (plan : docs/academy/01-FAISABILITE-INTEGRATION-AKAMBI.md). Lot A1 : client seul, sans route.
 */
@Module({
  providers: [
    FakeAkambiClient,
    HttpAkambiClient,
    { provide: AKAMBI_CLIENT, inject: [APP_CONFIG, FakeAkambiClient, HttpAkambiClient], useFactory: (c: AppConfig, fake: FakeAkambiClient, http: HttpAkambiClient) => (c.AKAMBI_PROVIDER === 'akambi' ? http : fake) },
  ],
  exports: [AKAMBI_CLIENT, FakeAkambiClient],
})
export class AcademyModule {}

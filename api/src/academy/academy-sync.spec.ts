import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../config/config.schema';
import type { DatabaseService } from '../database/database.service';
import { AcademySyncService } from './academy-sync.service';
import { InAppNotificationsService } from '../notifications/in-app-notifications.service';
import { FakeAkambiClient } from './akambi.client';

describe('AcademySyncService — configuration', () => {
  const database = { runAs: jest.fn() } as unknown as DatabaseService;
  const make = (config: Partial<AppConfig>) => new AcademySyncService(database, new FakeAkambiClient(), config as AppConfig, new InAppNotificationsService());

  afterEach(() => jest.clearAllMocks());

  it('webhook sans secret configuré, ou Academy désactivée : 503 avant toute lecture du corps', async () => {
    for (const config of [{ ACADEMY_ENABLED: true }, { ACADEMY_ENABLED: true, AKAMBI_WEBHOOK_SECRETS: ' , ' }, { ACADEMY_ENABLED: false, AKAMBI_WEBHOOK_SECRETS: 'whsec_a' }]) {
      await expect(make(config).handleWebhook('{}', 't=1,v1=00', 'evt')).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
    expect(database.runAs).not.toHaveBeenCalled();
  });

  it('rapprochement ignoré quand l’Academy est désactivée, sans appel à Akambi', async () => {
    const fake = new FakeAkambiClient();
    const list = jest.spyOn(fake, 'listEnrollments');
    const service = new AcademySyncService(database, fake, { ACADEMY_ENABLED: false } as AppConfig, new InAppNotificationsService());
    await expect(service.reconcileEnrollments()).resolves.toMatchObject({ skipped: true, reason: 'academy_disabled' });
    expect(list).not.toHaveBeenCalled();
    expect(database.runAs).not.toHaveBeenCalled();
  });
});

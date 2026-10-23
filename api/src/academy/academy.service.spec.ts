import { ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../config/config.schema';
import type { DatabaseService } from '../database/database.service';
import { AcademyService } from './academy.service';
import { FakeAkambiClient } from './akambi.client';

describe('AcademyService — Academy désactivée', () => {
  const database = { runAs: jest.fn() } as unknown as DatabaseService;
  const akambi = new FakeAkambiClient();
  const service = new AcademyService(database, akambi, { ACADEMY_ENABLED: false } as AppConfig);

  it('routes praticien : 503, sans lecture en base', async () => {
    await expect(service.listCourses('u1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getCourse('u1', 'c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(database.runAs).not.toHaveBeenCalled();
  });

  it('synchronisation : ignorée sans appel à Akambi ni écriture', async () => {
    const list = jest.spyOn(akambi, 'listCourses');
    await expect(service.syncCatalog()).resolves.toMatchObject({ skipped: true, reason: 'academy_disabled' });
    expect(list).not.toHaveBeenCalled();
    expect(database.runAs).not.toHaveBeenCalled();
  });
});

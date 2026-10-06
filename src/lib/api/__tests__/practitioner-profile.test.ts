import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../client';
import { getOwnPractitionerProfile } from '../practitioner-profile';
vi.mock('../client', () => ({ api: { get: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
it('normalise les coordonnées PostgreSQL pour les écrans utilisant toFixed', async () => {
  vi.mocked(api.get).mockResolvedValue({ id: 'p1', name: 'Praticien', latitude: '6.37030000', longitude: '2.39120000', kyc_status: 'approved' });
  const result = await getOwnPractitionerProfile();
  expect(result.latitude.toFixed(6)).toBe('6.370300');
  expect(result.longitude.toFixed(6)).toBe('2.391200');
  expect(result.kyc_status).toBe('approved');
  expect(api.get).toHaveBeenCalledWith('/practitioners/me');
});
it('préserve zéro et les coordonnées déjà numériques', async () => {
  vi.mocked(api.get).mockResolvedValue({ id: 'p1', name: 'Praticien', latitude: 0, longitude: 2.39 });
  expect(await getOwnPractitionerProfile()).toMatchObject({ latitude: 0, longitude: 2.39 });
});
it('remplace les coordonnées absentes ou invalides par null', async () => {
  vi.mocked(api.get).mockResolvedValue({ id: 'p1', name: 'Praticien', latitude: null, longitude: 'invalide' });
  expect(await getOwnPractitionerProfile()).toMatchObject({ latitude: null, longitude: null });
});

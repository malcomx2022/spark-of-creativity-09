import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NewAppointmentDialog as Dialog } from '../NewAppointmentDialog';

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
  }
  return { FakeApiError, get: vi.fn(), toast: vi.fn(), requestPosition: vi.fn() };
});

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get },
  errorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  isApiError: (error: unknown, status?: number) => error instanceof mocks.FakeApiError && (status === undefined || error.status === status),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: () => ({ position: null, requestPosition: mocks.requestPosition, loading: false, error: null, quality: null, isRefining: false }),
}));
// Disponibilités du praticien : tous les jours, 08:00–18:00.
vi.mock('@/hooks/useAvailability', () => ({
  usePractitionerAvailability: (id?: string) => ({ data: id ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `a${d}`, practitioner_id: id, day_of_week: d, start_time: '08:00:00', end_time: '18:00:00', is_active: true })) : [], isLoading: false }),
  usePractitionerExceptions: () => ({ data: [], isLoading: false }),
}));
// Recherche Mapbox remplacée par un bouton qui choisit une adresse (avec ou sans coordonnées).
vi.mock('../AddressSearchInput', () => ({
  AddressSearchInput: ({ onChange }: { onChange: (l: { address: string; latitude?: number; longitude?: number }) => void }) => (
    <div>
      <button type="button" onClick={() => onChange({ address: 'Rue 12.345, Haie Vive, Cotonou', latitude: 6.3654, longitude: 2.4183 })}>Adresse avec GPS</button>
      <button type="button" onClick={() => onChange({ address: 'Rue 12.345, Haie Vive, Cotonou' })}>Adresse sans GPS</button>
    </div>
  ),
}));

const PRACTITIONER = { id: 'prat-1', name: 'Inf. Koffi', specialty: 'infirmier' };
const REASON = 'Pansement post-opératoire à domicile';

beforeAll(() => {
  // Radix Select s'appuie sur ces API absentes de jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  // La file de toasts du composant est un état de module : un module neuf par test.
  vi.resetModules();
  mocks.get.mockImplementation((path: string) => {
    if (path === '/practitioners') return Promise.resolve([{ id: 'p', practitioner_type: 'infirmier' }, { id: 'q', practitioner_type: 'medecin' }]);
    if (path === `/practitioners/${PRACTITIONER.id}`) return Promise.resolve({ id: PRACTITIONER.id, available: true });
    return Promise.reject(new Error(`GET inattendu ${path}`));
  });
});
afterEach(cleanup);

async function renderDialog(props: Partial<Parameters<typeof Dialog>[0]> = {}) {
  const { NewAppointmentDialog } = await import('../NewAppointmentDialog');
  const onSubmit = vi.fn().mockResolvedValue({ id: 'rdv-1' });
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NewAppointmentDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />
    </QueryClientProvider>,
  );
  return { onSubmit, onOpenChange, user: userEvent.setup() };
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

async function pickTomorrow(user: ReturnType<typeof userEvent.setup>) {
  const target = tomorrow();
  await user.click(screen.getByRole('button', { name: /Sélectionnez une date/ }));
  const grid = await screen.findByRole('grid');
  if (target.getMonth() !== new Date().getMonth()) await user.click(screen.getByRole('button', { name: /next month/i }));
  const day = within(screen.getByRole('grid')).getAllByRole('gridcell', { name: String(target.getDate()) })
    .find((cell) => !cell.className.includes('day-outside') && !cell.hasAttribute('disabled'));
  expect(grid).toBeTruthy();
  await user.click(day!);
  return target;
}

async function choose(user: ReturnType<typeof userEvent.setup>, trigger: RegExp, option: string) {
  await user.click(screen.getByRole('combobox', { name: trigger }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function fillCommon(user: ReturnType<typeof userEvent.setup>) {
  const date = await pickTomorrow(user);
  await choose(user, /Heure souhaitée/, '09:00');
  await user.type(screen.getByPlaceholderText(/Décrivez brièvement/), REASON);
  return date;
}

it('formulaire incomplet : aucun envoi et les champs manquants sont signalés', async () => {
  const { user, onSubmit } = await renderDialog({ preselectedPractitioner: PRACTITIONER });
  await user.type(screen.getByPlaceholderText(/Décrivez brièvement/), 'Court');
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '❌ Formulaire incomplet', variant: 'destructive' })));
  const { description } = mocks.toast.mock.calls.find(([t]) => t.title === '❌ Formulaire incomplet')![0];
  expect(description).toContain('sélectionner une date');
  expect(description).toContain('choisir un créneau');
  expect(description).toContain('au moins 10 caractères');
  expect(onSubmit).not.toHaveBeenCalled();
});

it('praticien choisi : vérifie sa disponibilité puis envoie la demande avec son identifiant', async () => {
  const { user, onSubmit, onOpenChange } = await renderDialog({ preselectedPractitioner: PRACTITIONER });
  const date = await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(mocks.get).toHaveBeenCalledWith(`/practitioners/${PRACTITIONER.id}`);
  const payload = onSubmit.mock.calls[0][0];
  expect(payload).toMatchObject({ specialty: 'infirmier', time: '09:00', reason: REASON, urgencyLevel: 'non-urgent', practitionerId: 'prat-1', practitionerName: 'Inf. Koffi' });
  expect(new Date(payload.date).toDateString()).toBe(date.toDateString());
  // Le praticien vient chez le patient : ni coordonnées ni géolocalisation demandées.
  expect(payload).not.toHaveProperty('patientLat');
  expect(mocks.requestPosition).not.toHaveBeenCalled();
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("praticien indisponible : la demande n'est pas créée", async () => {
  mocks.get.mockImplementation((path: string) => Promise.resolve(path === '/practitioners' ? [] : { id: PRACTITIONER.id, available: false }));
  const { user, onSubmit, onOpenChange } = await renderDialog({ preselectedPractitioner: PRACTITIONER });
  await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '❌ Échec de création', description: "Ce praticien n'est pas disponible actuellement" })));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

it('praticien non validé (404) : message explicite, aucune création', async () => {
  mocks.get.mockImplementation((path: string) => (path === '/practitioners' ? Promise.resolve([]) : Promise.reject(new mocks.FakeApiError(404, 'Not found'))));
  const { user, onSubmit } = await renderDialog({ preselectedPractitioner: PRACTITIONER });
  await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Ce praticien n'est pas encore validé pour exercer" })));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('adresse saisie manuellement : la demande porte l’adresse et ses coordonnées GPS', async () => {
  const { user, onSubmit } = await renderDialog();
  await user.click(screen.getByRole('button', { name: /Saisir l'adresse manuellement/ }));
  await user.click(screen.getByRole('button', { name: 'Adresse avec GPS' }));
  await choose(user, /Catégorie de praticien/, 'Infirmier(ère)');
  await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0]).toMatchObject({ specialty: 'infirmier', time: '09:00', addressOverride: 'Rue 12.345, Haie Vive, Cotonou', patientLat: 6.3654, patientLon: 2.4183 });
  expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('practitionerId');
});

it("adresse manuelle sans coordonnées : refusée avant tout envoi", async () => {
  const { user, onSubmit } = await renderDialog();
  await user.click(screen.getByRole('button', { name: /Saisir l'adresse manuellement/ }));
  await user.click(screen.getByRole('button', { name: 'Adresse sans GPS' }));
  await choose(user, /Catégorie de praticien/, 'Infirmier(ère)');
  await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '📍 Coordonnées GPS requises' })));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('géolocalisation automatique sans position : refusée, la position est redemandée', async () => {
  const { user, onSubmit } = await renderDialog();
  await choose(user, /Catégorie de praticien/, 'Infirmier(ère)');
  await fillCommon(user);
  await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '📍 Localisation requise', variant: 'destructive' })));
  expect(mocks.requestPosition).toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompleteConsultationForm } from '../CompleteConsultationForm';

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post: mocks.post }, errorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback) }));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderForm() {
  const onOpenChange = vi.fn();
  const onCompleted = vi.fn();
  render(<CompleteConsultationForm open onOpenChange={onOpenChange} appointmentId="rdv-1" practitionerId="prat-1" patientName="Awa Patiente" onCompleted={onCompleted} />);
  return { onOpenChange, onCompleted, user: userEvent.setup() };
}

it('refuse la clôture sans observations cliniques ni diagnostic, sans appel API', async () => {
  const { user, onOpenChange, onCompleted } = renderForm();
  await user.type(screen.getByLabelText(/Observations cliniques/), 'Plaie propre');
  await user.click(screen.getByRole('button', { name: /Terminer la consultation/ }));
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Champs requis', variant: 'destructive' }));
  expect(onCompleted).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('envoie le compte rendu avec clôture du rendez-vous, puis ferme le dialogue', async () => {
  mocks.post.mockResolvedValue({ id: 'cr-1' });
  const { user, onOpenChange, onCompleted } = renderForm();
  expect(screen.getByText('Patient : Awa Patiente')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Motif de la consultation'), 'Fièvre');
  await user.type(screen.getByLabelText(/Observations cliniques/), 'Température 39 °C');
  await user.type(screen.getByLabelText(/Diagnostic principal/), 'Paludisme simple');
  await user.type(screen.getByLabelText(/Ordonnance/), 'Artéméther 3 jours');
  await user.type(screen.getByLabelText('Délai de suivi recommandé'), '7 jours');
  await user.click(screen.getByRole('button', { name: /Terminer la consultation/ }));

  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(mocks.post).toHaveBeenCalledTimes(1);
  const [path, body] = mocks.post.mock.calls[0];
  expect(path).toBe('/consultation-reports');
  // Valeurs du formulaire envoyées telles quelles : l'API convertit domicile/moderate et déduit le praticien.
  expect(body).toMatchObject({
    appointmentId: 'rdv-1',
    consultationType: 'domicile',
    severityLevel: 'moderate',
    consultationReason: 'Fièvre',
    clinicalFindings: 'Température 39 °C',
    primaryDiagnosis: 'Paludisme simple',
    treatmentPrescription: 'Artéméther 3 jours',
    followUpTimeframe: '7 jours',
    completeAppointment: true,
  });
  expect(body).not.toHaveProperty('practitionerId');
  expect(Number.isNaN(Date.parse(body.consultationDate))).toBe(false);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '✅ Consultation terminée' }));
});

it("garde la saisie et affiche l'erreur de l'API quand l'enregistrement échoue", async () => {
  mocks.post.mockRejectedValue(new Error('Rendez-vous déjà terminé'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { user, onOpenChange, onCompleted } = renderForm();
  await user.type(screen.getByLabelText(/Observations cliniques/), 'RAS');
  await user.type(screen.getByLabelText(/Diagnostic principal/), 'Entorse');
  await user.click(screen.getByRole('button', { name: /Terminer la consultation/ }));

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erreur', description: 'Rendez-vous déjà terminé', variant: 'destructive' })));
  expect(onCompleted).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Diagnostic principal/)).toHaveValue('Entorse');
  expect(screen.getByRole('button', { name: /Terminer la consultation/ })).toBeEnabled();
});

it("bloque les boutons pendant l'envoi et n'envoie qu'une fois", async () => {
  let resolve!: (value: unknown) => void;
  mocks.post.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { user, onCompleted } = renderForm();
  await user.type(screen.getByLabelText(/Observations cliniques/), 'RAS');
  await user.type(screen.getByLabelText(/Diagnostic principal/), 'Entorse');
  await user.click(screen.getByRole('button', { name: /Terminer la consultation/ }));

  const pending = screen.getByRole('button', { name: 'Enregistrement...' });
  expect(pending).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  await user.click(pending);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  resolve({ id: 'cr-1' });
  await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
});

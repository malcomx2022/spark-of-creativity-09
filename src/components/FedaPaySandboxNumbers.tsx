import { FEDAPAY_SANDBOX_TEST_NUMBERS } from '@/lib/fedapay-phone';

/** Liste des numéros de test affichée dans les widgets de paiement quand FedaPay est en sandbox. */
export function FedaPaySandboxNumbers({ showDeclined = true }: { showDeclined?: boolean }) {
  return (
    <ul className="space-y-1 text-xs">
      <li>✅ <strong>MTN succès :</strong> {FEDAPAY_SANDBOX_TEST_NUMBERS.mtnApproved}</li>
      <li>✅ <strong>Moov succès :</strong> {FEDAPAY_SANDBOX_TEST_NUMBERS.moovApproved}</li>
      {showDeclined && <li>❌ <strong>Échec simulé :</strong> {FEDAPAY_SANDBOX_TEST_NUMBERS.declined}</li>}
    </ul>
  );
}

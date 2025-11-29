# 📋 AUDIT DASHBOARD ADMIN - PROMPTS LOVABLE.DEV

**Date:** 2025-11-29
**Total:** 28 erreurs identifiées

---

## ERREUR #1 - console.log/console.error en production (KYCQueue)
```
Dans KYCQueue.tsx, remplace tous les console.log/console.error par un système de logging approprié:
Lignes 88, 179, 186, 205, 215, 222, 228, 248, 262, 297, 944, 963:

Remplace:
console.error('Error loading admin profiles:', profilesError);
console.log('[KYC Update] Starting mutation:', { id, status, comment });

Par:
if (import.meta.env.DEV) {
  console.error('Error loading admin profiles:', profilesError);
}

Fais de même pour TOUS les console.log/error dans KYCQueue.tsx
```

## ERREUR #2 - console.error en production (ApiManagementSection)
```
Dans ApiManagementSection.tsx ligne 77:
Remplace: console.error("Error updating FedaPay mode:", error);
Par: if (import.meta.env.DEV) { console.error("Error updating FedaPay mode:", error); }
```

## ERREUR #3 - Tous les tabs rendus simultanément (AdminDashboard)
```
Dans AdminDashboard.tsx, implémente le lazy loading des 10 tabs:
1. Crée des composants séparés dans src/components/admin/tabs/
2. Import avec React.lazy():
const KYCTab = lazy(() => import('@/components/admin/tabs/KYCTab'));
3. Enveloppe chaque TabsContent dans Suspense:
<TabsContent value="kyc">
  <Suspense fallback={<div className="text-center py-8">Chargement...</div>}>
    <KYCTab />
  </Suspense>
</TabsContent>

Fais de même pour dashboard, operations, finance, support, otp, api, compliance, audit.
```

## ERREUR #4 - Pagination manquante (AuditLogs)
```
Dans AuditLogs.tsx, ajoute une vraie pagination:
Actuellement limite à 100 sans pagination.

1. Ajoute un état: const [page, setPage] = useState(1);
2. Modifie la query:
   .limit(20)
   .range((page - 1) * 20, page * 20 - 1)
3. Ajoute des boutons Précédent/Suivant en bas
4. Affiche "Affichage X-Y sur Z entrées"
```

## ERREUR #5 - Pagination manquante (FinanceSection)
```
Dans FinanceSection.tsx, les queries limitent à 50 sans pagination:
Lignes 25 et 39:

1. Pour payments: const [paymentsPage, setPaymentsPage] = useState(1);
2. Pour payouts: const [payoutsPage, setPayoutsPage] = useState(1);
3. Modifie les queries pour utiliser .range((page - 1) * 20, page * 20 - 1)
4. Ajoute boutons "Voir plus" ou Précédent/Suivant
```

## ERREUR #6 - Stats calculées côté client (FinanceSection)
```
Dans FinanceSection.tsx lignes 46-51, les stats sont calculées côté client:

Déplace ce calcul côté serveur avec une edge function ou une view matérialisée:
CREATE VIEW admin_finance_stats AS
SELECT
  SUM(CASE WHEN status IN ('completed', 'paid') THEN amount ELSE 0 END) as total_revenue,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
  COUNT(CASE WHEN status IN ('completed', 'paid') THEN 1 END) as completed_payments
FROM payments;

Puis query: const { data: stats } = await supabase.from('admin_finance_stats').select('*').single();
```

## ERREUR #7 - Type assertion dangereuse (ComplianceSection)
```
Dans ComplianceSection.tsx ligne 135:
Remplace:
onValueChange={(value: any) => setNewConsentForm({ ...newConsentForm, consent_type: value })}

Par un type approprié:
type ConsentType = 'cgu' | 'charte' | 'partage_donnees' | 'marketing';
onValueChange={(value) => setNewConsentForm({ ...newConsentForm, consent_type: value as ConsentType })}
```

## ERREUR #8 - Queries non combinées (AdminManagement)
```
Dans AdminManagement.tsx lignes 39-67, deux queries séparées:

Combine en une seule avec Promise.all:
queryFn: async () => {
  const [rolesResult, profilesResult] = await Promise.all([
    supabase.from('user_roles').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, phone')
  ]);

  if (rolesResult.error) throw rolesResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const roles = rolesResult.data || [];
  const profiles = profilesResult.data || [];

  return roles.map(role => ({
    ...role,
    profile: profiles.find(p => p.id === role.user_id)
  }));
}
```

## ERREUR #9 - Pagination manquante (UsersManagementSection)
```
Dans UsersManagementSection.tsx, les listes de patients et praticiens n'ont pas de pagination:

1. Ajoute pour patients: const [patientsPage, setPage] = useState(1);
2. Ajoute pour practitioners: const [practitionersPage, setPage] = useState(1);
3. Modifie les queries pour ajouter .limit(20).range(...)
4. Affiche boutons de pagination en bas de chaque table
```

## ERREUR #10 - Pas de confirmation avant suppression massive (UsersManagementSection)
```
Dans UsersManagementSection.tsx lignes 107-132, l'AlertDialog est bon mais devrait demander confirmation explicite:

Ajoute un champ Input pour taper "SUPPRIMER" avant d'activer le bouton:
const [confirmText, setConfirmText] = useState('');

<Input
  placeholder="Tapez SUPPRIMER pour confirmer"
  value={confirmText}
  onChange={(e) => setConfirmText(e.target.value)}
/>
<AlertDialogAction
  onClick={() => cleanupMutation.mutate()}
  disabled={confirmText !== 'SUPPRIMER'}
>
  Supprimer
</AlertDialogAction>
```

## ERREUR #11 - Stats non mémoïsées (OperationsSection)
```
Dans OperationsSection.tsx lignes 98-103, les stats sont recalculées à chaque render:

Mémoïse avec useMemo:
const stats = useMemo(() => ({
  todayAppointments: appointments.length,
  pendingReviews: reviews.filter(r => !r.is_hidden && !r.moderated_at).length,
  openDisputes: disputes.filter(d => d.status === 'open').length,
  inProgressDisputes: disputes.filter(d => d.status === 'investigating').length,
}), [appointments, reviews, disputes]);
```

## ERREUR #12 - Pagination manquante (OperationsSection)
```
Dans OperationsSection.tsx, les queries limitent sans pagination:
- reviews limite 50 (ligne 41)
- disputes sans limite (ligne 54)

Ajoute pagination pour les deux:
1. const [reviewsPage, setPage] = useState(1);
2. const [disputesPage, setPage] = useState(1);
3. Modifie queries: .limit(20).range((page - 1) * 20, page * 20 - 1)
```

## ERREUR #13 - Realtime subscription sans nettoyage (KYCQueue)
```
Dans KYCQueue.tsx lignes 148-175, la subscription realtime est bien nettoyée, mais vérifie:

Le channel est correctement nettoyé dans le return. C'est OK.
Mais ajoute une gestion d'erreur:
.on('postgres_changes', { ... }, (payload) => {
  try {
    handleChange(payload);
  } catch (error) {
    console.error('Realtime error:', error);
  }
})
```

## ERREUR #14 - Fonction renderStars non mémoïsée (OperationsSection)
```
Dans OperationsSection.tsx lignes 105-113, renderStars devrait être en dehors du composant ou mémoïsée:

Déplace en dehors du composant:
const renderStars = (rating: number) => {
  return Array.from({ length: 5 }, (_, i) => (
    <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
  ));
};

export function OperationsSection() {
  // reste du code
```

## ERREUR #15 - Type assertion (ComplianceSection)
```
Dans ComplianceSection.tsx ligne 74:
Remplace: onSuccess: () => {
Par un type pour value:

type SystemConfigValue = string | number | boolean | object;
updateConfigMutation: async ({ key, value }: { key: string; value: SystemConfigValue }) => {
```

## ERREUR #16 - État dialog éparpillé (KYCQueue)
```
Dans KYCQueue.tsx lignes 50-53, 4 états séparés pour les dialogs:

Utilise un reducer ou combine en un seul état:
const [dialogState, setDialogState] = useState({
  approve: false,
  incomplete: false,
  reject: false,
  selectedPractitioner: null,
  comment: '',
});

Simplifie la gestion des dialogs avec cet état unifié.
```

## ERREUR #17 - Chargement URLs documents inefficace (KYCQueue)
```
Dans KYCQueue.tsx lignes 272-310, les URLs sont chargées en boucle:

Optimise avec Promise.all et charge seulement pour les praticiens visibles:
const loadDocumentUrls = async (practitionerIds: string[]) => {
  const urlPromises = practitionerIds.map(async (id) => {
    const practitioner = practitioners.find(p => p.id === id);
    if (!practitioner || documentUrls[id]) return;

    const [idUrl, licenseUrl, insuranceUrl] = await Promise.all([...]);
    return { id, urls: { idUrl, licenseUrl, insuranceUrl } };
  });

  const results = await Promise.all(urlPromises);
  // update state once
};

Appelle seulement pour les 10 premiers praticiens affichés (pagination).
```

## ERREUR #18 - Pas de pagination (SupportSection)
```
Dans SupportSection.tsx, les queries n'ont pas de pagination:
- tickets sans limite (ligne 26)
- faqs sans limite (ligne 38)

Ajoute pagination:
1. const [ticketsPage, setPage] = useState(1);
2. const [faqsPage, setPage] = useState(1);
3. Modifie queries: .limit(20).range(...)
```

## ERREUR #19 - Stats non mémoïsées (SupportSection)
```
Dans SupportSection.tsx lignes 62-67, mémoïse les stats:

const stats = useMemo(() => ({
  openTickets: tickets.filter(t => t.status === 'ouvert').length,
  inProgressTickets: tickets.filter(t => t.status === 'en_cours').length,
  totalFaqs: faqs.length,
  publishedFaqs: faqs.filter(f => f.is_published).length,
}), [tickets, faqs]);
```

## ERREUR #20 - Pas de gestion erreur export (FinanceSection)
```
Dans FinanceSection.tsx ligne 138-141, le bouton Export n'a pas de handler:

Implémente handleExport:
const handleExportPayments = async () => {
  try {
    const csv = payments.map(p =>
      `${p.created_at},${p.patient_id},${p.amount},${p.payment_method},${p.status}`
    ).join('\n');

    const header = 'Date,Patient,Montant,Méthode,Statut\n';
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paiements-${new Date().toISOString()}.csv`;
    a.click();
    toast({ title: "Export réussi" });
  } catch (error) {
    toast({ title: "Erreur d'export", variant: "destructive" });
  }
};
```

## ERREUR #21 - Queries sans limite (ComplianceSection)
```
Dans ComplianceSection.tsx:
- consent_versions sans limite (ligne 29)
- system_config sans limite (ligne 43)

Ajoute des limites raisonnables:
.limit(50)

Et implémente pagination si plus de 50 entrées.
```

## ERREUR #22 - État initial selectedMode vide (ApiManagementSection)
```
Dans ApiManagementSection.tsx ligne 18, selectedMode est vide au départ:

Initialise avec la valeur actuelle:
useEffect(() => {
  if (currentConfig?.mode && !selectedMode) {
    setSelectedMode(currentConfig.mode);
  }
}, [currentConfig]);
```

## ERREUR #23 - Bouton Update sans vérification (ApiManagementSection)
```
Dans ApiManagementSection.tsx ligne 82-86, handleUpdateMode devrait vérifier:

Ajoute une confirmation avant changement de mode:
const handleUpdateMode = () => {
  if (selectedMode && selectedMode !== currentConfig?.mode) {
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir passer en mode ${selectedMode} ? Cette action affectera tous les paiements.`
    );
    if (!confirmed) return;
    updateModeMutation.mutate(selectedMode);
  }
};

Ou mieux: utilise un AlertDialog React au lieu de window.confirm.
```

## ERREUR #24 - Tous les logs chargés (AuditLogs)
```
Dans AuditLogs.tsx ligne 22, limite à 100 logs:

C'est bien, mais ajoute:
1. Un bouton "Charger plus" qui incrémente la limite
2. Ou une pagination vraie avec page/limit
3. Ou un infinite scroll avec useInfiniteQuery
```

## ERREUR #25 - Filtrage côté client (AuditLogs)
```
Dans AuditLogs.tsx lignes 44-52, le filtrage se fait côté client:

Déplace le filtrage côté serveur dans la query:
queryFn: async () => {
  let query = supabase
    .from('admin_audit_logs')
    .select('*, profiles!admin_id(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filterEntity !== 'all') {
    query = query.eq('entity_type', filterEntity);
  }

  if (searchTerm) {
    query = query.or(`action.ilike.%${searchTerm}%,entity_id.ilike.%${searchTerm}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
},
queryKey: ['audit-logs', filterEntity, searchTerm],
```

## ERREUR #26 - Stats calculées côté client (AdminDashboard)
```
Dans AdminDashboard.tsx ligne 89, stats?.totalRevenue est calculé dans useAdminStats:

Vérifie que le hook useAdminStats utilise une query SQL agrégée et pas un calcul côté client:
SELECT
  COUNT(DISTINCT patients) as patients_count,
  COUNT(DISTINCT practitioners) as practitioners_count,
  COUNT(appointments) as appointments_count,
  SUM(CASE WHEN payments.status IN ('completed', 'paid') THEN amount ELSE 0 END) as total_revenue
FROM ...

Si le calcul est côté client, déplace-le dans une view SQL.
```

## ERREUR #27 - Pas de debounce sur search (AuditLogs, UsersManagementSection)
```
Dans AuditLogs.tsx ligne 73 et UsersManagementSection.tsx ligne 103:
Le onChange du search refiltrer à chaque caractère.

Ajoute un debounce:
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const [searchInput, setSearchInput] = useState('');
const searchTerm = useDebouncedValue(searchInput, 300);

<Input
  value={searchInput}
  onChange={(e) => setSearchInput(e.target.value)}
/>

Utilise searchTerm dans le filtrage (debounced).
```

## ERREUR #28 - Mutation sans loading state (ComplianceSection)
```
Dans ComplianceSection.tsx, les mutations createConsentMutation et updateConfigMutation n'ont pas de loading state visible:

Ajoute un indicateur de chargement sur les boutons:
<Button
  onClick={() => createConsentMutation.mutate(newConsentForm)}
  disabled={createConsentMutation.isPending}
>
  {createConsentMutation.isPending ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Création...
    </>
  ) : (
    'Créer'
  )}
</Button>
```

---

## 📈 PLAN D'ACTION RECOMMANDÉ

### Phase 1: Corrections critiques (Priorité 1)
1. ✅ Corriger #1, #2 (console.log en production)
2. ✅ Corriger #10, #23 (confirmations avant actions critiques)
3. ✅ Corriger #17 (chargement inefficace documents KYC)

### Phase 2: Performance (Priorité 2)
4. ✅ Corriger #3 (lazy loading tabs)
5. ✅ Corriger #4, #5, #9, #12, #18, #21 (pagination manquante)
6. ✅ Corriger #6, #26 (stats côté serveur)
7. ✅ Corriger #11, #19 (mémoïsation)
8. ✅ Corriger #25, #27 (filtrage + debounce)

### Phase 3: Qualité code (Priorité 3)
9. ✅ Corriger #7, #15 (type assertions)
10. ✅ Corriger #8 (queries combinées)
11. ✅ Corriger #13, #14, #16 (refactoring)
12. ✅ Corriger #20, #28 (UX améliorations)

### Phase 4: Fonctionnalités (Priorité 4)
13. ✅ Corriger #22, #24 (améliorations mineures)

---

## 📝 NOTES IMPORTANTES

### Composants analysés
- `AdminDashboard.tsx` (240 lignes)
- `AdminManagement.tsx` (336 lignes)
- `KYCQueue.tsx` (1024 lignes) ⚠️ TRÈS LONG
- `UsersManagementSection.tsx` (273 lignes)
- `FinanceSection.tsx` (200+ lignes)
- `OperationsSection.tsx` (200+ lignes)
- `SupportSection.tsx` (150+ lignes)
- `ComplianceSection.tsx` (150+ lignes)
- `ApiManagementSection.tsx` (100 lignes)
- `AuditLogs.tsx` (100 lignes)

### Bonnes pratiques identifiées ✅
- Utilisation de React Query pour le cache
- Séparation claire des sections admin par domaine
- Système d'audit logs implémenté
- Gestion des rôles admin (super_admin, ops, finance, etc.)
- Realtime subscriptions pour KYC

### Points d'attention ⚠️
- KYCQueue.tsx est TROP LONG (1024 lignes) - devrait être découpé
- Aucun test unitaire pour les composants admin
- Pas de rate limiting sur les actions critiques
- Pas de 2FA pour les actions sensibles (suppression, changement mode paiement)
- Accessibilité (a11y) non testée

### Recommandations supplémentaires
1. **URGENT**: Découper KYCQueue.tsx en sous-composants (KYCDocumentViewer, KYCHistoryDialog, KYCActionButtons, etc.)
2. Implémenter 2FA pour actions critiques (suppression comptes, changement mode FedaPay)
3. Ajouter rate limiting sur les edge functions admin
4. Créer des tests E2E avec Playwright pour le workflow KYC complet
5. Implémenter un système de rollback pour les configurations système
6. Ajouter monitoring APM spécifique pour les actions admin
7. Créer une page de statistiques avec graphiques (revenue over time, KYC approval rate, etc.)

---

**Rapport généré le:** 2025-11-29
**Analysé par:** Claude Code
**Version:** 1.0

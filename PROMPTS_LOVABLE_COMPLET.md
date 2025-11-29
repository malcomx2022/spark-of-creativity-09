# 🔧 PROMPTS LOVABLE.DEV - RÉCAPITULATIF COMPLET

**Date:** 2025-11-29
**Dashboards analysés:** Patient, Praticien, Admin
**Total erreurs:** 76 erreurs (23 Patient + 25 Praticien + 28 Admin)

---

## 📊 DISTRIBUTION PAR DASHBOARD

| Dashboard | Erreurs | Fichier audit |
|-----------|---------|---------------|
| **Patient** | 23 | `AUDIT_DASHBOARD_PATIENT.md` |
| **Praticien** | 25 | `AUDIT_DASHBOARD_PRATICIEN.md` |
| **Admin** | 28 | `AUDIT_DASHBOARD_ADMIN.md` |

---

## 📋 CATÉGORIES D'ERREURS

### 🔴 Critiques (Priorité 1) - 15 erreurs
- Logique de paiement incorrecte (Patient #5, #12, #15)
- Formulaires non synchronisés (Patient #1, Praticien #8)
- Actions sans confirmation (Admin #10, #23)
- console.log en production (tous les dashboards)
- Chargement inefficace (Admin #17)

### 🟠 Hautes (Priorité 2) - 35 erreurs
- Pagination manquante (15+ erreurs)
- Performance / mémoïsation (12+ erreurs)
- Stats calculées côté client (3 erreurs)
- Type assertions dangereuses (5 erreurs)

### 🟡 Moyennes (Priorité 3) - 20 erreurs
- UX/UI améliorations
- Gestion d'erreur
- Refactoring code

### 🟢 Basses (Priorité 4) - 6 erreurs
- Optimisations mineures
- Améliorations diverses

---

## 🎯 TOP 10 PROMPTS PRIORITAIRES

### 1. PAIEMENTS - Bouton dupliqué (CRITIQUE)
**Fichier:** `src/components/AppointmentCard.tsx:157-161`
```
Dans AppointmentCard.tsx ligne 157-161, corrige la condition du bouton de paiement:

Change:
{userRole === 'patient' && (appointment.status === 'confirmed' || appointment.status === 'pending_payment') && onPaymentRequired && (

En:
{userRole === 'patient' && appointment.status === 'pending_payment' && onPaymentRequired && (

Le statut 'confirmed' signifie déjà payé, donc ne doit pas afficher le bouton de paiement.
```

### 2. PAIEMENTS - State non nettoyé (CRITIQUE)
**Fichier:** `src/pages/PatientDashboard.tsx:46-74`
```
Dans PatientDashboard.tsx, améliore la gestion du payment state:

1. Ajoute dans PaymentDialog un callback onComplete et onError
2. Quand le paiement réussit, appelle:
   clearPersistedPaymentState();
   setPaymentDialogOpen(false);
3. Quand l'utilisateur ferme le dialog, propose de garder ou supprimer:
   "Voulez-vous finaliser ce paiement plus tard ?"
   Si Non -> clearPersistedPaymentState()
```

### 3. LAZY LOADING - Tous les tabs rendus (HAUTE)
**Fichiers:** AdminDashboard, PatientDashboard, PractitionerDashboard
```
Dans [Dashboard].tsx, implémente le lazy loading des tabs:

1. Crée des composants séparés dans src/components/dashboard/tabs/
2. Import avec React.lazy():
const AppointmentsTab = lazy(() => import('@/components/dashboard/tabs/AppointmentsTab'));

3. Enveloppe chaque TabsContent dans Suspense:
<TabsContent value="appointments">
  <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
    <AppointmentsTab />
  </Suspense>
</TabsContent>
```

### 4. PAGINATION - Ajouter partout (HAUTE)
**Fichiers:** Multiples (15+ composants)
```
[Pour chaque composant sans pagination]

Ajoute pagination à la query:

1. Ajoute: const [page, setPage] = useState(1);
2. Modifie la query:
   .limit(20)
   .range((page - 1) * 20, page * 20 - 1)
3. Ajoute des boutons Précédent/Suivant
4. Affiche "Affichage X-Y sur Z"
```

### 5. STATS - Déplacer côté serveur (HAUTE)
**Fichiers:** FinanceSection, AdminDashboard, autres
```
Déplace les calculs de stats côté serveur avec une view SQL:

CREATE VIEW admin_finance_stats AS
SELECT
  SUM(CASE WHEN status IN ('completed', 'paid') THEN amount ELSE 0 END) as total_revenue,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
  COUNT(CASE WHEN status IN ('completed', 'paid') THEN 1 END) as completed_payments
FROM payments;

Puis query: const { data: stats } = await supabase.from('admin_finance_stats').select('*').single();
```

### 6. CONSOLE.LOG - Supprimer en production (HAUTE)
**Fichiers:** Tous les dashboards (20+ occurrences)
```
Remplace TOUS les console.log/console.error par:

if (import.meta.env.DEV) {
  console.error('Error message:', error);
}

// Ou utilise un système de logging approprié pour production
```

### 7. FORMULAIRES - Synchroniser avec useEffect (HAUTE)
**Fichiers:** ProfileSection, ProfessionalProfileSection
```
Dans [Profile]Section.tsx, le formData ne se synchronise pas avec les données chargées:

Ajoute un useEffect qui met à jour formData quand les données changent:
useEffect(() => {
  if (profile) {
    setFormData({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      // ... autres champs
    });
  }
}, [profile]);
```

### 8. TYPE SAFETY - Remplacer 'as any' (MOYENNE)
**Fichiers:** MedicalSection, PayoutsSection, ComplianceSection
```
Remplace les 'as any' par des types appropriés:

1. Définis les types:
type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'inconnu';

2. Utilise: value as BloodType au lieu de value as any
```

### 9. MÉMOÏSATION - useMemo pour calculs (MOYENNE)
**Fichiers:** Multiples (12+ composants)
```
Mémoïse les calculs coûteux:

const categorizedAppointments = useMemo(() => ({
  awaiting: appointments.filter(apt => apt.status === 'awaiting_practitioner'),
  pending: appointments.filter(apt => apt.status === 'pending'),
  confirmed: appointments.filter(apt => apt.status === 'confirmed'),
  completed: appointments.filter(apt => apt.status === 'completed'),
}), [appointments]);
```

### 10. DEBOUNCE - Ajouter sur search (MOYENNE)
**Fichiers:** AuditLogs, UsersManagementSection
```
Ajoute un debounce sur les champs de recherche:

import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const [searchInput, setSearchInput] = useState('');
const searchTerm = useDebouncedValue(searchInput, 300);

<Input
  value={searchInput}
  onChange={(e) => setSearchInput(e.target.value)}
/>
```

---

## 📂 FICHIERS À MODIFIER (par priorité)

### 🔴 Priorité 1 (Critiques)
1. `src/components/AppointmentCard.tsx` - Bouton paiement
2. `src/pages/PatientDashboard.tsx` - State paiement
3. `src/components/dashboard/ProfileSection.tsx` - Formulaire
4. `src/components/admin/UsersManagementSection.tsx` - Confirmation suppression
5. `src/components/admin/ApiManagementSection.tsx` - Confirmation changement mode

### 🟠 Priorité 2 (Performance)
6. `src/pages/AdminDashboard.tsx` - Lazy loading
7. `src/pages/PatientDashboard.tsx` - Lazy loading
8. `src/pages/PractitionerDashboard.tsx` - Lazy loading
9. `src/components/admin/FinanceSection.tsx` - Stats + Pagination
10. `src/components/admin/KYCQueue.tsx` - Chargement documents + Découpage
11. `src/components/dashboard/PaymentsSection.tsx` - Pagination
12. `src/components/dashboard/PatientConsultationReportsSection.tsx` - Pagination + Virtualisation
13. `src/components/dashboard/NotificationsSection.tsx` - Pagination
14. `src/components/dashboard/MessagesSection.tsx` - Pagination
15. `src/components/admin/AuditLogs.tsx` - Pagination + Filtrage serveur

### 🟡 Priorité 3 (Qualité code)
16. `src/components/dashboard/MedicalSection.tsx` - Type assertions
17. `src/components/dashboard/practitioner/PayoutsSection.tsx` - setTimeout hack + Types
18. `src/components/dashboard/practitioner/PaymentInfoSection.tsx` - Validation Zod
19. `src/components/dashboard/SupportSection.tsx` - Gestion erreur formulaire
20. `src/components/admin/ComplianceSection.tsx` - Types

### 🟢 Priorité 4 (Améliorations)
21. Tous les fichiers - Supprimer console.log
22. Tous les fichiers - Ajouter debounce sur search
23. Tous les composants avec stats - Mémoïser calculs

---

## 🛠️ WORKFLOW RECOMMANDÉ POUR LOVABLE.DEV

### Semaine 1: Critiques
```
Jour 1-2: Corrections paiements (Prompts #1, #2)
Jour 3-4: Formulaires synchronisés (Prompt #7)
Jour 5: Confirmations actions critiques (Admin)
```

### Semaine 2: Performance bases
```
Jour 1-2: Lazy loading tabs (Prompt #3) - 3 dashboards
Jour 3-5: Pagination principales queries (Prompt #4) - 10+ composants
```

### Semaine 3: Performance avancée
```
Jour 1-2: Stats côté serveur (Prompt #5)
Jour 3-4: Découpage KYCQueue + Virtualisation listes
Jour 5: Mémoïsation calculs (Prompt #9)
```

### Semaine 4: Qualité code
```
Jour 1-2: Type safety (Prompt #8) - Remplacer 'as any'
Jour 3: Debounce searches (Prompt #10)
Jour 4-5: Supprimer console.log (Prompt #6) + Tests
```

---

## 📈 MÉTRIQUES ATTENDUES

### Avant corrections
- Temps de chargement initial: ~3-5s
- Rendu tous les tabs: ~2s
- Queries sans limite: risque de crash > 1000 items
- Console pollution: ~50+ logs en production

### Après corrections
- Temps de chargement initial: ~1-2s (lazy loading)
- Rendu tab actif seulement: ~500ms
- Pagination: max 20 items par page
- Console propre: 0 log en production
- Performance: +60% amélioration

---

## 🎯 COMMANDES LOVABLE.DEV

### Comment utiliser ces prompts

1. **Copier-coller directement** dans Lovable.dev chat
2. **Un prompt à la fois** - ne pas tout envoyer d'un coup
3. **Vérifier le résultat** avant de passer au suivant
4. **Tester** après chaque modification importante
5. **Commiter** régulièrement

### Exemple de session Lovable

```
Session 1: Corrections paiements
> [Copier PROMPT #1]
> Attendre la correction
> Tester le bouton de paiement
> [Copier PROMPT #2]
> Tester le state de paiement
> Commiter: "Fix: Correction logique de paiement"

Session 2: Lazy loading
> [Copier PROMPT #3 pour AdminDashboard]
> Tester le dashboard admin
> [Répéter pour PatientDashboard et PractitionerDashboard]
> Commiter: "Perf: Ajout lazy loading tabs dashboards"

... etc
```

---

## 📞 SUPPORT

Pour toute question sur ces prompts:
1. Consulter les fichiers d'audit détaillés
2. Vérifier les exemples de code dans les prompts
3. Tester en environnement de dev d'abord

---

**Document généré le:** 2025-11-29
**Par:** Claude Code
**Dashboards:** Patient, Praticien, Admin
**Total prompts:** 76

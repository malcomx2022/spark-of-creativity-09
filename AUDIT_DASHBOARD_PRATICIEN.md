# 📋 AUDIT DASHBOARD PRATICIEN - PROMPTS LOVABLE.DEV

**Date:** 2025-11-28
**Total:** 25 erreurs identifiées

---

## ERREUR #1 - console.error en production
```
Dans PractitionerDashboard.tsx, remplace tous les console.error par un système de logging approprié:
Lignes 128, 184, 229:
Remplace: console.error('Erreur lors de l\'acceptation', error);
Par: if (import.meta.env.DEV) { console.error('Error:', error); }
Fais de même pour tous les console.log/error dans le dashboard praticien.
```

## ERREUR #2 - Filtrage non mémoïsé des rendez-vous
```
Dans PractitionerDashboard.tsx lignes 238-241, mémoïse le filtrage des rendez-vous:
import { useMemo } from 'react';

const categorizedAppointments = useMemo(() => ({
  awaiting: appointments.filter(apt => apt.status === 'awaiting_practitioner'),
  pending: appointments.filter(apt => apt.status === 'pending'),
  confirmed: appointments.filter(apt => apt.status === 'confirmed'),
  completed: appointments.filter(apt => apt.status === 'completed'),
}), [appointments]);

Utilise ensuite categorizedAppointments.awaiting, etc.
```

## ERREUR #3 - Tous les tabs rendus simultanément
```
Dans PractitionerDashboard.tsx, implémente le lazy loading des 12 tabs:
1. Crée des composants séparés dans src/components/dashboard/practitioner/tabs/
2. Import avec React.lazy():
const AppointmentsTab = lazy(() => import('@/components/dashboard/practitioner/tabs/AppointmentsTab'));
3. Enveloppe chaque TabsContent dans Suspense:
<TabsContent value="appointments">
  <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
    <AppointmentsTab />
  </Suspense>
</TabsContent>
```

## ERREUR #4 - console.log en production (PayoutsSection)
```
Dans PayoutsSection.tsx lignes 45, 58, supprime ou conditionne les console.log:
Ligne 45: console.log('🔄 Configuration realtime balance praticien:', practitionerId);
Ligne 58: console.log('💰 Balance mise à jour:', payload);

Remplace par:
if (import.meta.env.DEV) {
  console.log('....');
}
```

## ERREUR #5 - setTimeout hack dans useEffect
```
Dans PayoutsSection.tsx ligne 62-70, remplace le setTimeout(0) hack:
Au lieu de:
setTimeout(() => {
  toast({ title: "Balance mise à jour", description: `...` });
}, 0);

Utilise useEffect avec un état:
const [balanceUpdate, setBalanceUpdate] = useState(null);
useEffect(() => {
  if (balanceUpdate) {
    toast({ title: "Balance mise à jour", description: balanceUpdate });
    setBalanceUpdate(null);
  }
}, [balanceUpdate]);

Et dans le callback: setBalanceUpdate(`Nouveau solde: ...`);
```

## ERREUR #6 - Type assertion dangereuse
```
Dans PayoutsSection.tsx ligne 63:
Remplace: const newBalance = payload.new as any;
Par un type approprié:
type PractitionerBalance = {
  balance_available: number;
  balance_pending: number;
  balance_on_hold: number;
};
const newBalance = payload.new as PractitionerBalance;
```

## ERREUR #7 - Queries sans pagination
```
Dans PayoutsSection.tsx, ajoute pagination aux queries:
1. Pour payments (ligne 81-96):
const [paymentsLimit, setPaymentsLimit] = useState(20);
.order("created_at", { ascending: false })
.limit(paymentsLimit)

2. Pour payouts (ligne 99-111):
const [payoutsLimit, setPayoutsLimit] = useState(20);
.order("created_at", { ascending: false })
.limit(payoutsLimit)

3. Ajoute boutons "Voir plus"
```

## ERREUR #8 - formData non synchronisé (ProfessionalProfileSection)
```
Dans ProfessionalProfileSection.tsx, le formData initialise avec practitionerData qui est undefined au départ (ligne 34-42).
Change l'initialisation en valeurs vides:
const [formData, setFormData] = useState({
  bio: "",
  diplomas: "",
  languages: "",
  years_experience: 0,
  intervention_radius: 10,
  communes_served: "",
  license_number: "",
});

Le useEffect ligne 44-50 gérera la synchronisation quand les données arrivent.
```

## ERREUR #9 - Vérification HEAD synchrone avant ouverture
```
Dans ProfessionalProfileSection.tsx ligne 150, la vérification HEAD bloque l'UI:
const checkResponse = await fetch(url, { method: 'HEAD' });

Améliore en:
1. Affiche un spinner pendant la vérification
2. Ouvre le document immédiatement et laisse le navigateur gérer l'erreur 404
3. Ou utilise un try/catch plus élégant avec toast seulement si échec
```

## ERREUR #10 - exceptionDates non mémoïsé
```
Dans AvailabilitySection.tsx ligne 33-38, mémoïse avec useMemo:
Actuellement recalculé à chaque render.
C'est déjà fait, mais assure-toi que la dépendance [exceptions] est correcte et pas manquante.
```

## ERREUR #11 - Trop de state local (PaymentInfoSection)
```
Dans PaymentInfoSection.tsx, réduis la complexité des états:
Au lieu de 5 états séparés (formState, formErrors, isVerified, hasChanges, pendingAction),
utilise un reducer ou combine certains états:
const [formContext, setFormContext] = useState({
  data: {...},
  errors: {},
  isVerified: false,
  hasChanges: false,
  pendingAction: null,
});
```

## ERREUR #12 - Validation devrait être dans Zod
```
Dans PaymentInfoSection.tsx ligne 255-295, la validation manuelle complexe devrait utiliser Zod:
Crée un schéma Zod pour chaque payment_method:
const mtnSchema = z.object({
  accountHolderName: z.string().min(1),
  phoneNumber: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
});

Utilise form.parse() au lieu de validateForm()
```

## ERREUR #13 - Slice arbitraire sans vraie pagination
```
Dans CareNotesSection.tsx ligne 192, .slice(0, 10) limite à 10 sans pagination:
Remplace par:
1. Un état: const [notesLimit, setNotesLimit] = useState(10);
2. Affiche: completedAppointments.slice(0, notesLimit).map(...)
3. Bouton "Voir plus": onClick={() => setNotesLimit(prev => prev + 10)}
4. Affiche "Affichage X sur Y consultations"
```

## ERREUR #14 - Pas de confirmation avant partage
```
Dans CareNotesSection.tsx ligne 120-175, ajoute confirmation avant partage:
const handleShare = async () => {
  const confirmed = window.confirm(
    `Êtes-vous sûr de vouloir partager cette note avec le patient ? Une notification lui sera envoyée.`
  );
  if (!confirmed) return;

  // reste du code...
}

Ou mieux: utilise un Dialog React au lieu de window.confirm
```

## ERREUR #15 - Auto-save localStorage toutes les 30s
```
Dans ConsultationReportSection.tsx ligne 102-126, optimise l'auto-save:
1. Change 30s à 60s minimum (30000 -> 60000)
2. Ajoute un debounce pour sauvegarder seulement si l'utilisateur arrête de taper
3. Affiche un indicateur visuel "Brouillon sauvegardé" quand ça arrive
4. Nettoie les brouillons > 24h au montage (ligne 157) - c'est déjà bon
```

## ERREUR #16 - window.confirm au lieu de Dialog React
```
Dans ConsultationReportSection.tsx ligne 144, remplace window.confirm:
Au lieu de: const restore = window.confirm(`Un brouillon...`);

Utilise un Dialog React avec des boutons clairs:
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Brouillon trouvé</AlertDialogTitle>
      <AlertDialogDescription>
        Un brouillon sauvegardé a été trouvé ({Math.round(hoursSince)}h). Voulez-vous le restaurer ?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => localStorage.removeItem(draftKey)}>
        Non, supprimer
      </AlertDialogCancel>
      <AlertDialogAction onClick={() => { form.reset(parsed); }}>
        Oui, restaurer
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## ERREUR #17 - Pas de pagination pour allReports
```
Dans ConsultationReportSection.tsx, la liste des rapports (ligne 320-370) n'a pas de pagination:
1. Ajoute un état: const [reportsPage, setReportsPage] = useState(1);
2. Limite la query: .limit(20).range((reportsPage - 1) * 20, reportsPage * 20 - 1)
3. Ajoute boutons Précédent/Suivant
4. Affiche "Page X sur Y"
```

## ERREUR #18 - Formulaire trop long (600+ lignes)
```
Dans ConsultationReportSection.tsx ligne 373-640, découpe le formulaire en composants:
1. Crée ConsultationReportForm.tsx
2. Découpe en sections: GeneralInfoSection, PatientStateSection, TreatmentSection, StatusSection
3. Import et utilise ces sections dans le composant principal
4. Chaque section gère sa propre logique
```

## ERREUR #19 - Pas de pagination (ReviewsSection)
```
Dans ReviewsSection.tsx, ajoute pagination pour les reviews:
1. Modifie le hook usePractitionerReviews pour accepter { page, limit }
2. Ajoute: const [page, setPage] = useState(1);
3. Dans la query: .limit(10).range((page - 1) * 10, page * 10 - 1)
4. Affiche boutons Précédent/Suivant
```

## ERREUR #20 - Distribution non mémoïsée
```
Dans ReviewsSection.tsx, le calcul stats.distribution ligne 93-106 pourrait bénéficier d'une mémoïsation si stats change souvent.
Vérifie si stats est stable ou ajoute useMemo si nécessaire.
```

## ERREUR #21 - Nom patient manquant dans reviews
```
Dans ReviewsSection.tsx ligne 129, affiche "Patient" sans le nom:
Modifie le hook usePractitionerReviews pour faire un JOIN avec profiles:
.select('*, profiles!patient_id(full_name)')

Ensuite affiche:
<p className="font-medium">{review.profiles?.full_name || 'Patient anonyme'}</p>
```

## ERREUR #22 - Pas de pagination rendez-vous
```
Dans PractitionerDashboard.tsx, les listes de rendez-vous n'ont pas de pagination:
Pour awaitingAppointments, confirmedAppointments, completedAppointments:
1. Limite initial à 10 rendez-vous par catégorie
2. Bouton "Voir tout" qui affiche un dialog avec pagination complète
3. Ou implémente infinite scroll avec useInfiniteQuery
```

## ERREUR #23 - Temps total calculé incorrectement
```
Dans PractitionerDashboard.tsx ligne 389-391:
{appointments.reduce((acc, apt) => acc + apt.duration, 0)} min

Problème: compte TOUS les rendez-vous (y compris annulés/rejetés).
Filtre pour "Ce mois":
{appointments
  .filter(apt => {
    const aptDate = new Date(apt.date);
    const now = new Date();
    return aptDate.getMonth() === now.getMonth() &&
           aptDate.getFullYear() === now.getFullYear() &&
           ['confirmed', 'completed'].includes(apt.status);
  })
  .reduce((acc, apt) => acc + apt.duration, 0)} min
```

## ERREUR #24 - Export PDF sans gestion erreur
```
Dans PayoutsSection.tsx ligne 168-209, l'export PDF devrait gérer les erreurs:
Enveloppe dans try/catch:
try {
  const doc = new jsPDF();
  // ... code export
  doc.save(`rapport-reversements-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  toast({ title: "Export réussi" });
} catch (error) {
  console.error('PDF export error:', error);
  toast({
    title: "Erreur d'export",
    description: "Impossible de générer le PDF",
    variant: "destructive"
  });
}
```

## ERREUR #25 - Statut KYC mal géré
```
Dans PractitionerDashboard.tsx ligne 290-307, la logique KYC est répétée:
Crée une fonction helper:
const getKYCMessage = (kyc_status: string, kyc_comment?: string) => {
  const messages = {
    pending: "Votre dossier est en cours de vérification...",
    incomplete: `Des documents sont manquants. ${kyc_comment || ''}`,
    rejected: `Votre dossier n'a pas été validé. ${kyc_comment || ''}`,
  };
  return messages[kyc_status] || '';
};

Utilise: <CardDescription>{getKYCMessage(practitioner.kyc_status, practitioner.kyc_comment)}</CardDescription>
```

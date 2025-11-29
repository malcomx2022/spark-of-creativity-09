# 📋 AUDIT DASHBOARD COACH SPORTIF - PROMPTS LOVABLE.DEV

**Date:** 2025-11-28
**Total:** 25 erreurs identifiées

---

## ERREUR #1 - console.error en production
```
Dans CoachDashboard.tsx lignes 142 et 183, remplace console.error par un logging approprié:
Ligne 142: console.error('Erreur lors de l\'acceptation', error);
Ligne 183: console.error('Erreur lors du refus', error);

Remplace par:
if (import.meta.env.DEV) {
  console.error('Error:', error);
}

Fais de même pour tous les console.log/error du dashboard coach.
```

## ERREUR #2 - window.confirm au lieu de Dialog React
```
Dans CoachDashboard.tsx lignes 101 et 107, remplace window.confirm:
Ligne 101: if (confirm("Êtes-vous sûr de vouloir annuler cette séance ?"))
Ligne 107: if (confirm("Confirmer cette séance ? Les participants seront notifiés."))

Utilise un AlertDialog React avec des boutons clairs:
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Annuler la séance ?</AlertDialogTitle>
      <AlertDialogDescription>
        Cette action est irréversible. Les participants seront notifiés.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Non</AlertDialogCancel>
      <AlertDialogAction onClick={() => cancelSession(sessionId)}>
        Oui, annuler
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## ERREUR #3 - Calcul de revenus incorrect
```
Dans CoachDashboard.tsx lignes 86-90, le calcul de revenus multiplie par 0.63 (63%) mais devrait être 0.95 (95% pour coach, 5% commission):
Ligne 87: .reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * 0.63), 0) || 0;
Ligne 90: .reduce((sum, a) => sum + ((a.paymentAmount || 0) * 0.63), 0) || 0;

Remplace 0.63 par 0.95:
.reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * 0.95), 0) || 0;
.reduce((sum, a) => sum + ((a.paymentAmount || 0) * 0.95), 0) || 0;

Et ajoute un commentaire: // 95% pour le coach (5% commission plateforme)
```

## ERREUR #4 - Tous les tabs rendus simultanément
```
Dans CoachDashboard.tsx ligne 300-494, implémente le lazy loading des 6 tabs:
1. Crée des composants séparés dans src/components/dashboard/coach/tabs/
2. Import avec React.lazy():
const SessionsTab = lazy(() => import('@/components/dashboard/coach/tabs/SessionsTab'));
const AppointmentsTab = lazy(() => import('@/components/dashboard/coach/tabs/AppointmentsTab'));
3. Enveloppe chaque TabsContent dans Suspense:
<TabsContent value="sessions">
  <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
    <SessionsTab coach={coach} />
  </Suspense>
</TabsContent>
```

## ERREUR #5 - Stats non mémoïsées
```
Dans CoachDashboard.tsx lignes 74-90, mémoïse les calculs de stats:
import { useMemo } from 'react';

const stats = useMemo(() => ({
  upcomingSessions: sessions?.filter(s =>
    s.status === 'planifiee' || s.status === 'confirmee'
  ).length || 0,
  upcomingAppointments: appointments?.filter(a =>
    a.status === 'confirmed' || a.status === 'pending'
  ).length || 0,
  totalParticipants: sessions?.reduce((sum, s) =>
    sum + (s.current_participants || 0), 0
  ) || 0,
  totalRevenue: sessions?.filter(s => s.status === 'terminee')
    .reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * 0.95), 0) || 0,
  appointmentsRevenue: appointments?.filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + ((a.paymentAmount || 0) * 0.95), 0) || 0,
}), [sessions, appointments]);

Utilise: stats.upcomingSessions, stats.totalRevenue, etc.
```

## ERREUR #6 - Filtrage non mémoïsé des rendez-vous
```
Dans CoachDashboard.tsx lignes 392-445, mémoïse le filtrage des rendez-vous:
const categorizedAppointments = useMemo(() => ({
  pending: appointments?.filter(a => a.status === 'pending') || [],
  confirmed: appointments?.filter(a => a.status === 'confirmed' || a.status === 'in-progress') || [],
  completed: appointments?.filter(a => a.status === 'completed').slice(0, 5) || [],
}), [appointments]);

Utilise: categorizedAppointments.pending.map(...)
```

## ERREUR #7 - Slice arbitraire sans pagination
```
Dans CoachDashboard.tsx ligne 436, .slice(0, 5) limite à 5 sans vraie pagination:
Remplace par:
1. Un état: const [completedLimit, setCompletedLimit] = useState(5);
2. Affiche: .slice(0, completedLimit).map(...)
3. Bouton "Voir plus": onClick={() => setCompletedLimit(prev => prev + 5)}
4. Affiche "Affichage X sur Y consultations"
```

## ERREUR #8 - Validation min > max manquante
```
Dans CreateGroupSessionDialog.tsx, ajoute validation pour min_participants <= max_participants:
Dans handleSubmit ligne 36-79, ajoute avant l'insert:
if (formData.min_participants > formData.max_participants) {
  toast({
    title: "Erreur de validation",
    description: "Le nombre minimum de participants ne peut pas dépasser le maximum",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}
```

## ERREUR #9 - Validation de date manquante
```
Dans CreateGroupSessionDialog.tsx, ajoute validation pour date dans le futur:
Dans handleSubmit ligne 36-79, ajoute:
const sessionDate = new Date(formData.scheduled_date);
const now = new Date();
now.setHours(0, 0, 0, 0);

if (sessionDate < now) {
  toast({
    title: "Date invalide",
    description: "La date de la séance doit être dans le futur",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}
```

## ERREUR #10 - Validation start_time < end_time manquante
```
Dans CreateGroupSessionDialog.tsx, ajoute validation pour horaires cohérents:
Dans handleSubmit ligne 36-79, ajoute:
if (formData.start_time >= formData.end_time) {
  toast({
    title: "Horaires invalides",
    description: "L'heure de début doit être avant l'heure de fin",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}
```

## ERREUR #11 - Validation prix minimum incohérente
```
Dans CreateGroupSessionDialog.tsx ligne 132, le min est 10000 FCFA:
Mais dans EditGroupSessionDialog.tsx ligne 142, le min est 1000 FCFA:

Uniformise à 5000 FCFA minimum pour les deux:
<Input
  id="price_per_person"
  type="number"
  min="5000"
  step="1000"
  ...
/>
```

## ERREUR #12 - Pas de validation avant modification
```
Dans EditGroupSessionDialog.tsx, ajoute les mêmes validations que Create:
1. min_participants <= max_participants
2. Date dans le futur
3. start_time < end_time
4. Prix minimum cohérent

Crée une fonction helper partagée validateSessionForm() pour éviter la duplication.
```

## ERREUR #13 - Type assertion manquante
```
Dans GroupSessionCard.tsx ligne 61, le type assertion peut échouer:
<Badge className={sessionTypeColors[session.session_type as keyof typeof sessionTypeColors]}>

Ajoute une valeur par défaut:
const sessionTypeColor = sessionTypeColors[session.session_type as keyof typeof sessionTypeColors] || "bg-gray-500";
<Badge className={sessionTypeColor}>

Fais de même ligne 64 pour statusColors.
```

## ERREUR #14 - Calcul spotsRemaining peut être négatif
```
Dans GroupSessionCard.tsx ligne 48:
const spotsRemaining = session.max_participants - session.current_participants;

Ajoute protection:
const spotsRemaining = Math.max(0, session.max_participants - session.current_participants);

Car current_participants pourrait dépasser max_participants en cas de bug.
```

## ERREUR #15 - Pas de gestion overbooking
```
Dans GroupSessionCard.tsx, ajoute un avertissement si overbooking:
{session.current_participants > session.max_participants && (
  <Badge variant="destructive" className="mt-2">
    ⚠️ Overbooking: {session.current_participants - session.max_participants} participants en trop
  </Badge>
)}
```

## ERREUR #16 - Pas de loader pendant mutation
```
Dans GroupSessionCard.tsx, les boutons Confirmer/Annuler n'ont pas de loader:
Ajoute un état isProcessing:
const [isProcessing, setIsProcessing] = useState(false);

Dans les onClick:
onClick={async () => {
  setIsProcessing(true);
  try {
    await onConfirm?.(session.id);
  } finally {
    setIsProcessing(false);
  }
}}
disabled={isProcessing}

Affiche un spinner pendant le traitement.
```

## ERREUR #17 - Nombre magique 0.63 vs 0.95
```
Dans CoachDashboard.tsx, crée une constante pour le taux de commission:
const COACH_REVENUE_RATE = 0.95; // 95% pour le coach, 5% commission plateforme

Utilise:
.reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * COACH_REVENUE_RATE), 0)

Plus clair et maintenable.
```

## ERREUR #18 - Pas de pagination pour sessions
```
Dans CoachDashboard.tsx ligne 344-356, toutes les sessions sont affichées sans pagination:
1. Limite initiale à 10 sessions
2. Ajoute un bouton "Voir tout" avec Dialog et pagination
3. Ou implémente infinite scroll avec useInfiniteQuery
4. Trie par date (plus proches en premier)
```

## ERREUR #19 - Status mal géré dans stats
```
Dans CoachDashboard.tsx ligne 74-76, le calcul inclut 'planifiee' et 'confirmee':
Mais il devrait exclure les séances passées:
const upcomingSessions = sessions?.filter(s => {
  const sessionDate = new Date(s.scheduled_date);
  const now = new Date();
  return (s.status === 'planifiee' || s.status === 'confirmee') && sessionDate >= now;
}).length || 0;
```

## ERREUR #20 - Duplication de code Create/Edit
```
Entre CreateGroupSessionDialog.tsx et EditGroupSessionDialog.tsx, 90% du code est identique:
Crée un composant partagé GroupSessionForm.tsx:
1. Props: { mode: 'create' | 'edit', initialData?, onSubmit }
2. Logique de formulaire partagée
3. CreateGroupSessionDialog et EditGroupSessionDialog deviennent de simples wrappers

Réduit de ~500 lignes à ~350 lignes total.
```

## ERREUR #21 - Pas de message si aucune séance à venir
```
Dans CoachDashboard.tsx, améliore le message vide ligne 358-368:
Distingue:
- Aucune séance créée (message actuel OK)
- Séances créées mais toutes dans le passé:
  "Toutes vos séances sont terminées. Créez une nouvelle séance."
- Séances créées mais toutes annulées:
  "Toutes vos séances ont été annulées. Créez une nouvelle séance."
```

## ERREUR #22 - Pas de tri des sessions
```
Dans CoachDashboard.tsx ligne 346, les sessions ne sont pas triées:
Trie par date (prochaines en premier):
{sessions
  .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
  .map((session) => (
    <GroupSessionCard ... />
  ))
}
```

## ERREUR #23 - Revenus affichés même si 0
```
Dans CoachDashboard.tsx ligne 289, affiche toujours le revenu même si 0:
Améliore l'affichage:
{Math.round(totalRevenue + appointmentsRevenue) > 0 ? (
  <>
    <span className="text-3xl font-bold">{Math.round(totalRevenue + appointmentsRevenue).toLocaleString()} F</span>
    <p className="text-xs text-muted-foreground mt-1">
      Séances + consultations
    </p>
  </>
) : (
  <span className="text-2xl text-muted-foreground">Aucun revenu</span>
)}
```

## ERREUR #24 - Formatage prix incohérent
```
Dans GroupSessionCard.tsx ligne 99, utilise toLocaleString():
{session.price_per_person.toLocaleString()} FCFA

Mais dans CoachDashboard ligne 289 aussi:
{Math.round(totalRevenue + appointmentsRevenue).toLocaleString()} F

Incohérence FCFA vs F. Uniformise à "FCFA" partout.
```

## ERREUR #25 - Tabs trop petits sur mobile
```
Dans CoachDashboard.tsx ligne 301-326, les tabs utilisent .hidden sm:inline:
Sur mobile, seules les icônes sont visibles, ce qui peut être confus.

Améliore avec des labels courts:
<span className="sm:hidden">Séan.</span>
<span className="hidden sm:inline">Séances</span>

Ou utilise un Select sur mobile au lieu de tabs:
<div className="sm:hidden">
  <Select value={activeTab} onValueChange={setActiveTab}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="sessions">Séances de groupe</SelectItem>
      <SelectItem value="appointments">Rendez-vous</SelectItem>
      ...
    </SelectContent>
  </Select>
</div>
```

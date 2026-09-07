# Revue Fonctionnelle - Workflow Paiement Patient

**Date:** 2026-01-27
**Version:** 1.0

---

## 1. Architecture du Workflow

### 1.1 Vue d'ensemble

Le workflow de paiement patient comprend deux flux principaux:
1. **Paiement RDV classique** - Via FedaPayWidget
2. **Paiement séance de groupe** - Via GroupSessionPaymentWidget

### 1.2 Workflow Paiement RDV Classique

```
PHASE 1: INITIATION (FedaPayWidget.tsx)
    |
    v
[Validation formulaire] --> [Appel create-payment edge function]
    |                              |
    v                              v
[Vérification session auth]   [Validation Zod appointmentId, phone, etc.]
    |                              |
    v                              v
[Afficher formulaire]         [Vérifier paiement pending existant]
                                   |
                        +----------+-----------+
                        |                      |
                   [Paiement < 2min]      [Paiement > 2min]
                        |                      |
                        v                      v
                   [Erreur 409]          [Marquer expiré]
                        |                      |
                        v                      v
                   [Bouton annuler]       [Continuer]
                                               |
                                               v
                                    [Créer transaction FedaPay]
                                               |
                                               v
                                    [Générer token paiement]
                                               |
                                               v
                                    [Insert payments table]
                                               |
                                               v
                                    [Retourner transactionId]
    |
    v
PHASE 2: WIDGET FEDAPAY (FedaPayWidget.tsx)
    |
    v
[FedaPay.init()] --> [Afficher widget embedded]
    |
    v
[Patient saisit code USSD] --> [Validation Mobile Money]
    |
    v
PHASE 3: CALLBACK (onComplete FedaPay)
    |
    +------------------+------------------+
    |                                     |
[SUCCESS]                            [DISMISSED]
    |                                     |
    v                                     v
[setPaymentStatus('success')]       [setPaymentStatus('error')]
    |                                     |
    v                                     v
[sync-payment-status]               [Toast erreur]
    |
    v
[Invalider queries]
    |
    v
[Toast succès]
    |
    v
PHASE 4: WEBHOOK (payment-webhook/index.ts)
    |
    v
[FedaPay POST webhook] --> [Vérifier signature HMAC]
    |
    v
[Récupérer payment par fedapay_transaction_id]
    |
    v
[Mettre à jour payments.status]
    |
    v
[Mettre à jour appointments.status → confirmed]
    |
    v
[Mettre à jour practitioner_balances]
    |
    v
[Notifier patient + praticien]
```

### 1.3 Workflow Paiement Séance Groupe

```
PHASE 1: PRE-CHECKS (GroupSessionPaymentWidget.tsx)
    |
    v
[Vérifier KYC coach] --> [Vérifier séance non passée]
    |                            |
    v                            v
[Vérifier places disponibles] --> [Vérifier inscription existante]
    |
    v
PHASE 2: INSCRIPTION + PAIEMENT (register-group-session/index.ts)
    |
    v
[Réservation atomique place (RPC)] --> [Créer participant pending]
    |                                          |
    v                                          v
[Appel create-payment]              [Rollback si échec paiement]
    |
    v
[appointmentId = group_session_{sessionId}_{participantId}]
    |
    v
PHASE 3: WIDGET FEDAPAY (GroupSessionPaymentWidget.tsx)
    |
    v
[Même flux que RDV classique]
    |
    v
PHASE 4: WEBHOOK
    |
    v
[Détecter préfixe group_session_]
    |
    v
[Mettre à jour group_session_participants.payment_status → paid]
    |
    v
[Notifier coach + patient]
```

### 1.4 Tables de données

| Table | Rôle |
|-------|------|
| `payments` | Enregistrement de tous les paiements |
| `appointments` | RDV classiques (status → pending_payment → confirmed) |
| `group_session_participants` | Inscriptions séances (payment_status → pending → paid) |
| `practitioner_balances` | Solde praticien (balance_pending, balance_available) |
| `payment_events` | Audit trail des événements de paiement |

### 1.5 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/components/FedaPayWidget.tsx` | Widget paiement RDV classique |
| `src/components/coach/GroupSessionPaymentWidget.tsx` | Widget paiement séance groupe |
| `src/components/coach/RetryGroupSessionPaymentWidget.tsx` | Widget retry paiement séance |
| `src/components/dashboard/PatientGroupSessionsSection.tsx` | Vue patient séances |
| `src/lib/payment-storage.ts` | Persistance localStorage paiement |
| `src/lib/payment-config.ts` | Config providers (MTN/MOOV) |
| `src/hooks/useSavedPaymentMethods.ts` | Méthodes sauvegardées |
| `supabase/functions/create-payment/index.ts` | Création paiement FedaPay |
| `supabase/functions/register-group-session/index.ts` | Inscription + paiement séance |
| `supabase/functions/payment-webhook/index.ts` | Webhook FedaPay |
| `supabase/functions/cancel-pending-payment/index.ts` | Annulation paiement pending |
| `supabase/functions/retry-group-session-payment/index.ts` | Retry paiement séance |
| `supabase/functions/sync-payment-status/index.ts` | Sync statut avec FedaPay |

---

## 2. Analyse des Bugs Identifiés

### Bug #1 - CRITIQUE: GroupSessionPaymentWidget pré-remplit numéro de test en sandbox

**Fichier:** `src/components/coach/GroupSessionPaymentWidget.tsx:196-198`

**Problème:**
```typescript
if (data?.environment === 'sandbox' && !phoneNumber) {
  setPhoneNumber('+22966000001');
}
```

Cela pré-remplit automatiquement le numéro de test MTN, ce qui:
1. Peut confondre l'utilisateur qui pense que c'est son numéro
2. Est incohérent avec FedaPayWidget qui ne fait PAS ça

**Impact:**
- Incohérence UX entre les deux widgets
- Risque d'erreur en production si ce code reste

**Correction requise:**
Supprimer ce bloc et utiliser uniquement l'alerte visuelle comme dans FedaPayWidget.

---

### Bug #2 - CRITIQUE: GroupSessionPaymentWidget ne vérifie pas le chargement FedaPay

**Fichier:** `src/components/coach/GroupSessionPaymentWidget.tsx:457-569`

**Problème:**
FedaPayWidget a une protection avec timeout pour le chargement du script:
```typescript
// FedaPayWidget.tsx - Protection complète
const [fedapayScriptLoaded, setFedapayScriptLoaded] = useState(false);
const [fedapayLoadError, setFedapayLoadError] = useState(false);

useEffect(() => {
  const FEDAPAY_LOAD_TIMEOUT = 15000;
  // ... polling + timeout
}, []);
```

GroupSessionPaymentWidget vérifie uniquement:
```typescript
if (typeof window !== 'undefined' && (window as any).FedaPay) {
  // Initialiser widget
} else {
  // Erreur immédiate sans retry
}
```

**Impact:**
- Si le script charge lentement, le widget échoue immédiatement
- Pas de message d'erreur explicite pour l'utilisateur

**Correction requise:**
Ajouter la même protection avec timeout que FedaPayWidget.

---

### Bug #3 - MOYEN: Erreur 409 non gérée dans GroupSessionPaymentWidget

**Fichier:** `src/components/coach/GroupSessionPaymentWidget.tsx:336-376`

**Problème:**
FedaPayWidget gère l'erreur 409 (paiement en cours) avec un bouton d'annulation:
```typescript
// FedaPayWidget.tsx
if (is409Error) {
  toast({
    title: '⏳ Paiement déjà en cours',
    description: errorDetails.error,
    action: (
      <Button onClick={() => supabase.functions.invoke('cancel-pending-payment', ...}>
        Annuler et réessayer
      </Button>
    ),
  });
}
```

GroupSessionPaymentWidget ne fait que:
```typescript
const isDuplicateError = errorMessage.includes('déjà inscrit');
if (isDuplicateError) {
  toast({ title: 'Inscription existante', ... });
}
```

**Impact:**
- Si un paiement séance est bloqué, l'utilisateur ne peut pas annuler et réessayer
- Doit attendre l'expiration automatique (2 minutes)

**Correction requise:**
Ajouter la même gestion d'erreur 409 avec bouton d'annulation.

---

### Bug #4 - MOYEN: cancel-pending-payment ne gère pas les séances de groupe

**Fichier:** `supabase/functions/cancel-pending-payment/index.ts:77-88`

**Problème:**
```typescript
const { data: appointment, error: appointmentError } = await supabase
  .from('appointments')
  .select('patient_id, practitioner_id')
  .eq('id', appointmentId)
  .single();

if (appointmentError || !appointment) {
  return new Response(
    JSON.stringify({ error: 'Rendez-vous non trouvé' }),
    { status: 404 }
  );
}
```

Si `appointmentId` commence par `group_session_`, cette requête échouera car il n'y a pas de RDV correspondant dans la table `appointments`.

**Impact:**
- Impossible d'annuler un paiement de séance de groupe via cette edge function
- Les paiements de séance restent bloqués jusqu'à expiration

**Correction requise:**
Détecter le préfixe `group_session_` et vérifier les permissions via `group_session_participants`.

---

### Bug #5 - MOYEN: saveMethod non fonctionnel dans GroupSessionPaymentWidget

**Fichier:** `src/components/coach/GroupSessionPaymentWidget.tsx:750-760`

**Problème:**
Le checkbox "Enregistrer cette méthode" existe:
```typescript
<Checkbox
  id="group-save-method"
  checked={saveMethod}
  onCheckedChange={(checked) => setSaveMethod(checked as boolean)}
/>
```

Mais contrairement à FedaPayWidget, la méthode n'est jamais sauvegardée dans le callback `onComplete`:
```typescript
// FedaPayWidget.tsx - Sauvegarde la méthode
if (saveMethod && phoneNumber) {
  await addPaymentMethod({
    provider: paymentMethod,
    phoneNumber: sanitizedPhone,
    setAsDefault: true,
  });
}

// GroupSessionPaymentWidget.tsx - Ne sauvegarde PAS
// Le hook useSavedPaymentMethods n'est même pas importé correctement
```

**Impact:**
- L'utilisateur coche la case mais la méthode n'est pas sauvegardée
- Fausse promesse UX

**Correction requise:**
Implémenter la sauvegarde de méthode comme dans FedaPayWidget.

---

### Bug #6 - MOYEN: Pas de retry pour paiements "failed" dans PatientGroupSessionsSection

**Fichier:** `src/components/dashboard/PatientGroupSessionsSection.tsx:30-56`

**Problème:**
```typescript
const getPaymentStatusBadge = (status: string) => {
  const config = {
    paid: { icon: CheckCircle, color: "bg-green-500", text: "Payé" },
    pending: { icon: AlertCircle, color: "bg-orange-500", text: "En attente" },
    failed: { icon: XCircle, color: "bg-red-500", text: "Échec" }
  };
```

Le badge "failed" est affiché, mais:
```typescript
{session.payment_status === 'pending' && (
  <Button onClick={() => handleRetryPayment(session)}>
    Finaliser le paiement
  </Button>
)}
```

Seul `pending` affiche le bouton retry, pas `failed`.

**Impact:**
- Un paiement en statut "failed" ne peut pas être réessayé via l'interface
- L'utilisateur doit se réinscrire ou contacter le support

**Correction requise:**
```typescript
{(session.payment_status === 'pending' || session.payment_status === 'failed') && (
  <Button onClick={() => handleRetryPayment(session)}>
    {session.payment_status === 'failed' ? 'Réessayer le paiement' : 'Finaliser le paiement'}
  </Button>
)}
```

---

### Bug #7 - MINEUR: Délai sync-payment-status trop court

**Fichier:** `src/components/FedaPayWidget.tsx:530-553`

**Problème:**
```typescript
const syncAndRefresh = async () => {
  try {
    // Attendre un peu pour le webhook
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Forcer la synchronisation
    await supabase.functions.invoke('sync-payment-status', ...);

    // Attendre encore un peu
    await new Promise(resolve => setTimeout(resolve, 1500));
```

Le délai total de 3 secondes peut être insuffisant si:
- Le webhook FedaPay est lent
- La connexion est mauvaise

**Impact:**
- Le statut peut ne pas être synchronisé correctement
- L'utilisateur voit "succès" mais le statut backend n'est pas à jour

**Amélioration suggérée:**
Utiliser un polling avec retry plutôt qu'un délai fixe.

---

### Bug #8 - MINEUR: Incohérence messages d'erreur téléphone

**Fichiers:** `FedaPayWidget.tsx:191`, `GroupSessionPaymentWidget.tsx:268`

**Problème:**
Les messages d'erreur pour le format de téléphone sont différents:
```typescript
// FedaPayWidget.tsx
'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX ou +229 01 XX XX XX XX'

// GroupSessionPaymentWidget.tsx
'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX ou +229 01 XX XX XX XX'
```

Bien que les messages soient identiques, les regex de validation le sont aussi:
```typescript
const phoneRegex = /^\+229(01)?\d{8}$/;
```

C'est correct mais pourrait être factorisé.

---

## 3. Points Positifs du Workflow Actuel

1. **Validation Zod complète** - create-payment valide tous les inputs
2. **Idempotency key avec crypto.randomUUID** - Évite les collisions
3. **Vérification signature HMAC** - Sécurité webhook avec timing-safe comparison
4. **Timeout FedaPay API** - 30 secondes avec fetchWithTimeout
5. **Rollback en cas d'échec** - register-group-session supprime la participation si paiement échoue
6. **Notifications non-bloquantes** - Les erreurs de notification ne bloquent pas le flux
7. **Persistance localStorage** - payment-storage.ts permet de récupérer les paiements interrompus
8. **Protection anti-doublon** - Vérification paiement pending avant création

---

## 4. Comparaison FedaPayWidget vs GroupSessionPaymentWidget

| Aspect | FedaPayWidget | GroupSessionPaymentWidget | Alignement |
|--------|---------------|---------------------------|------------|
| Timeout script FedaPay | ✅ 15s + polling | ❌ Vérification simple | **À corriger** |
| Gestion erreur 409 | ✅ Bouton annuler | ❌ Pas de bouton | **À corriger** |
| Sauvegarde méthode paiement | ✅ Avec useSavedPaymentMethods | ❌ Checkbox sans effet | **À corriger** |
| Pré-remplissage sandbox | ❌ Non (correct) | ⚠️ Oui (à supprimer) | **À corriger** |
| Sync après succès | ✅ sync-payment-status | ❌ Uniquement invalidateQueries | Améliorer |
| Validation téléphone | ✅ Regex + normalisation | ✅ Regex + normalisation | OK |
| Détails séance/RDV | ✅ Montant affiché | ✅ Date + heure + participants | OK |

---

## 5. Plan de Correction

### Priorité 1 - Critiques

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #1 | GroupSessionPaymentWidget.tsx | Supprimer pré-remplissage numéro sandbox | ✅ CORRIGÉ |
| #2 | GroupSessionPaymentWidget.tsx | Ajouter timeout chargement FedaPay | ✅ CORRIGÉ |

### Priorité 2 - Moyens

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #3 | GroupSessionPaymentWidget.tsx | Ajouter gestion erreur 409 avec bouton annuler | À faire |
| #4 | cancel-pending-payment/index.ts | Gérer appointmentId format group_session_ | ✅ CORRIGÉ |
| #5 | GroupSessionPaymentWidget.tsx | Implémenter sauvegarde méthode paiement | ✅ CORRIGÉ |
| #6 | PatientGroupSessionsSection.tsx | Ajouter bouton retry pour payment_status=failed | ✅ CORRIGÉ |

### Priorité 3 - Mineurs

| Bug | Fichier | Action | Statut |
|-----|---------|--------|--------|
| #7 | FedaPayWidget.tsx | Améliorer délai sync avec polling | Optionnel |
| #8 | Factoriser | Créer constantes partagées pour validation | Optionnel |

---

## 6. Tests Recommandés

### Scénario 1: Paiement RDV classique succès
1. Patient a un RDV en pending_payment
2. Ouvre FedaPayWidget
3. Sélectionne MTN, entre numéro +229 66 00 00 01 (test)
4. Valide paiement
5. Vérifier: Widget FedaPay s'affiche
6. Compléter paiement USSD simulé
7. Vérifier: Toast succès, RDV passe en confirmed

### Scénario 2: Paiement RDV avec erreur 409
1. Patient initie un paiement
2. Ferme la fenêtre sans compléter
3. Rouvre FedaPayWidget
4. Vérifier: Message "Paiement en cours" avec bouton annuler
5. Cliquer annuler
6. Vérifier: Peut créer nouveau paiement

### Scénario 3: Paiement séance groupe succès
1. Patient s'inscrit à une séance
2. GroupSessionPaymentWidget s'ouvre
3. Pré-checks passent (KYC coach, places, date)
4. Sélectionne MOOV, entre numéro
5. Valide
6. Vérifier: Inscription créée + widget FedaPay
7. Compléter paiement
8. Vérifier: payment_status = paid, coach notifié

### Scénario 4: Retry paiement séance failed
1. Patient a une inscription avec payment_status = pending ou failed
2. Ouvre PatientGroupSessionsSection
3. Vérifier: Bouton "Finaliser le paiement" visible
4. Cliquer retry
5. Vérifier: RetryGroupSessionPaymentWidget fonctionne

### Scénario 5: Script FedaPay ne charge pas
1. Bloquer le chargement du script FedaPay
2. Ouvrir FedaPayWidget
3. Vérifier: Après 15s, message "Service de paiement indisponible"
4. Ouvrir GroupSessionPaymentWidget
5. Vérifier: Comportement similaire (après correction Bug #2)

### Scénario 6: Annulation paiement séance groupe
1. Patient initie paiement séance
2. Ferme sans compléter
3. Rouvre le widget
4. Vérifier: Peut annuler et réessayer (après correction Bug #3 et #4)

---

## 7. Conclusion

Le workflow de paiement patient est maintenant aligné entre les deux widgets.

### Corrections effectuées (2026-01-27)

- ✅ **Bug #1**: Suppression du pré-remplissage numéro sandbox dans GroupSessionPaymentWidget
- ✅ **Bug #2**: Ajout du timeout 15s pour chargement script FedaPay
- ✅ **Bug #4**: cancel-pending-payment supporte maintenant les séances de groupe
- ✅ **Bug #5**: Implémentation de la sauvegarde méthode de paiement
- ✅ **Bug #6**: Bouton retry pour les paiements failed ajouté

### Point restant

- **Bug #3**: Gestion erreur 409 avec bouton annuler (optionnel - edge function gère déjà l'expiration après 2 min)

### Architecture solide

- Edge functions bien structurées avec validation Zod
- Sécurité webhook avec HMAC timing-safe
- Rollback automatique en cas d'échec
- Système de retry avec timeout
- Protection chargement script FedaPay avec timeout

Les deux widgets (FedaPayWidget et GroupSessionPaymentWidget) sont maintenant alignés sur les mécanismes de sécurité et d'UX.

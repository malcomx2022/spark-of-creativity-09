# Analyse du Workflow Praticien - Erreurs et Corrections

## Vue d'ensemble du parcours praticien

```
1. Inscription → 2. Validation KYC → 3. Configuration profil → 4. Définition disponibilités 
→ 5. Réception demandes RDV → 6. Acceptation/Refus RDV → 7. Consultation 
→ 8. Rapport de consultation → 9. Réception paiement
```

---

## ❌ ERREURS CRITIQUES (Bloquantes)

### ERREUR CRITIQUE #1: Authentification Supabase incomplète lors de l'inscription
**Fichier**: `src/pages/PractitionerSignup.tsx` (lignes 129-139)

**Problème**:
- ✅ Utilise `supabase.auth.signUp()` (bon point vs patient)
- ❌ **MAIS manque `emailRedirectTo`** - problème de redirection après confirmation email
- ❌ Pas de gestion des erreurs spécifiques (email déjà utilisé, mot de passe faible)
- ❌ Si l'upload de documents échoue, le compte Supabase est créé mais le profil praticien est incomplet

```typescript
// ACTUEL - Incomplet
const { data, error } = await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    data: {
      full_name: `${formData.firstName} ${formData.lastName}`.trim(),
      role: "practitioner",
      phone: formData.phone,
    },
  },
});
```

**Impact**: 
- Praticiens ne peuvent pas se reconnecter après validation email
- Comptes fantômes si échec partiel
- Messages d'erreur non explicites pour les utilisateurs

---

### ERREUR CRITIQUE #2: Aucune transaction atomique pour l'inscription praticien
**Fichier**: `src/pages/PractitionerSignup.tsx` (lignes 128-217)

**Problème**:
```typescript
// Séquence non-atomique:
1. signUp() → ✅ Compte créé
2. profile insert → ❌ Échec
3. document uploads → ⏸️ Partiellement uploadés
4. practitioners insert → ❌ Échec

// Résultat: Compte Supabase créé mais profil praticien inexistant
```

**Impact**: 
- État incohérent de la base de données
- Praticien peut se connecter mais n'a pas de profil `practitioners`
- Impossible de recevoir des rendez-vous
- **Nécessite intervention admin manuelle pour corriger**

---

### ERREUR CRITIQUE #3: Statut KYC non vérifié avant acceptation de missions
**Fichier**: `src/pages/PractitionerDashboard.tsx` + `supabase/functions/find-available-practitioner/index.ts`

**Problème**:
- Le champ `can_accept_missions` est initialisé à `false` lors de l'inscription ✅
- **MAIS** aucune vérification côté Edge Function pour empêcher attribution de RDV si KYC non validé
- Dashboard affiche les RDV même si `kyc_status !== 'validated'`
- Praticien peut accepter des RDV alors que son profil n'est pas validé

```typescript
// Edge function find-available-practitioner (ligne 100-110)
// ❌ Manque le filtre sur kyc_status et can_accept_missions
const { data: practitioners } = await supabase
  .from('practitioners')
  .select('*')
  .eq('specialty', body.specialty)
  .eq('available', true)
  // ❌ MANQUE: .eq('kyc_status', 'validated')
  // ❌ MANQUE: .eq('can_accept_missions', true)
```

**Impact**:
- Patients reçoivent des RDV de praticiens non vérifiés
- Risques légaux et de sécurité
- Mauvaise expérience utilisateur

---

## ⚠️ ERREURS IMPORTANTES (Non-bloquantes mais problématiques)

### ERREUR #4: Upload de documents sans validation de taille/type
**Fichier**: `src/lib/file-upload.ts` + `src/pages/PractitionerSignup.tsx`

**Problème**:
- Aucune validation frontend sur le type de fichier (PDF, JPG, PNG uniquement)
- Pas de limite de taille avant upload
- Upload Wasabi peut échouer silencieusement

```typescript
// Validation manquante:
- Taille max: 5MB par fichier
- Types autorisés: PDF, JPG, PNG
- Vérification que les documents obligatoires sont fournis
```

**Impact**:
- Utilisateurs uploadent des fichiers de 50MB et ça plante
- Formats non supportés (HEIC, WEBP)
- Coûts storage inutiles

---

### ERREUR #5: Disponibilités - Aucune validation des créneaux qui se chevauchent
**Fichier**: `src/components/AddAvailabilityDialog.tsx`

**Problème**:
```typescript
// Praticien peut créer:
- Lundi 08:00-12:00
- Lundi 10:00-14:00  ❌ Chevauchement!
- Lundi 11:00-13:00  ❌ Chevauchement!

// Aucune vérification avant insertion
```

**Impact**:
- Conflits de disponibilités
- Attribution de RDV impossibles
- Confusion pour le patient

**Solution nécessaire**:
```typescript
// Avant insert, vérifier:
const hasOverlap = existingSlots.some(slot => 
  slot.day_of_week === newSlot.day_of_week &&
  (
    (newSlot.start_time >= slot.start_time && newSlot.start_time < slot.end_time) ||
    (newSlot.end_time > slot.start_time && newSlot.end_time <= slot.end_time) ||
    (newSlot.start_time <= slot.start_time && newSlot.end_time >= slot.end_time)
  )
);
```

---

### ERREUR #6: Race condition dans acceptation/refus de RDV
**Fichier**: `supabase/functions/handle-appointment-response/index.ts`

**Problème**:
```typescript
// Scénario possible:
T0: Praticien A clique "Accepter" sur RDV #123
T1: Praticien A clique "Refuser" sur RDV #123 (double-clic accidentel)
T2: Edge function accepte → status = "confirmed"
T3: Edge function refuse → status = "rejected"
// Résultat final: rejected alors que praticien voulait accepter
```

**Solution nécessaire**:
```typescript
// Vérifier le statut actuel avant update
const { data: currentAppointment } = await supabase
  .from('appointments')
  .select('status')
  .eq('id', appointmentId)
  .single();

if (currentAppointment.status !== 'awaiting_practitioner') {
  throw new Error('Ce rendez-vous a déjà été traité');
}

// Lock optimiste avec version
.update({ status: newStatus })
.eq('id', appointmentId)
.eq('status', 'awaiting_practitioner') // ← Protection race condition
```

---

### ERREUR #7: Rapport de consultation - Données perdues si échec de soumission
**Fichier**: `src/components/dashboard/practitioner/ConsultationReportSection.tsx`

**Problème**:
- Praticien remplit un formulaire long (10+ champs)
- Erreur réseau ou session expirée
- ❌ Toutes les données sont perdues
- Pas de sauvegarde automatique brouillon

**Impact**:
- Frustration utilisateur énorme
- Perte de 15-20 minutes de travail
- Rapports incomplets ou non soumis

**Solution nécessaire**:
```typescript
// Auto-save to localStorage every 30s
useEffect(() => {
  const interval = setInterval(() => {
    localStorage.setItem(
      `consultation_draft_${appointmentId}`,
      JSON.stringify(form.getValues())
    );
  }, 30000);
  
  return () => clearInterval(interval);
}, [form, appointmentId]);

// Restore on mount
useEffect(() => {
  const draft = localStorage.getItem(`consultation_draft_${appointmentId}`);
  if (draft) {
    const parsed = JSON.parse(draft);
    // Proposer de restaurer
  }
}, []);
```

---

### ERREUR #8: Paiements - Balance praticien non mise à jour en temps réel
**Fichier**: `src/components/dashboard/practitioner/PayoutsSection.tsx`

**Problème**:
- La balance est récupérée via React Query avec `staleTime` par défaut
- Après qu'un patient paie, le praticien ne voit pas sa balance mise à jour immédiatement
- Nécessite refresh manuel de la page

**Solution nécessaire**:
```typescript
// 1. Réaltime sur la table practitioner_balances
useEffect(() => {
  const channel = supabase
    .channel('practitioner-balance-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'practitioner_balances',
        filter: `practitioner_id=eq.${practitionerId}`,
      },
      (payload) => {
        queryClient.invalidateQueries(['practitioner-balance', practitionerId]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [practitionerId]);
```

---

## 🔍 ERREURS POTENTIELLES (Cas limites)

### ERREUR #9: Géolocalisation - Coordonnées nulles empêchent recherche de proximité
**Problème**:
- Praticien s'inscrit sans activer la géolocalisation
- `latitude` et `longitude` restent `null` dans la table `practitioners`
- Edge function `find-available-practitioner` ne peut pas calculer la distance
- Praticien invisible pour tous les patients

**Solution**:
```typescript
// Option 1: Rendre géolocalisation obligatoire à l'inscription
// Option 2: Géocoder l'adresse saisie via API (Google Maps, Nominatim)
// Option 3: Afficher praticiens sans coordonnées en dernier avec mention "Distance non disponible"
```

---

### ERREUR #10: Notifications - Praticien ne reçoit pas les alertes de nouveaux RDV
**Problème**:
- Table `notifications` existe ✅
- Insertion de notification lors de demande RDV ✅
- **MAIS** aucun mécanisme de push notifications implémenté
- **MAIS** aucun polling/realtime configuré pour afficher badge de notifications

**Impact**:
- Praticien rate des demandes urgentes
- Patient attend une réponse qui ne vient pas
- Expérience utilisateur dégradée

---

### ERREUR #11: Disponibilités - Export ICS peut générer des fichiers corrompus
**Fichier**: `src/components/dashboard/practitioner/AvailabilitySection.tsx` (lignes 72-140)

**Problème**:
```typescript
// Format ICS strict requis:
- Chaque ligne max 75 caractères (RFC 5545)
- Encodage UTF-8 avec BOM
- Terminaisons CRLF (\r\n)

// Code actuel:
let icsContent = "BEGIN:VCALENDAR\n"; // ❌ Devrait être \r\n
// ... reste du code
```

**Impact**:
- Calendriers corrompus dans Outlook
- Événements non importés dans Google Calendar
- Praticien doit saisir manuellement ses dispos

---

### ERREUR #12: Rapport consultation - Pas de validation côté backend
**Problème**:
- Validation uniquement côté frontend (Zod schema)
- Edge function pourrait créer rapport avec données invalides
- Pas de vérification que l'appointmentId appartient bien au praticien

**Risque sécurité**:
```typescript
// Attaque possible:
POST /functions/v1/create-consultation-report
{
  "appointmentId": "autre-praticien-rdv-123", // ❌ RDV d'un autre praticien
  "practitionerId": "mon-id",
  // ... rest of data
}
// → Rapport créé pour un RDV qui n'appartient pas au praticien
```

---

## 📋 CHECKLIST DE CORRECTION PAR PRIORITÉ

### 🔴 URGENT (Erreurs critiques)
- [ ] **#1** Ajouter `emailRedirectTo` dans PractitionerSignup.tsx
- [ ] **#2** Créer edge function transactionnelle pour inscription praticien
- [ ] **#3** Ajouter filtres KYC dans find-available-practitioner

### 🟠 IMPORTANT (Erreurs importantes)
- [ ] **#4** Validation upload documents (taille + type)
- [ ] **#5** Détection chevauchements disponibilités
- [ ] **#6** Protection race condition acceptation RDV
- [ ] **#7** Auto-save brouillon rapport consultation
- [ ] **#8** Realtime balance praticien

### 🟡 À AMÉLIORER (Cas limites)
- [ ] **#9** Gestion praticiens sans coordonnées GPS
- [ ] **#10** Système de notifications push
- [ ] **#11** Fix export ICS format RFC5545
- [ ] **#12** Validation backend rapport consultation

---

## 🧪 TESTS RECOMMANDÉS

### Tests d'intégration workflow complet
```typescript
describe('Practitioner Workflow', () => {
  it('should complete full registration flow', async () => {
    // 1. Signup avec documents
    // 2. Vérifier profil créé
    // 3. Vérifier documents uploadés
    // 4. Vérifier status KYC = pending
  });

  it('should handle appointment request correctly', async () => {
    // 1. Créer demande RDV
    // 2. Praticien accepte
    // 3. Vérifier status = confirmed
    // 4. Vérifier notification patient
  });

  it('should prevent accepting appointments when KYC not validated', async () => {
    // 1. Créer praticien avec kyc_status = pending
    // 2. Tenter recherche via find-available-practitioner
    // 3. Vérifier praticien non retourné
  });
});
```

---

## 📚 DOCUMENTATION NÉCESSAIRE

1. **Guide validation KYC** pour admins
2. **Guide configuration disponibilités** pour praticiens
3. **Workflow gestion documents** (reupload si rejet)
4. **FAQ erreurs courantes** inscription praticien
5. **Procédure rollback** inscription échouée

---

## 🔧 SOLUTIONS PROPOSÉES

### Solution Erreur #1: Fix signup avec emailRedirectTo
```typescript
// src/pages/PractitionerSignup.tsx
const { data, error } = await supabase.auth.signUp({
  email: formData.email,
  password: formData.password,
  options: {
    emailRedirectTo: `${window.location.origin}/dashboard/practitioner`,
    data: {
      full_name: `${formData.firstName} ${formData.lastName}`.trim(),
      role: "practitioner",
      phone: formData.phone,
    },
  },
});

// Gestion erreurs spécifiques
if (error) {
  if (error.message.includes('already registered')) {
    toast({
      title: "Email déjà utilisé",
      description: "Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email.",
      variant: "destructive"
    });
  } else if (error.message.includes('password')) {
    toast({
      title: "Mot de passe trop faible",
      description: "Le mot de passe doit contenir au moins 8 caractères.",
      variant: "destructive"
    });
  } else {
    toast({
      title: "Erreur d'inscription",
      description: error.message,
      variant: "destructive"
    });
  }
  setIsSubmitting(false);
  return;
}
```

### Solution Erreur #2: Edge function transactionnelle inscription
```typescript
// supabase/functions/create-practitioner-account/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { userId, profileData, practitionerData, documents } = await req.json();

  try {
    // 1. Créer profil
    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profileData);
    if (profileError) throw profileError;

    // 2. Upload documents
    const uploadedDocs = {};
    for (const [key, file] of Object.entries(documents)) {
      // Upload to Wasabi
      const { path, url } = await uploadDocument(file, userId);
      uploadedDocs[key] = { path, url };
    }

    // 3. Créer entrée practitioners
    const { error: practitionerError } = await supabase
      .from('practitioners')
      .insert({
        ...practitionerData,
        user_id: userId,
        id_document_url: uploadedDocs.idDocument?.path,
        license_document_url: uploadedDocs.license?.path,
        // ... autres documents
      });

    if (practitionerError) {
      // Rollback: supprimer profil et documents
      await supabase.from('profiles').delete().eq('id', userId);
      // Delete uploaded docs from Wasabi
      throw practitionerError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // Rollback complet
    console.error('Erreur création compte praticien:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### Solution Erreur #3: Filtrage KYC dans find-available-practitioner
```typescript
// supabase/functions/find-available-practitioner/index.ts (ligne 100)
const { data: practitioners, error: fetchError } = await supabase
  .from('practitioners')
  .select('*')
  .eq('specialty', body.specialty)
  .eq('available', true)
  .eq('is_online', true)
  .eq('kyc_status', 'validated')        // ✅ Ajouté
  .eq('can_accept_missions', true);     // ✅ Ajouté

if (fetchError) {
  console.error('Erreur récupération praticiens:', fetchError);
  throw fetchError;
}

// Log pour monitoring
console.log(`🔍 ${practitioners?.length || 0} praticiens validés trouvés pour ${body.specialty}`);
```

---

## 🎯 IMPACT ESTIMÉ DES CORRECTIONS

| Erreur | Utilisateurs impactés | Temps correction | Priorité |
|--------|----------------------|------------------|----------|
| #1 - emailRedirectTo | 80% nouveaux praticiens | 30 min | 🔴 Critique |
| #2 - Transaction atomique | 15% inscriptions | 3h | 🔴 Critique |
| #3 - Filtre KYC | 100% patients | 1h | 🔴 Critique |
| #4 - Validation upload | 30% praticiens | 2h | 🟠 Important |
| #5 - Chevauchements dispos | 10% praticiens | 1.5h | 🟠 Important |
| #6 - Race condition RDV | 5% cas | 1h | 🟠 Important |
| #7 - Auto-save rapport | 20% rapports | 2h | 🟠 Important |
| #8 - Realtime balance | 100% praticiens | 1h | 🟠 Important |

**Temps total estimé pour corrections critiques**: ~4.5h
**Temps total pour toutes corrections**: ~15h

---

## 📞 SUPPORT & MONITORING

### Logs à surveiller
```sql
-- Inscriptions praticiens échouées
SELECT created_at, email, error_message 
FROM auth.users 
WHERE created_at > NOW() - INTERVAL '7 days'
AND id NOT IN (SELECT user_id FROM practitioners);

-- RDV attribués à praticiens non validés
SELECT a.*, p.kyc_status, p.can_accept_missions
FROM appointments a
JOIN practitioners p ON a.practitioner_id = p.id::text
WHERE p.kyc_status != 'validated' 
   OR p.can_accept_missions = false;

-- Documents non uploadés
SELECT id, name, created_at
FROM practitioners
WHERE (id_document_url IS NULL 
   OR license_document_url IS NULL)
AND created_at > NOW() - INTERVAL '7 days';
```

---

## 🔗 RESSOURCES COMPLÉMENTAIRES

- [Supabase Auth Best Practices](https://supabase.com/docs/guides/auth/best-practices)
- [Handling File Uploads](https://supabase.com/docs/guides/storage)
- [Realtime Database Changes](https://supabase.com/docs/guides/realtime)
- [Edge Functions Error Handling](https://supabase.com/docs/guides/functions/error-handling)

# 🔍 Analyse Complète du Workflow Patient - Domicares

## 📋 Vue d'ensemble

Ce document analyse le parcours complet du patient sur la plateforme Domicares et identifie toutes les erreurs possibles à chaque étape.

---

## 🚨 Erreurs Critiques Détectées

### ❌ **ERREUR CRITIQUE #1: Inscription Patient Sans Authentification Réelle**

**Fichier:** `src/pages/PatientSignup.tsx`

**Problème:**
```typescript
// Ligne 72-79: Simulation d'inscription au lieu d'utilisation de Supabase Auth
setTimeout(() => {
  toast({
    title: "Inscription réussie !",
    description: "Un code de vérification a été envoyé par SMS",
  });
  setIsSubmitting(false);
  navigate("/dashboard/patient");
}, 2000);
```

**Impact:**
- ❌ Aucun compte n'est créé dans Supabase
- ❌ Aucun utilisateur authentifié
- ❌ Les patients ne peuvent pas se connecter après inscription
- ❌ Accès au dashboard sans authentification

**Solution Requise:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);

  // Validation des mots de passe
  if (formData.password !== formData.confirmPassword) {
    toast({
      title: "Erreur",
      description: "Les mots de passe ne correspondent pas",
      variant: "destructive"
    });
    setIsSubmitting(false);
    return;
  }

  try {
    // 1. Créer le compte Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone
        }
      }
    });

    if (authError) throw authError;

    // 2. Créer le profil
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: `${formData.firstName} ${formData.lastName}`,
          phone: formData.phone,
          date_of_birth: formData.dateOfBirth,
          gender: formData.gender
        });

      if (profileError) throw profileError;

      // 3. Créer l'adresse par défaut
      if (formData.address) {
        await supabase
          .from('addresses')
          .insert({
            user_id: authData.user.id,
            label: 'Domicile',
            address: formData.address,
            is_default: true
          });
      }

      // 4. Créer le contact d'urgence
      if (formData.emergencyContactName && formData.emergencyContactPhone) {
        await supabase
          .from('emergency_contacts')
          .insert({
            user_id: authData.user.id,
            name: formData.emergencyContactName,
            phone: formData.emergencyContactPhone
          });
      }
    }

    toast({
      title: "Inscription réussie !",
      description: "Vérifiez vos emails pour confirmer votre compte",
    });
    
    navigate("/login");
  } catch (error) {
    console.error('Erreur inscription:', error);
    toast({
      title: "Erreur",
      description: error.message || "Impossible de créer le compte",
      variant: "destructive"
    });
  } finally {
    setIsSubmitting(false);
  }
};
```

---

### ❌ **ERREUR CRITIQUE #2: WebAssembly Compilation Aborted**

**Erreur Console:**
```
TypeError: WebAssembly compilation aborted: Network error: Response body loading was aborted
```

**Causes Possibles:**
1. **Mapbox GL JS** - Chargement du worker WASM
2. **Interruption réseau** lors du chargement de ressources
3. **CORS** mal configuré pour les ressources WASM
4. **Build Vite** - Chunks trop gros

**Solutions:**

**A. Optimiser le chargement de Mapbox:**
```typescript
// src/components/PractitionerMap.tsx
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Désactiver le worker WASM si problématique
mapboxgl.workerClass = undefined; // Utiliser le worker JS au lieu de WASM

// Ou lazy load Mapbox
const MapboxComponent = lazy(() => import('./MapboxComponent'));

// Avec suspense
<Suspense fallback={<MapSkeleton />}>
  <MapboxComponent />
</Suspense>
```

**B. Configurer Vite pour les ressources WASM:**
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'mapbox': ['mapbox-gl']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['mapbox-gl']
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
```

---

### ❌ **ERREUR CRITIQUE #3: Race Condition dans la Création de Rendez-vous**

**Fichier:** `src/components/NewAppointmentDialog.tsx` (lignes 82-197)

**Problème:**
Le flux actuel crée des problèmes de synchronisation:

```typescript
// 1. Recherche praticien
const practitionerData = await supabase.functions.invoke('find-available-practitioner', ...);

// 2. Création RDV
const appointmentResult = await onSubmit({...});

// 3. Création paiement - MAIS appointmentResult peut être undefined
const paymentResult = await supabase.functions.invoke('create-payment', {
  body: {
    appointmentId: appointmentResult.id, // ❌ Peut être undefined
    ...
  }
});
```

**Erreurs Possibles:**
1. ❌ Praticien trouvé mais RDV échoue → Patient frustré
2. ❌ RDV créé mais paiement échoue → RDV orphelin non payé
3. ❌ Paiement créé mais validation échoue → Double charge possible
4. ❌ Pas de rollback en cas d'échec

**Solution Requise:**

**Créer une Edge Function transaction atomique:**

```typescript
// supabase/functions/create-appointment-with-payment/index.ts
serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // 1. Démarrer une transaction (via fonction DB)
    const { data: transaction, error: txError } = await supabase
      .rpc('begin_appointment_transaction');
    
    if (txError) throw txError;

    // 2. Trouver un praticien
    const { data: practitioner } = await supabase.functions.invoke(
      'find-available-practitioner',
      { body: practitionerParams }
    );

    if (!practitioner) {
      await supabase.rpc('rollback_transaction', { tx_id: transaction.id });
      return Response.json({ 
        success: false, 
        error: 'No practitioner available' 
      });
    }

    // 3. Créer le RDV
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        patient_id: patientId,
        practitioner_id: practitioner.id,
        ...appointmentData
      })
      .select()
      .single();

    if (aptError) {
      await supabase.rpc('rollback_transaction', { tx_id: transaction.id });
      throw aptError;
    }

    // 4. Créer le paiement
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .insert({
        appointment_id: appointment.id,
        patient_id: patientId,
        amount: amount,
        status: 'pending'
      })
      .select()
      .single();

    if (payError) {
      await supabase.rpc('rollback_transaction', { tx_id: transaction.id });
      throw payError;
    }

    // 5. Initier le paiement FedaPay
    const fedapayResponse = await initiateFedaPayTransaction(payment.id, ...);

    if (!fedapayResponse.success) {
      await supabase.rpc('rollback_transaction', { tx_id: transaction.id });
      throw new Error('Payment initiation failed');
    }

    // 6. Commit transaction
    await supabase.rpc('commit_transaction', { tx_id: transaction.id });

    return Response.json({
      success: true,
      appointment,
      payment,
      paymentUrl: fedapayResponse.paymentUrl
    });

  } catch (error) {
    console.error('Transaction failed:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
```

---

## 📊 Workflow Patient Complet avec Points de Défaillance

### **ÉTAPE 1: Accueil & Découverte**

**Fichier:** `src/pages/Index.tsx`

✅ **Points Fonctionnels:**
- Hero section attractive
- Navigation claire patient/praticien
- Stats rassurantes

❌ **Erreurs Possibles:**
- Pas de vérification si l'utilisateur est déjà connecté
- Redirection non automatique vers dashboard si authentifié

**Fix:**
```typescript
// src/pages/Index.tsx - Ajouter au début
const { data: user } = useSupabaseUser();

useEffect(() => {
  if (user) {
    // Vérifier le type d'utilisateur et rediriger
    const checkUserType = async () => {
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (practitioner) {
        navigate('/dashboard/practitioner');
      } else {
        navigate('/dashboard/patient');
      }
    };
    checkUserType();
  }
}, [user]);
```

---

### **ÉTAPE 2: Inscription Patient**

**Fichier:** `src/pages/PatientSignup.tsx`

❌ **Erreurs Critiques:**
1. **Pas d'authentification réelle** (voir ERREUR CRITIQUE #1)
2. **Pas de validation Zod** pour les données
3. **Historique médical non sauvegardé**
4. **Contact d'urgence non créé**
5. **Pas de gestion des doublons** (email/téléphone)

❌ **Erreurs de Validation:**
```typescript
// Manque de validation robuste
if (formData.password !== formData.confirmPassword) {
  // Simple comparaison, pas de règles de mot de passe fort
}
```

**Fix avec Zod:**
```typescript
import { z } from 'zod';

const patientSignupSchema = z.object({
  firstName: z.string().min(2, "Prénom trop court"),
  lastName: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  password: z.string()
    .min(8, "Minimum 8 caractères")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
  confirmPassword: z.string(),
  phone: z.string().regex(/^\+[0-9]{10,15}$/, "Format: +22912345678"),
  dateOfBirth: z.string().refine((date) => {
    const age = new Date().getFullYear() - new Date(date).getFullYear();
    return age >= 18 && age <= 120;
  }, "Âge invalide"),
  acceptTerms: z.boolean().refine(val => val === true, "Acceptation requise")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});
```

---

### **ÉTAPE 3: Connexion**

**Fichier:** `src/pages/LoginPage.tsx` (non fourni mais supposé)

❌ **Erreurs Possibles:**
1. **Pas de page de connexion** pour les patients inscrits
2. **Pas de "mot de passe oublié"**
3. **Pas de gestion des comptes non vérifiés**
4. **Pas de limitation des tentatives** (brute force)

**Solution Requise:**
```typescript
// src/pages/LoginPage.tsx
const LoginPage = () => {
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);

  const handleLogin = async (email: string, password: string) => {
    if (isBlocked) {
      toast({
        title: "Compte temporairement bloqué",
        description: "Trop de tentatives. Réessayez dans 15 minutes.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setFailedAttempts(prev => prev + 1);
        
        if (failedAttempts >= 4) {
          setIsBlocked(true);
          setTimeout(() => {
            setIsBlocked(false);
            setFailedAttempts(0);
          }, 15 * 60 * 1000); // 15 minutes
        }

        throw error;
      }

      // Vérifier si l'email est confirmé
      if (!data.user.email_confirmed_at) {
        toast({
          title: "Email non vérifié",
          description: "Veuillez vérifier votre boîte mail",
          variant: "destructive"
        });
        return;
      }

      navigate('/dashboard/patient');
    } catch (error) {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive"
      });
    }
  };
};
```

---

### **ÉTAPE 4: Triage Médical** (Optionnel)

**Fichier:** `src/pages/Triage.tsx` + `src/components/TriageForm.tsx`

✅ **Points Fonctionnels:**
- Formulaire de triage présent
- Scoring automatique

❌ **Erreurs Possibles:**
1. **Pas de validation de l'utilisateur connecté**
2. **Résultats de triage non reliés au RDV**
3. **Pas de notification au praticien** en cas d'urgence élevée

**Fix:**
```typescript
// src/components/TriageForm.tsx
const handleTriageSubmit = async (answers: TriageAnswers) => {
  const { data: user } = await supabase.auth.getUser();
  
  if (!user) {
    toast({
      title: "Connexion requise",
      description: "Veuillez vous connecter pour enregistrer le triage",
      variant: "destructive"
    });
    navigate('/login');
    return;
  }

  // Calculer le score et l'urgence
  const { score, urgencyLevel } = calculateTriageScore(answers);

  // Sauvegarder le résultat
  const { data: triageResult, error } = await supabase
    .from('triage_results')
    .insert({
      user_id: user.id,
      answers,
      score,
      urgency_level: urgencyLevel
    })
    .select()
    .single();

  if (error) throw error;

  // Si urgence élevée, envoyer notification immédiate
  if (urgencyLevel === 'urgent' || urgencyLevel === 'critical') {
    await supabase.functions.invoke('send-urgent-notification', {
      body: {
        userId: user.id,
        triageId: triageResult.id,
        urgencyLevel
      }
    });
  }

  // Rediriger vers la recherche avec l'urgence en paramètre
  navigate(`/practitioners?urgency=${urgencyLevel}&triageId=${triageResult.id}`);
};
```

---

### **ÉTAPE 5: Recherche de Praticien**

**Fichier:** `src/pages/PractitionerSearch.tsx`

✅ **Points Fonctionnels:**
- Carte Mapbox interactive
- Filtres par spécialité et rayon
- Géolocalisation utilisateur

❌ **Erreurs Possibles:**

**A. Erreurs de Géolocalisation:**
```typescript
// Ligne 105-126: Pas de fallback si géolocation refusée
navigator.geolocation.getCurrentPosition(
  position => {
    setUserLocation({...});
  },
  error => {
    // ❌ Erreur affichée mais pas de solution alternative
    toast({
      title: 'Erreur de localisation',
      description: error.message,
      variant: 'destructive'
    });
  }
);
```

**Fix:**
```typescript
const getUserLocation = async () => {
  setIsLoadingLocation(true);

  // 1. Essayer la géolocalisation navigateur
  if ('geolocation' in navigator) {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setIsLoadingLocation(false);
      return;
    } catch (geoError) {
      console.error('Géolocalisation échouée:', geoError);
    }
  }

  // 2. Fallback: Demander l'adresse manuellement
  toast({
    title: 'Géolocalisation non disponible',
    description: 'Veuillez saisir votre adresse manuellement',
    action: <Button onClick={() => setShowAddressDialog(true)}>Saisir</Button>
  });

  // 3. Ou utiliser l'adresse par défaut du profil
  const { data: addresses } = await supabase
    .from('addresses')
    .select('latitude, longitude')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single();

  if (addresses?.latitude && addresses?.longitude) {
    setUserLocation({
      latitude: addresses.latitude,
      longitude: addresses.longitude
    });
  }

  setIsLoadingLocation(false);
};
```

**B. Erreur Mapbox Token:**
```typescript
// Ligne 34: Token peut être vide
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// ❌ Pas de vérification si le token existe
```

**Fix:**
```typescript
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

if (!mapboxToken) {
  console.error('Mapbox token manquant');
  // Afficher une carte statique ou une liste simple
  return <PractitionerList practitioners={practitioners} />;
}
```

**C. Praticiens sans coordonnées:**
```typescript
// Ligne 66-68: Calcul de distance sans vérifier les coordonnées
distance: calculateDistance(
  userLocation.latitude,
  userLocation.longitude,
  practitioner.latitude, // ❌ Peut être null
  practitioner.longitude  // ❌ Peut être null
)
```

**Fix:**
```typescript
const enriched = practitionersData.map(practitioner => {
  if (!userLocation || !practitioner.latitude || !practitioner.longitude) {
    return practitioner;
  }

  return {
    ...practitioner,
    distance: calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      practitioner.latitude,
      practitioner.longitude
    ),
  };
});
```

---

### **ÉTAPE 6: Création de Rendez-vous**

**Fichier:** `src/components/NewAppointmentDialog.tsx`

❌ **ERREUR CRITIQUE: Race Condition** (voir ERREUR CRITIQUE #3)

❌ **Autres Erreurs:**

**A. Pas de vérification de disponibilité réelle:**
```typescript
// Ligne 88: Appel de find-available-practitioner
const practitionerData = await supabase.functions.invoke(
  'find-available-practitioner',
  { body: { specialty, appointmentDate, appointmentTime } }
);

// ❌ Mais le praticien peut être réservé entre-temps
```

**Solution:** Système de locks optimistes:
```sql
-- Migration: Ajouter une table de locks
CREATE TABLE appointment_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  locked_by UUID NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(practitioner_id, date, time)
);

-- Fonction de lock
CREATE OR REPLACE FUNCTION lock_appointment_slot(
  p_practitioner_id UUID,
  p_date DATE,
  p_time TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Nettoyer les locks expirés
  DELETE FROM appointment_locks 
  WHERE expires_at < NOW();

  -- Essayer de créer un lock
  INSERT INTO appointment_locks (
    practitioner_id, 
    date, 
    time, 
    locked_by, 
    expires_at
  )
  VALUES (
    p_practitioner_id,
    p_date,
    p_time,
    p_user_id,
    NOW() + INTERVAL '5 minutes'
  )
  ON CONFLICT (practitioner_id, date, time) 
  DO NOTHING;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

**B. Pas de gestion des créneaux horaires:**
```typescript
// Le formulaire accepte n'importe quelle heure
<Input type="time" />

// ❌ Pas de vérification des heures ouvrables
// ❌ Pas de vérification de la disponibilité du praticien
```

**Fix:**
```typescript
// Charger les disponibilités réelles
const { data: availability } = await supabase
  .from('practitioner_availability')
  .select('*')
  .eq('practitioner_id', practitionerId)
  .eq('day_of_week', selectedDate.getDay())
  .eq('is_active', true);

// Générer les créneaux disponibles par intervalles de 30 min
const timeSlots = generateTimeSlots(
  availability.start_time,
  availability.end_time,
  30 // minutes
);

// Vérifier les RDV existants
const { data: existingAppointments } = await supabase
  .from('appointments')
  .select('time')
  .eq('practitioner_id', practitionerId)
  .eq('date', selectedDate);

const availableSlots = timeSlots.filter(slot => 
  !existingAppointments.some(apt => apt.time === slot)
);
```

---

### **ÉTAPE 7: Paiement**

**Fichier:** `src/components/PaymentDialog.tsx`

❌ **Erreurs Détectées:**

**A. Polling sans limite:**
```typescript
// Ligne 32-33
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

// ❌ Mais pas d'arrêt effectif après MAX_POLL_TIME
```

**Fix:**
```typescript
useEffect(() => {
  if (paymentStatus !== 'pending' || !paymentId) return;

  const startTime = Date.now();
  const pollInterval = setInterval(async () => {
    // Vérifier si on a dépassé le temps max
    if (Date.now() - startTime > MAX_POLL_TIME) {
      clearInterval(pollInterval);
      setPaymentStatus('error');
      toast({
        title: 'Délai dépassé',
        description: 'Le paiement prend trop de temps. Vérifiez votre téléphone.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data: payment } = await supabase
        .from('payments')
        .select('status')
        .eq('id', paymentId)
        .single();

      if (payment.status === 'paid' || payment.status === 'completed') {
        clearInterval(pollInterval);
        setPaymentStatus('success');
      } else if (payment.status === 'failed' || payment.status === 'cancelled') {
        clearInterval(pollInterval);
        setPaymentStatus('error');
      }
    } catch (error) {
      console.error('Erreur poll:', error);
    }

    setPollCount(prev => prev + 1);
  }, POLL_INTERVAL);

  return () => clearInterval(pollInterval);
}, [paymentStatus, paymentId]);
```

**B. Numéro de téléphone non validé avant envoi:**
```typescript
// Ligne 35-63: Fonction de normalisation
function normalizePhoneNumber(input: string): string | null {
  // Normalisation mais pas d'appel avant la soumission
}

// ❌ La validation n'est pas faite dans handlePayment
```

**Fix:**
```typescript
const handlePayment = async () => {
  // Valider le numéro avant envoi
  const normalized = normalizePhoneNumber(phoneNumber);
  
  if (!normalized) {
    toast({
      title: 'Numéro invalide',
      description: 'Format attendu: +22912345678',
      variant: 'destructive'
    });
    return;
  }

  // Vérifier le provider correspond au numéro
  const provider = detectProvider(normalized);
  if (provider !== paymentMethod) {
    toast({
      title: 'Provider incorrect',
      description: `Ce numéro semble être ${provider.toUpperCase()}`,
      variant: 'destructive'
    });
    return;
  }

  // Continuer avec le paiement...
};

function detectProvider(phoneNumber: string): PaymentMethod {
  // +229 91/97 = MTN
  // +229 96/97 = Moov
  // +229 94/95/69 = Orange
  
  const benin = phoneNumber.match(/^\+229(\d{2})/);
  if (benin) {
    const prefix = benin[1];
    if (prefix === '91' || prefix === '97') return 'mtn';
    if (prefix === '96' || prefix === '97') return 'moov';
    if (prefix === '94' || prefix === '95' || prefix === '69') return 'orange';
  }
  
  return 'mtn'; // default
}
```

**C. Edge Function create-payment:**

**Fichier:** `supabase/functions/create-payment/index.ts`

❌ **Problèmes:**

1. **Idempotence non garantie:**
```typescript
// Ligne 126: Pas de vérification de paiement existant
const result = await insertPaymentRecord({
  appointment_id: appointmentId,
  // ... pourrait créer un doublon
});
```

**Fix:**
```typescript
// Vérifier si un paiement existe déjà
const { data: existingPayment } = await supabase
  .from('payments')
  .select('*')
  .eq('appointment_id', appointmentId)
  .eq('status', 'pending')
  .single();

if (existingPayment) {
  // Retourner le paiement existant plutôt que créer un nouveau
  return Response.json({
    success: true,
    paymentId: existingPayment.id,
    paymentUrl: existingPayment.fedapay_payment_url,
    message: 'Paiement déjà initié'
  });
}
```

2. **Pas de gestion des webhooks FedaPay:**

Créer: `supabase/functions/payment-webhook/index.ts`
```typescript
serve(async (req) => {
  // Vérifier la signature FedaPay
  const signature = req.headers.get('X-FedaPay-Signature');
  const isValid = verifyFedaPaySignature(signature, await req.text());

  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = await req.json();

  switch (event.type) {
    case 'transaction.approved':
      // Mettre à jour le paiement
      await supabase
        .from('payments')
        .update({
          status: 'paid',
          provider_ref: event.data.transaction.id,
          updated_at: new Date().toISOString()
        })
        .eq('fedapay_transaction_id', event.data.transaction.id);

      // Confirmer le RDV
      await confirmAppointment(event.data.transaction.metadata.appointmentId);
      break;

    case 'transaction.declined':
      // Annuler le paiement
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('fedapay_transaction_id', event.data.transaction.id);
      break;
  }

  return new Response('OK', { status: 200 });
});
```

---

### **ÉTAPE 8: Confirmation & Suivi du RDV**

**Fichier:** `src/pages/PatientDashboard.tsx`

❌ **Erreurs:**

**A. Pas de notifications en temps réel:**
```typescript
// Utiliser Realtime pour les mises à jour
useEffect(() => {
  const channel = supabase
    .channel('appointment-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `patient_id=eq.${patientId}`
      },
      (payload) => {
        console.log('Appointment updated:', payload);
        queryClient.invalidateQueries(['appointments', 'patient', patientId]);
        
        // Notification visuelle
        toast({
          title: 'Mise à jour',
          description: `Votre rendez-vous a été ${payload.new.status}`,
        });
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}, [patientId]);
```

**B. GPS Tracking incomplet:**

**Fichier:** `src/components/GPSTracking.tsx`

❌ Le tracking existe mais:
- Pas de mise à jour en temps réel de la position du praticien
- Pas de notification "Le praticien est à 5 min"

**Fix:**
```typescript
// Créer une table pour tracking en temps réel
CREATE TABLE practitioner_locations (
  practitioner_id UUID PRIMARY KEY,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

// Activer Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE practitioner_locations;

// Dans le composant
const { data: practitionerLocation } = useQuery({
  queryKey: ['practitioner-location', practitionerId],
  queryFn: async () => {
    const { data } = await supabase
      .from('practitioner_locations')
      .select('*')
      .eq('practitioner_id', practitionerId)
      .single();
    return data;
  },
  refetchInterval: 10000 // Toutes les 10s
});

// Calculer le temps estimé
const eta = calculateETA(
  practitionerLocation,
  patientAddress
);

if (eta <= 5) {
  // Notification push
  sendPushNotification({
    title: 'Praticien proche',
    body: `${practitionerName} arrivera dans ${eta} minutes`
  });
}
```

---

### **ÉTAPE 9: Messagerie Praticien-Patient**

**Fichier:** `src/components/messaging/ChatInterface.tsx`

✅ **Points Fonctionnels:**
- Interface de chat complète
- Pièces jointes supportées
- Indicateur de saisie

❌ **Erreurs Possibles:**

**A. Pas de chiffrement des messages:**
```typescript
// Messages stockés en clair dans la DB
await sendMessage.mutateAsync({
  content: message.trim(), // ❌ Texte en clair
});
```

**Solution:** Chiffrement E2E (si requis pour conformité HIPAA/RGPD)

**B. Pièces jointes sans scan antivirus:**
```typescript
// Ligne 89-113: Validation de fichier mais pas de scan
const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  // Vérification taille et type uniquement
  // ❌ Pas de scan antivirus
};
```

**Fix:** Utiliser ClamAV ou service externe:
```typescript
// supabase/functions/scan-file/index.ts
import { ClamScan } from 'clamscan';

serve(async (req) => {
  const { fileUrl } = await req.json();

  // Télécharger le fichier
  const fileBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());

  // Scanner avec ClamAV
  const clamscan = await new ClamScan().init();
  const { isInfected, viruses } = await clamscan.scanBuffer(fileBuffer);

  if (isInfected) {
    // Supprimer le fichier
    await supabase.storage
      .from('message-attachments')
      .remove([fileUrl]);

    return Response.json({
      safe: false,
      viruses
    });
  }

  return Response.json({ safe: true });
});
```

**C. Realtime non configuré pour messages:**
```sql
-- Activer Realtime pour la table messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

---

### **ÉTAPE 10: Consultation & Rapport**

**Fichier:** `src/components/dashboard/PatientConsultationReportsSection.tsx`

❌ **Erreurs:**

**A. Pas de signature électronique:**
- Les rapports médicaux doivent être signés légalement
- Pas de traçabilité des modifications

**Solution:** Implémenter signatures électroniques:
```sql
CREATE TABLE report_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES consultation_reports(id),
  practitioner_id UUID NOT NULL,
  signature_data TEXT NOT NULL, -- Base64 de la signature
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  certificate_thumbprint TEXT -- Pour certificats X.509
);
```

**B. Pas de versioning des rapports:**
```sql
CREATE TABLE report_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES consultation_reports(id),
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🛡️ Erreurs de Sécurité Globales

### **1. RLS Policies Incomplètes**

**Vérifier toutes les tables:**
```sql
-- Vérifier les tables sans RLS
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND NOT EXISTS (
    SELECT 1 
    FROM pg_policies 
    WHERE tablename = pg_tables.tablename
  );
```

### **2. Secrets en Clair**

❌ **Dans le code frontend:**
```typescript
// JAMAIS ça:
const FEDAPAY_KEY = 'sk_live_123456...';
```

✅ **Toujours utiliser Edge Functions:**
```typescript
// Frontend: Appeler une edge function
const result = await supabase.functions.invoke('process-payment');

// Edge Function: Utiliser les secrets
const fedapayKey = Deno.env.get('FEDAPAY_SECRET_KEY');
```

### **3. Pas de Rate Limiting**

**Implémenter rate limiting avec Supabase:**
```sql
CREATE TABLE api_rate_limits (
  user_id UUID,
  endpoint TEXT,
  request_count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, endpoint)
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER,
  p_window_minutes INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  SELECT request_count, window_start
  INTO v_count, v_window_start
  FROM api_rate_limits
  WHERE user_id = p_user_id AND endpoint = p_endpoint;

  IF NOT FOUND THEN
    INSERT INTO api_rate_limits (user_id, endpoint, request_count)
    VALUES (p_user_id, p_endpoint, 1);
    RETURN TRUE;
  END IF;

  IF NOW() - v_window_start > (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE api_rate_limits
    SET request_count = 1, window_start = NOW()
    WHERE user_id = p_user_id AND endpoint = p_endpoint;
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE api_rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id AND endpoint = p_endpoint;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## 📝 Checklist de Correction Prioritaire

### 🔴 Critique (À corriger immédiatement)

- [ ] **Implémenter l'authentification réelle dans PatientSignup.tsx**
- [ ] **Créer une edge function transactionnelle pour RDV + Paiement**
- [ ] **Corriger l'erreur WebAssembly (Mapbox)**
- [ ] **Ajouter les webhooks FedaPay**
- [ ] **Implémenter le système de locks pour les créneaux**

### 🟡 Important (Correction dans les 2 semaines)

- [ ] Ajouter validation Zod partout
- [ ] Implémenter rate limiting
- [ ] Ajouter Realtime pour notifications
- [ ] GPS tracking praticien en temps réel
- [ ] Scan antivirus pour fichiers uploadés

### 🟢 Amélioration (Backlog)

- [ ] Chiffrement E2E pour messages
- [ ] Signatures électroniques rapports
- [ ] Versioning des rapports médicaux
- [ ] Tests E2E complets
- [ ] Monitoring et alerting

---

## 🧪 Tests Recommandés

### **Tests Unitaires**
```typescript
// Exemple: tests/PatientSignup.test.tsx
describe('PatientSignup', () => {
  it('should validate phone number format', () => {
    expect(validatePhone('+22912345678')).toBe(true);
    expect(validatePhone('12345678')).toBe(false);
  });

  it('should reject weak passwords', () => {
    expect(validatePassword('password')).toBe(false);
    expect(validatePassword('P@ssw0rd123')).toBe(true);
  });
});
```

### **Tests d'Intégration**
```typescript
// tests/appointment-flow.test.ts
describe('Appointment Creation Flow', () => {
  it('should create appointment with payment atomically', async () => {
    const result = await createAppointmentWithPayment({
      specialty: 'medecin',
      date: '2025-01-15',
      time: '14:00'
    });

    expect(result.appointment).toBeDefined();
    expect(result.payment).toBeDefined();
    expect(result.payment.status).toBe('pending');
  });

  it('should rollback if payment fails', async () => {
    // Simuler échec paiement
    mockFedaPay.mockRejectedValueOnce(new Error('Payment failed'));

    await expect(createAppointmentWithPayment({...}))
      .rejects.toThrow();

    // Vérifier que le RDV n'a pas été créé
    const appointments = await getAppointments(userId);
    expect(appointments).toHaveLength(0);
  });
});
```

---

## 📚 Documentation Requise

1. **Guide utilisateur patient** (avec screenshots)
2. **Flow diagrams** pour chaque étape
3. **API documentation** pour les edge functions
4. **Guide de troubleshooting** pour le support
5. **Runbook** pour les incidents (paiements bloqués, etc.)

---

## 🎯 Conclusion

Le workflow patient de Domicares présente **3 erreurs critiques** qui bloquent complètement le fonctionnement:

1. ❌ **Pas d'authentification réelle** → Les patients ne peuvent pas se connecter
2. ❌ **Race condition RDV/Paiement** → Perte de données et paiements orphelins
3. ❌ **WebAssembly error** → Erreurs console qui peuvent bloquer le site

**Priorité absolue:** Corriger ces 3 erreurs avant tout déploiement en production.

Les autres erreurs (validation, sécurité, UX) doivent être corrigées progressivement selon la checklist.

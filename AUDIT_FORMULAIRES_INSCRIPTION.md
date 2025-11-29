# 🔧 AUDIT FORMULAIRES INSCRIPTION - ERREURS BLOQUANTES

**Date:** 2025-11-29
**Fichiers analysés:** PractitionerSignup.tsx (1206 lignes), PatientSignup.tsx (606 lignes)
**Total erreurs bloquantes:** 15 erreurs

---

## 🔴 ERREURS BLOQUANTES - FORMULAIRE PRATICIEN (8 erreurs)

### ERREUR #1 - Pas de vérification téléphone unique AVANT signup
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 408-447
**Sévérité:** 🔴 BLOQUANTE
**Problème:** Le formulaire patient vérifie l'unicité du téléphone AVANT de créer le compte Supabase, mais pas le praticien. Résultat: compte créé mais edge function échoue ensuite car téléphone en double.
**Impact:** Compte Supabase créé mais profil praticien incomplet, utilisateur bloqué

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx, ajoute une vérification de l'unicité du téléphone AVANT la création du compte:

Ajoute AVANT la ligne 408 (avant supabase.auth.signUp):

// ✅ Vérifier l'unicité du téléphone AVANT inscription
const { data: existingPractitioner, error: phoneCheckError } = await supabase
  .from('practitioners')
  .select('id')
  .eq('phone', formData.phone)
  .maybeSingle();

if (phoneCheckError && phoneCheckError.code !== 'PGRST116') {
  throw phoneCheckError;
}

if (existingPractitioner) {
  toast({
    title: "Erreur",
    description: "Ce numéro de téléphone est déjà utilisé par un autre praticien",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}

// Ensuite continuer avec signUp...
```

---

### ERREUR #2 - console.error en production
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Ligne:** 522
**Sévérité:** 🟡 MOYENNE
**Problème:** console.error visible en production
**Impact:** Pollution console, fuite d'infos potentielles

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx ligne 522:

Remplace:
console.error('❌ Erreur création compte praticien:', {
  createError,
  createResult,
  details: createResult?.details
});

Par:
if (import.meta.env.DEV) {
  console.error('❌ Erreur création compte praticien:', {
    createError,
    createResult,
    details: createResult?.details
  });
}

Fais de même pour les lignes 578, 597, 602.
```

---

### ERREUR #3 - Conversion base64 sans try/catch
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 491-505
**Sévérité:** 🔴 BLOQUANTE
**Problème:** La conversion des fichiers en base64 n'a pas de try/catch. Si un fichier est corrompu, l'application crash.
**Impact:** Inscription impossible si fichier corrompu

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx lignes 491-505, sécurise la conversion base64:

Remplace:
// Convertir les fichiers en base64 pour l'edge function
const documentsBase64: Record<string, string> = {};
const fileKeys: (keyof SignupFormData)[] = ['profilePhoto', 'idDocument', 'diploma', 'licenseDocument'];

for (const key of fileKeys) {
  const file = formData[key] as File | null;
  if (file) {
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    documentsBase64[key] = base64;
  }
}

Par:
// Convertir les fichiers en base64 pour l'edge function
const documentsBase64: Record<string, string> = {};
const fileKeys: (keyof SignupFormData)[] = ['profilePhoto', 'idDocument', 'diploma', 'licenseDocument'];

try {
  for (const key of fileKeys) {
    const file = formData[key] as File | null;
    if (file) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            resolve(reader.result as string);
          } else {
            reject(new Error(`Impossible de lire le fichier ${key}`));
          }
        };
        reader.onerror = () => reject(new Error(`Erreur de lecture du fichier ${key}`));
        reader.readAsDataURL(file);
      });
      documentsBase64[key] = base64;
    }
  }
} catch (fileError) {
  toast({
    title: "Erreur",
    description: fileError instanceof Error ? fileError.message : "Erreur de lecture des fichiers",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}
```

---

### ERREUR #4 - Edge function échec = compte incomplet
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 508-576
**Sévérité:** 🔴 BLOQUANTE
**Problème:** Si l'edge function échoue, le compte Supabase est déjà créé mais le profil praticien n'existe pas. L'utilisateur ne peut ni se connecter normalement, ni refaire l'inscription.
**Impact:** Utilisateur bloqué définitivement

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx lignes 520-576, améliore la gestion d'échec de l'edge function:

Après la ligne 576 (après le toast d'erreur), ajoute:

// ⚠️ Le compte Supabase existe mais le profil praticien n'a pas pu être créé
// Proposer de supprimer le compte ou de réessayer
toast({
  title: "Compte en attente",
  description: "Votre compte email existe mais l'inscription n'est pas terminée. Connectez-vous pour finaliser.",
  duration: 10000,
});

// Sauvegarder les données d'inscription dans les user_metadata
await supabase.auth.updateUser({
  data: {
    pending_practitioner_data: {
      profileData,
      practitionerData,
      // Ne pas sauvegarder les documents base64 (trop gros)
      needsDocumentUpload: true,
    }
  }
});

// Déconnecter et rediriger vers login avec message
await supabase.auth.signOut();
navigate('/login?message=complete-signup&email=' + encodeURIComponent(formData.email));
```

---

### ERREUR #5 - Validation adresse incomplète
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 735-751
**Sévérité:** 🟠 HAUTE
**Problème:** L'adresse est validée mais latitude/longitude peuvent rester null si l'utilisateur tape manuellement au lieu d'utiliser l'autocomplete. Le praticien n'apparaîtra pas sur la carte.
**Impact:** Praticien invisible pour les patients

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx ligne 735-751, valide que les coordonnées GPS sont présentes:

Modifie AddressSearchInput pour accepter un prop requireCoordinates:

<AddressSearchInput
  label="Adresse complète"
  value={formData.address}
  onChange={(location) => {
    setFormData(prev => ({
      ...prev,
      address: location.address,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
    }));

    // Valider que les coordonnées sont présentes
    if (!location.latitude || !location.longitude) {
      setFieldErrors(prev => ({
        ...prev,
        address: "Veuillez sélectionner une adresse dans la liste pour obtenir la localisation GPS"
      }));
    } else {
      setFieldErrors(prev => ({ ...prev, address: "" }));
    }
  }}
  placeholder="Rechercher votre adresse au Bénin..."
  required
  error={fieldErrors.address}
  requireCoordinates={true}
/>

Et dans validateForm (ligne 269-275), ajoute:
if (!formData.latitude || !formData.longitude) {
  errors.address = "Localisation GPS requise. Sélectionnez une adresse dans la liste.";
}
```

---

### ERREUR #6 - Messages d'erreur générique signup
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 425-447
**Sévérité:** 🟡 MOYENNE
**Problème:** Les messages d'erreur lors du signup Supabase sont génériques. L'utilisateur ne sait pas quoi faire.
**Impact:** Mauvaise UX, support surchargé

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx lignes 425-447, améliore les messages d'erreur:

Remplace tout le bloc par:
if (error) {
  let userMessage = "Une erreur est survenue lors de l'inscription";
  let userDescription = "";

  const errorMsg = error.message.toLowerCase();

  if (errorMsg.includes('already registered') || errorMsg.includes('already been registered')) {
    userMessage = "Email déjà utilisé";
    userDescription = "Un compte existe déjà avec cet email. Utilisez 'Mot de passe oublié' si c'est le vôtre, ou essayez un autre email.";
  } else if (errorMsg.includes('password')) {
    userMessage = "Mot de passe invalide";
    userDescription = "Le mot de passe doit contenir au moins 8 caractères avec lettres et chiffres.";
  } else if (errorMsg.includes('email')) {
    userMessage = "Email invalide";
    userDescription = "Veuillez vérifier le format de votre adresse email.";
  } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many')) {
    userMessage = "Trop de tentatives";
    userDescription = "Veuillez patienter quelques minutes avant de réessayer.";
  } else {
    userDescription = error.message;
  }

  toast({
    title: userMessage,
    description: userDescription,
    variant: "destructive",
    duration: 8000,
  });
  setIsSubmitting(false);
  return;
}
```

---

### ERREUR #7 - Documents obligatoires pas vérifié côté serveur
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 335-377
**Sévérité:** 🟠 HAUTE
**Problème:** La validation des documents obligatoires (idDocument, diploma pour coach, licenseDocument pour autres) est faite côté client uniquement. Un utilisateur malveillant peut bypass.
**Impact:** Praticien sans documents peut s'inscrire

**PROMPT LOVABLE:**
```
Crée une validation côté serveur dans l'edge function create-practitioner-account:

Dans supabase/functions/create-practitioner-account/index.ts, ajoute au début:

// Validation documents obligatoires
const isCoachSportif = practitionerData.practitioner_type === 'coach_sportif';

if (!documents.idDocument) {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Pièce d'identité requise",
      details: ["Le document d'identité est obligatoire pour tous les praticiens"]
    }),
    { status: 400, headers: corsHeaders }
  );
}

if (isCoachSportif && !documents.diploma) {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Diplôme requis",
      details: ["Un diplôme ou certificat est obligatoire pour les coachs sportifs"]
    }),
    { status: 400, headers: corsHeaders }
  );
}

if (!isCoachSportif && !documents.licenseDocument) {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Autorisation d'exercice requise",
      details: ["L'autorisation d'exercice est obligatoire pour les praticiens de santé"]
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

---

### ERREUR #8 - Timeout sans retry sur edge function
**Fichier:** `src/pages/PractitionerSignup.tsx`
**Lignes:** 508-518
**Sévérité:** 🟠 HAUTE
**Problème:** L'appel à l'edge function utilise invokeEdgeFunctionWithRetry mais si timeout après tous les retries, l'inscription échoue définitivement.
**Impact:** Utilisateur doit tout recommencer

**PROMPT LOVABLE:**
```
Dans PractitionerSignup.tsx après l'échec de l'edge function (ligne 576), ajoute une option de retry manuel:

Remplace le code de la ligne 520-576 par:

if (createError || !createResult?.success) {
  const errorMessage = createError?.message || createResult?.error || "Échec de création du compte";

  // Déterminer si c'est un timeout ou une erreur de validation
  const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
  const isValidation = createResult?.details && Array.isArray(createResult.details);

  if (isTimeout) {
    // Proposer de réessayer
    toast({
      title: "Temps d'attente dépassé",
      description: (
        <div className="space-y-2">
          <p>La création du compte prend plus de temps que prévu.</p>
          <p className="text-sm">Cliquez sur 'Réessayer' ou actualisez la page pour finaliser.</p>
        </div>
      ),
      variant: "destructive",
      action: (
        <Button onClick={() => {
          // Réessayer l'edge function sans recréer le compte
          handleRetryEdgeFunction(userId, profileData, practitionerData, documentsBase64);
        }}>
          Réessayer
        </Button>
      ),
      duration: 30000,
    });

    setIsSubmitting(false);
    return;
  }

  // ... reste du code existant pour les autres erreurs
}

// Ajoute cette fonction avant handleSubmit:
const handleRetryEdgeFunction = async (
  userId: string,
  profileData: any,
  practitionerData: any,
  documents: any
) => {
  setIsSubmitting(true);

  const { data: createResult, error: createError } = await invokeEdgeFunctionWithRetry(
    'create-practitioner-account',
    { body: { userId, profileData, practitionerData, documents } }
  );

  if (createError || !createResult?.success) {
    toast({
      title: "Échec du retry",
      description: "Veuillez contacter le support avec votre email d'inscription",
      variant: "destructive"
    });
    setIsSubmitting(false);
    return;
  }

  // Continuer avec le succès...
  toast({ title: "Inscription réussie !", description: "Redirection en cours..." });
  navigate('/dashboard/practitioner', { replace: true });
};
```

---

## 🔴 ERREURS BLOQUANTES - FORMULAIRE PATIENT (7 erreurs)

### ERREUR #9 - Edge function échec = déconnexion forcée
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 254-275
**Sévérité:** 🔴 BLOQUANTE
**Problème:** Si l'edge function complete-user-registration échoue, le code force une déconnexion. L'utilisateur ne peut pas se reconnecter car le compte existe mais n'est pas finalisé.
**Impact:** Utilisateur bloqué, doit contacter le support

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 254-275, améliore la gestion d'échec:

Remplace:
if (registrationError) {
  console.error('Erreur lors de la finalisation:', registrationError);

  toast({
    ...AUTH_MESSAGES.SIGNUP_ERROR,
    description: "Compte créé mais finalisation incomplète. Reconnectez-vous pour terminer.",
    variant: "destructive"
  });

  // On déconnecte pour forcer l'utilisateur à se reconnecter et récupérer les données
  try {
    await supabase.auth.signOut();
  } catch (signOutError) {
    console.error('Erreur lors de la déconnexion:', signOutError);
  }

  setIsSubmitting(false);
  return;
}

Par:
if (registrationError) {
  if (import.meta.env.DEV) {
    console.error('Erreur lors de la finalisation:', registrationError);
  }

  // Ne PAS déconnecter, proposer de réessayer
  toast({
    title: "Finalisation en attente",
    description: "Votre compte est créé mais certaines données n'ont pas pu être sauvegardées.",
    variant: "destructive",
    action: (
      <Button onClick={() => handleRetryFinalization(userId, onboardingPayload)}>
        Réessayer
      </Button>
    ),
    duration: 30000,
  });

  setIsSubmitting(false);
  return;
}

// Ajoute cette fonction:
const handleRetryFinalization = async (userId: string, payload: any) => {
  setIsSubmitting(true);

  const { error } = await withTimeout(
    supabase.functions.invoke('complete-user-registration', {
      body: { userId, data: { userType: 'patient', ...payload } }
    })
  );

  if (error) {
    toast({
      title: "Échec du retry",
      description: "Veuillez vous déconnecter et vous reconnecter pour réessayer",
      variant: "destructive"
    });
  } else {
    toast({ title: "Finalisation réussie !", description: "Bienvenue sur Domicares" });
    navigate('/registration-success?type=patient', { replace: true });
  }

  setIsSubmitting(false);
};
```

---

### ERREUR #10 - Regex téléphone trop stricte
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 46-47, 58-59
**Sévérité:** 🟠 HAUTE
**Problème:** Le regex hardcode +229 pour le Bénin. Si utilisateur d'un autre pays, impossible de s'inscrire.
**Impact:** Service limité au Bénin uniquement

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 46-47 et 58-59, rends la validation téléphone flexible:

Remplace:
phone: z.string()
  .regex(/^\+229\d{8}$/, "Le numéro doit être au format +229XXXXXXXX"),

emergencyContactPhone: z.string()
  .regex(/^\+229\d{8}$/, "Le numéro doit être au format +229XXXXXXXX"),

Par:
phone: z.string()
  .regex(/^\+[1-9]\d{7,14}$/, "Le numéro doit être au format international (+XXX...)"),

emergencyContactPhone: z.string()
  .regex(/^\+[1-9]\d{7,14}$/, "Le numéro doit être au format international (+XXX...)"),

Et modifie les PhoneInput (lignes 438-448, 551-558) pour accepter d'autres pays:
<PhoneInput
  id="phone"
  value={formData.phone}
  onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
  defaultCountryCode="+229"
  allowedCountries={["+229", "+33", "+1", "+225"]}
  localNumberLength={8}
  className={validationErrors.phone ? "border-destructive" : ""}
/>
```

---

### ERREUR #11 - Vérification téléphone bloque cas légitime
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 166-185
**Sévérité:** 🟡 MOYENNE
**Problème:** Si un patient a déjà un compte avec le même téléphone mais email différent (ex: compte famille), il est bloqué.
**Impact:** Famille ne peut pas créer plusieurs comptes

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 166-185, améliore la vérification téléphone:

Remplace:
const { data: existingProfile, error: profileCheckError } = await supabase
  .from('profiles')
  .select('id')
  .eq('phone', formData.phone)
  .maybeSingle();

if (profileCheckError && profileCheckError.code !== 'PGRST116') {
  throw profileCheckError;
}

if (existingProfile) {
  toast({
    title: "Erreur",
    description: "Ce numéro de téléphone est déjà utilisé",
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}

Par:
// Vérifier si le téléphone est déjà utilisé avec le MÊME email
const { data: existingProfile, error: profileCheckError } = await supabase
  .from('auth.users')
  .select('id, email')
  .eq('phone', formData.phone)
  .maybeSingle();

if (profileCheckError && profileCheckError.code !== 'PGRST116') {
  throw profileCheckError;
}

if (existingProfile && existingProfile.email === formData.email) {
  toast({
    title: "Compte existant",
    description: "Un compte existe déjà avec cet email et ce téléphone. Veuillez vous connecter.",
    variant: "destructive",
    action: <Button onClick={() => navigate('/login')}>Se connecter</Button>
  });
  setIsSubmitting(false);
  return;
}

// Si téléphone utilisé mais email différent, permettre l'inscription
// (cas des comptes familiaux)
```

---

### ERREUR #12 - Email non confirmé = inscription incomplète
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 229-235
**Sévérité:** 🟠 HAUTE
**Problème:** Si l'email nécessite une confirmation, l'utilisateur est redirigé vers la page de confirmation MAIS les données du formulaire (adresse, contact urgence, etc.) ne sont pas sauvegardées.
**Impact:** Données perdues, utilisateur doit tout refaire

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 229-235, sauvegarde les données avant redirection:

Remplace:
if (authData.user && !authData.user.confirmed_at && !authData.session) {
  // Email non confirmé : rediriger vers page de confirmation
  toast(AUTH_MESSAGES.EMAIL_NEEDS_CONFIRMATION);
  navigateToEmailConfirmation(navigate, formData.email, 'patient');
  setIsSubmitting(false);
  return;
}

Par:
if (authData.user && !authData.user.confirmed_at && !authData.session) {
  // Sauvegarder les données dans user_metadata pour finalisation après confirmation
  await supabase.auth.updateUser({
    data: {
      pending_onboarding: onboardingPayload,
      needs_onboarding: true
    }
  });

  toast({
    ...AUTH_MESSAGES.EMAIL_NEEDS_CONFIRMATION,
    description: "Vos données sont sauvegardées. Après confirmation de l'email, vous pourrez finaliser votre inscription."
  });

  navigateToEmailConfirmation(navigate, formData.email, 'patient');
  setIsSubmitting(false);
  return;
}
```

---

### ERREUR #13 - Validation Zod bloque avant affichage
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 111-134
**Sévérité:** 🟡 MOYENNE
**Problème:** La validation Zod affiche seulement la PREMIÈRE erreur dans le toast, mais l'utilisateur ne voit pas toutes les erreurs du formulaire.
**Impact:** Mauvaise UX, utilisateur corrige une erreur à la fois

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 111-134, améliore l'affichage des erreurs:

Remplace:
if (error instanceof z.ZodError) {
  const errors: Record<string, string> = {};
  error.issues.forEach((err) => {
    if (err.path[0]) {
      errors[err.path[0].toString()] = err.message;
    }
  });
  setValidationErrors(errors);

  // Afficher la première erreur
  const firstError = error.issues[0];
  toast({
    title: "Erreur de validation",
    description: firstError.message,
    variant: "destructive"
  });
  setIsSubmitting(false);
  return;
}

Par:
if (error instanceof z.ZodError) {
  const errors: Record<string, string> = {};
  error.issues.forEach((err) => {
    if (err.path[0]) {
      errors[err.path[0].toString()] = err.message;
    }
  });
  setValidationErrors(errors);

  // Afficher TOUTES les erreurs dans le toast
  toast({
    title: `${error.issues.length} erreur(s) détectée(s)`,
    description: (
      <ul className="list-disc list-inside space-y-1 text-sm">
        {error.issues.slice(0, 5).map((issue, idx) => (
          <li key={idx}>{issue.message}</li>
        ))}
        {error.issues.length > 5 && (
          <li className="text-muted-foreground">+ {error.issues.length - 5} autre(s) erreur(s)</li>
        )}
      </ul>
    ),
    variant: "destructive",
    duration: 10000,
  });

  // Scroll vers la première erreur
  const firstErrorField = document.getElementById(error.issues[0].path[0]?.toString() || '');
  if (firstErrorField) {
    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstErrorField.focus();
  }

  setIsSubmitting(false);
  return;
}
```

---

### ERREUR #14 - Pas de retry sur withTimeout
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 187-201, 241-252
**Sévérité:** 🟠 HAUTE
**Problème:** Les appels avec withTimeout n'ont pas de retry automatique. Si timeout, l'inscription échoue directement.
**Impact:** Utilisateur doit tout recommencer en cas de connexion lente

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx, remplace withTimeout par une fonction avec retry:

Crée une fonction helper en haut du fichier:
const retryWithTimeout = async <T,>(
  promise: Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await withTimeout(promise);
    } catch (error) {
      if (i === retries - 1 || !(error instanceof NetworkTimeoutError)) {
        throw error;
      }
      // Attendre avant retry
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('Max retries reached');
};

Puis remplace les appels:
Ligne 187: const { data: authData, error: authError } = await retryWithTimeout(
Ligne 241: const { error: registrationError } = await retryWithTimeout(
```

---

### ERREUR #15 - Pas de validation âge minimum
**Fichier:** `src/pages/PatientSignup.tsx`
**Lignes:** 34-40
**Sévérité:** 🟡 MOYENNE
**Problème:** La validation Zod vérifie que l'âge est entre 0 et 120 ans, mais pas d'âge minimum (ex: 13 ans pour consentement).
**Impact:** Mineurs peuvent s'inscrire sans consentement parental

**PROMPT LOVABLE:**
```
Dans PatientSignup.tsx lignes 34-40, ajoute validation âge minimum:

Remplace:
dateOfBirth: z.string()
  .refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    return age >= 0 && age <= 120 && birthDate <= today;
  }, "Date de naissance invalide"),

Par:
dateOfBirth: z.string()
  .refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ? age - 1
      : age;

    if (actualAge < 0 || actualAge > 120) return false;
    if (birthDate > today) return false;

    // Âge minimum 13 ans pour utiliser le service
    return actualAge >= 13;
  }, "Vous devez avoir au moins 13 ans pour vous inscrire"),
```

---

## 📊 RÉCAPITULATIF

**Total erreurs bloquantes:** 15
- **Praticien:** 8 erreurs (5 bloquantes, 3 hautes)
- **Patient:** 7 erreurs (2 bloquantes, 5 hautes)

**Temps estimé correction:** 2-3 jours (1-2 prompts par session Lovable)

**Priorité d'exécution:**
1. 🔴 ERREUR #1 (Praticien) - Vérification téléphone
2. 🔴 ERREUR #3 (Praticien) - Try/catch base64
3. 🔴 ERREUR #4 (Praticien) - Edge function échec
4. 🔴 ERREUR #9 (Patient) - Déconnexion forcée
5. 🟠 ERREUR #5 (Praticien) - Validation GPS
6. 🟠 ERREUR #7 (Praticien) - Validation serveur documents
7. 🟠 ERREUR #8 (Praticien) - Retry timeout
8. 🟠 ERREUR #10 (Patient) - Regex téléphone flexible
9. 🟠 ERREUR #12 (Patient) - Sauvegarde données email
10. 🟠 ERREUR #14 (Patient) - Retry timeout

---

**Rapport généré le:** 2025-11-29
**Analysé par:** Claude Code
**Version:** 1.0

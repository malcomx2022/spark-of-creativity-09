# Guide de test - Inscription Coach Sportif

## Objectif

Tester le workflow complet d'inscription d'un coach sportif, de la création du compte jusqu'à l'activation après validation KYC.

## Prérequis

- Navigateur moderne (Chrome, Firefox, Safari)
- Connexion internet stable
- Documents de test prêts :
  - Photo de profil (JPG/PNG, < 5MB)
  - Pièce d'identité (PDF/JPG, < 5MB)
  - Diplôme ou certificat (PDF/JPG, < 5MB)

## Test 1 : Inscription complète - Flux nominal

### Données de test

```
INFORMATIONS PERSONNELLES:
- Prénom: Jean
- Nom: Dupont
- Date de naissance: 01/01/1990
- Sexe: Homme
- Adresse: 123 Avenue de la Paix, Cotonou
- Téléphone: +22996123456
- Email: coach.test.{timestamp}@example.com

INFORMATIONS PROFESSIONNELLES:
- Profession: Coach sportif
- Années d'expérience: 5

SPÉCIFICITÉS COACH SPORTIF:
- Types de séances: 
  ☑ Individuelle
  ☑ Duo
  ☑ Groupe
- Zone d'intervention: Cotonou et environs
- Rayon d'intervention: 15 km
- Certifications: Certificat coaching sportif, Nutrition sportive, BPJEPS

DOCUMENTS:
- Photo de profil: photo_coach.jpg
- Pièce d'identité: carte_identite.pdf
- Diplôme: diplome_coach.pdf

SÉCURITÉ:
- Mot de passe: TestCoach2025!
- Confirmation: TestCoach2025!
- ☑ Accepter la charte d'engagement
```

### Étapes du test

#### 1. Accès au formulaire

1. Aller sur `https://[votre-domaine]/signup`
2. Cliquer sur "Je suis un professionnel de santé"
3. Vérifier que le formulaire d'inscription praticien s'affiche

**Résultat attendu :**
- ✅ Formulaire d'inscription visible
- ✅ Titre "Inscription Praticien"
- ✅ Sections : Informations personnelles, Professionnelles, Documents, Sécurité

#### 2. Remplir les informations personnelles

1. Remplir Prénom, Nom
2. Sélectionner Date de naissance
3. Choisir Sexe
4. Remplir Adresse complète
5. Remplir Téléphone (format +229...)
6. Remplir Email (utiliser timestamp pour éviter doublons)

**Résultat attendu :**
- ✅ Tous les champs acceptent les données
- ✅ Format téléphone validé automatiquement
- ✅ Format email vérifié

#### 3. Sélectionner la profession

1. Dans "Profession", sélectionner "Coach sportif"

**Résultat attendu :**
- ✅ Les champs médicaux standards (spécialité, n° d'ordre, licence) disparaissent
- ✅ Une section "Informations spécifiques Coach Sportif" apparaît avec fond bleu clair
- ✅ Le champ "Autorisation d'exercice" n'est pas affiché dans les documents

#### 4. Remplir les informations coach sportif

1. Cocher au moins un type de séance (individuelle, duo, groupe)
2. Remplir la zone d'intervention (min 3 caractères)
3. Remplir le rayon d'intervention (entre 1 et 100)
4. Optionnel : Ajouter des certifications séparées par des virgules

**Résultats attendus :**
- ✅ Validation en temps réel des champs
- ✅ Message d'erreur si zone < 3 caractères
- ✅ Message d'erreur si rayon < 1 ou > 100
- ✅ Message d'erreur si aucun type de séance sélectionné

**Erreurs à tester :**
```
Zone = "Co" → ❌ "Zone d'intervention trop courte (min 3 caractères)"
Rayon = 0 → ❌ "Rayon entre 1 et 100 km"
Rayon = 150 → ❌ "Rayon entre 1 et 100 km"
Types séances = [] → ❌ "Au moins un type de séance requis"
```

#### 5. Uploader les documents

1. **Photo de profil** (optionnel) :
   - Cliquer sur "Choisir un fichier"
   - Sélectionner une image JPG/PNG < 5MB
   - Vérifier que le nom du fichier apparaît avec une coche verte ✓

2. **Pièce d'identité** (OBLIGATOIRE) :
   - Uploader un PDF ou JPG < 5MB
   - Vérifier la coche verte ✓

3. **Diplôme/Certificat** (optionnel) :
   - Uploader un PDF ou JPG < 5MB
   - Vérifier la coche verte ✓

4. **Vérifier** :
   - Le champ "Autorisation d'exercice" n'est PAS affiché
   - Un message indique : "Coach sportif : L'autorisation d'exercice n'est pas obligatoire"

**Résultats attendus :**
- ✅ Les fichiers sont acceptés
- ✅ Noms de fichiers affichés avec coche verte
- ✅ Pas de champ "Autorisation d'exercice"

**Erreurs à tester :**
```
Fichier > 5MB → ❌ "Fichier trop volumineux (max 5MB)"
Format .docx → ❌ "Type non supporté (PDF, JPG, PNG uniquement)"
Pas de pièce d'identité → ❌ "Pièce d'identité obligatoire"
```

#### 6. Définir le mot de passe

1. Remplir Mot de passe (min 8 caractères)
2. Confirmer le mot de passe (identique)
3. Cocher "J'accepte la charte d'engagement"

**Résultats attendus :**
- ✅ Validation du mot de passe (min 8 caractères)
- ✅ Vérification de la correspondance
- ✅ Case à cocher obligatoire

**Erreurs à tester :**
```
Mot de passe < 8 caractères → ❌ "Minimum 8 caractères requis"
Confirmation différente → ❌ "Les mots de passe ne correspondent pas"
Charte non acceptée → ❌ "Vous devez accepter la charte d'engagement"
```

#### 7. Soumettre le formulaire

1. Cliquer sur "S'inscrire"
2. Observer le bouton de chargement

**Résultats attendus :**
- ✅ Bouton devient "Inscription en cours..." avec icône de chargement
- ✅ Formulaire désactivé pendant la soumission
- ✅ Pas d'erreur de validation côté client

#### 8. Vérifier la création du compte

**Console du navigateur (F12) :**
```
✅ Création compte praticien atomique: [userId]
✅ Profil créé
✅ Upload documents...
✅ profilePhoto uploadé: [path]
✅ idDocument uploadé: [path]
✅ diploma uploadé: [path]
✅ Documents uploadés: {...}
✅ Praticien créé
✅ Notifications KYC envoyées
✅ Compte praticien créé avec succès
✅ Notification envoyée avec succès
```

**Résultats attendus :**
- ✅ Pas d'erreur dans la console
- ✅ Tous les logs affichent des checkmarks verts
- ✅ Redirection automatique vers `/registration-success?type=practitioner&practitionerType=coach_sportif`

#### 9. Page de confirmation

**Éléments à vérifier :**
- ✅ Message "Inscription réussie !"
- ✅ Texte indique que le dossier est en cours de validation
- ✅ Bouton "Accéder à mon tableau de bord"
- ✅ Mention du délai de validation (24-48h)

#### 10. Vérifier l'email de confirmation

**Email reçu :**
- ✅ Expéditeur: DomiCares
- ✅ Objet: "Inscription réussie - DomiCares"
- ✅ Contenu mentionne :
  - Nom du coach
  - Email utilisé
  - Statut "en attente de validation"
  - Délai de validation
  - Lien vers le dashboard

**SMS reçu (si activé) :**
```
Bienvenue sur DomiCares ! Votre inscription en tant que coach sportif a été effectuée. 
Votre dossier sera validé sous 24-48h. Connectez-vous sur [lien]
```

#### 11. Accéder au dashboard

1. Cliquer sur "Accéder à mon tableau de bord"
2. Vérifier l'URL de redirection

**Résultats attendus :**
- ✅ Redirection vers `/dashboard/coach` (PAS `/dashboard/practitioner`)
- ✅ Dashboard coach sportif s'affiche
- ✅ Message "Compte en attente de validation KYC"
- ✅ Section "Créer une séance de groupe" visible mais désactivée
- ✅ Section "Documents KYC" affiche :
  - Badge "En attente"
  - Documents uploadés
  - Message "Vos documents sont en cours de vérification..."

#### 12. Vérifier les données en base

**SQL à exécuter :**
```sql
-- Vérifier le profil
SELECT id, full_name, phone, gender, date_of_birth
FROM profiles
WHERE id = '[USER_ID]';

-- Vérifier le praticien
SELECT 
  id, name, user_id, phone, specialty, practitioner_type,
  session_types, intervention_zone, intervention_radius, certifications,
  kyc_status, can_accept_missions,
  image, id_document_url, license_document_url, insurance_document_url
FROM practitioners
WHERE user_id = '[USER_ID]';
```

**Résultats attendus :**
```sql
-- Profil
✅ full_name = "Jean Dupont"
✅ phone = "+22996123456"
✅ gender = "homme"

-- Praticien
✅ practitioner_type = "coach_sportif"
✅ specialty = "Coach sportif"
✅ session_types = ["individuelle", "duo", "groupe"]
✅ intervention_zone = "Cotonou et environs"
✅ intervention_radius = 15
✅ certifications = ["Certificat coaching sportif", "Nutrition sportive", "BPJEPS"]
✅ kyc_status = "pending"
✅ can_accept_missions = false
✅ image = "practitioner-documents/[user-id]/[timestamp]-profilePhoto.jpg"
✅ id_document_url = "practitioner-documents/[user-id]/[timestamp]-idDocument.pdf"
✅ license_document_url = NULL (correct pour coach)
✅ insurance_document_url = "practitioner-documents/[user-id]/[timestamp]-diploma.pdf"
```

**Vérifier que TOUS les documents utilisent un chemin relatif :**
- ❌ Si `image` contient "https://s3.wasabisys.com..." → PROBLÈME
- ✅ Si `image` contient "practitioner-documents/..." → CORRECT

#### 13. Vérifier les notifications admin

**SQL :**
```sql
SELECT user_id, title, message, type, link, created_at
FROM notifications
WHERE type = 'kyc_pending'
AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

**Résultats attendus :**
- ✅ Au moins une notification pour les admins
- ✅ Title = "Nouveau dossier KYC à valider"
- ✅ Message mentionne le nom du coach
- ✅ Link = "/admin?tab=kyc"

## Test 2 : Validation des erreurs

### 2.1 Email déjà utilisé

1. Réutiliser l'email du test précédent
2. Remplir le formulaire complètement
3. Soumettre

**Résultat attendu :**
```
❌ Erreur affichée : "Cet email est déjà associé à un compte. 
   Connectez-vous ou utilisez un autre email."
```

### 2.2 Documents invalides

**Test 2.2.1 : Fichier trop volumineux**
1. Uploader un fichier > 5MB
2. Soumettre le formulaire

**Résultat attendu :**
```
❌ "Un ou plusieurs documents sont invalides. 
   Vérifiez le format (PDF, JPG, PNG uniquement) et la taille (maximum 5MB par fichier)."
```

**Test 2.2.2 : Format non supporté**
1. Uploader un fichier .docx ou .txt
2. Soumettre

**Résultat attendu :**
```
❌ "Un ou plusieurs documents sont invalides. 
   Vérifiez le format (PDF, JPG, PNG uniquement)..."
```

### 2.3 Champs coach sportif invalides

**Test 2.3.1 : Aucun type de séance**
1. Ne cocher aucun type de séance
2. Soumettre

**Résultat attendu :**
```
❌ "Au moins un type de séance requis"
```

**Test 2.3.2 : Zone d'intervention trop courte**
1. Entrer "Co" (2 caractères)
2. Soumettre

**Résultat attendu :**
```
❌ "Zone d'intervention trop courte (min 3 caractères)"
```

**Test 2.3.3 : Rayon invalide**
1. Entrer rayon = 0
2. Soumettre

**Résultat attendu :**
```
❌ "Rayon entre 1 et 100 km"
```

## Test 3 : Workflow KYC complet

### 3.1 État initial (pending)

**Dashboard coach :**
- ✅ Section "Documents KYC" avec badge "En attente"
- ✅ Message : "Vos documents sont en cours de vérification..."
- ✅ Documents affichés en lecture seule
- ✅ Impossible de créer des séances de groupe

### 3.2 Validation par l'admin

1. Se connecter en tant qu'admin
2. Aller sur `/admin?tab=kyc`
3. Trouver le coach dans la file d'attente

**File d'attente KYC :**
- ✅ Coach apparaît dans la liste
- ✅ Nom, email, spécialité affichés
- ✅ Type = "Coach Sportif"
- ✅ Bouton "Voir documents"

4. Cliquer sur "Voir documents"

**Dialog documents :**
- ✅ Affiche les informations coach sportif :
  - Types de séances
  - Zone d'intervention
  - Rayon d'intervention
  - Certifications
- ✅ Photo de profil s'affiche correctement
- ✅ Pièce d'identité s'affiche (PDF dans iframe ou image)
- ✅ Diplôme s'affiche
- ✅ "Autorisation d'exercice" affiche "Non fourni" (normal)

**CRITIQUE : Tester l'affichage des documents**
- Cliquer sur "Voir" pour chaque document
- Vérifier que le dialog s'ouvre
- Vérifier que le document se charge
- Si erreur → Noter le message exact

5. Cliquer sur "Approuver"
6. Ajouter un commentaire (optionnel)
7. Confirmer

**Résultats attendus :**
- ✅ Toast de succès "Dossier KYC approuvé"
- ✅ Coach disparaît de la file d'attente
- ✅ Status devient "approved" dans la BD
- ✅ Email/SMS envoyé au coach

### 3.3 Après validation

**Email coach :**
- ✅ Objet: "Votre compte DomiCares a été validé"
- ✅ Message de félicitations
- ✅ Lien vers le dashboard

**Dashboard coach :**
- ✅ Badge "Validé" sur les documents KYC
- ✅ Message : "Votre dossier KYC a été validé..."
- ✅ Section "Créer une séance de groupe" active
- ✅ Peut créer des séances

**SQL vérification :**
```sql
SELECT kyc_status, can_accept_missions, kyc_validated_at
FROM practitioners
WHERE id = '[PRACTITIONER_ID]';
```

**Résultats :**
- ✅ kyc_status = "approved"
- ✅ can_accept_missions = true
- ✅ kyc_validated_at = [timestamp récent]

## Test 4 : Cas de rejet

### 4.1 Rejet avec commentaire

1. Admin ouvre un dossier coach
2. Clique sur "Refuser"
3. Ajoute commentaire : "Diplôme illisible, merci de fournir une meilleure qualité"
4. Confirme

**Résultats attendus :**
- ✅ Status = "rejected"
- ✅ Email/SMS envoyé au coach
- ✅ Commentaire visible dans le dashboard

### 4.2 Dashboard coach après rejet

**Affichage :**
- ✅ Badge "Refusé" en rouge
- ✅ Message : "Dossier refusé"
- ✅ Commentaire admin affiché
- ✅ Instructions pour corriger

## Checklist finale

### Base de données
- [ ] Profil créé avec toutes les infos
- [ ] Praticien créé avec `practitioner_type = "coach_sportif"`
- [ ] Champs spécifiques coach remplis (session_types, zone, radius, certifications)
- [ ] **CRITIQUE : Tous les documents utilisent des chemins relatifs** (pas d'URL complète)
- [ ] Status KYC = "pending" initial
- [ ] Notifications KYC envoyées aux admins

### Frontend
- [ ] Formulaire adaptatif (champs coach vs médecin)
- [ ] Validation en temps réel
- [ ] Messages d'erreur clairs
- [ ] Upload de documents fonctionne
- [ ] Redirection vers bon dashboard (`/dashboard/coach`)

### Backend
- [ ] Documents uploadés sur Wasabi
- [ ] Chemins relatifs cohérents
- [ ] Rollback fonctionne en cas d'erreur
- [ ] Edge functions logguent correctement
- [ ] Emails/SMS envoyés

### KYC
- [ ] Admin voit le dossier
- [ ] Documents s'affichent correctement
- [ ] Approbation fonctionne
- [ ] Rejet fonctionne
- [ ] Notifications coach envoyées

### Dashboard coach
- [ ] Redirection correcte après inscription
- [ ] Affichage du status KYC
- [ ] Documents visibles
- [ ] Section séances de groupe
- [ ] Affichage infos spécifiques coach

## Problèmes connus et solutions

### Problème : Documents ne s'affichent pas

**Symptômes :**
- Dialog blanc ou erreur 403
- "Impossible de charger le document"

**Diagnostic :**
1. Vérifier les logs edge function `get-presigned-url`
2. Vérifier que le chemin du document est relatif
3. Vérifier les credentials Wasabi

**Solution :**
- Si `image` contient URL complète → Appliquer la correction dans `create-practitioner-account`
- Si erreur 403 → Vérifier les permissions Wasabi

### Problème : Redirection vers mauvais dashboard

**Symptômes :**
- Coach redirigé vers `/dashboard/practitioner` au lieu de `/dashboard/coach`

**Solution :**
- Vérifier que `practitionerType` est passé dans l'URL de `registration-success`
- Vérifier la logique dans `RegistrationSuccess.tsx`

### Problème : Types de séances non sauvegardés

**Symptômes :**
- `session_types` = NULL ou vide dans la BD

**Diagnostic :**
```sql
SELECT session_types FROM practitioners WHERE id = '[ID]';
```

**Solution :**
- Vérifier que les checkboxes sont correctement bindées
- Vérifier la conversion array dans `practitionerData`

## Contact support

Si des problèmes persistent après ces tests :
1. Capturer les logs console (F12)
2. Noter l'URL exacte et l'étape qui bloque
3. Faire une capture d'écran de l'erreur
4. Vérifier les logs des edge functions
5. Contacter le support technique avec ces informations

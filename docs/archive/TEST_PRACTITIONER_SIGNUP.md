# 🧪 Guide de Test - Inscription Praticien

## 🎯 Objectif
Tester l'inscription complète d'un praticien (focus Coach Sportif) et valider tous les points du workflow.

---

## 📝 Préparation

### Documents de Test à Préparer
- **Photo de profil** (JPG/PNG, < 5MB)
- **Pièce d'identité** (PDF/JPG, < 5MB)
- **Diplôme/Certification** (PDF, < 5MB)
- **Licence professionnelle** (PDF, < 5MB) - Optionnel pour coach

### Informations à Utiliser
```
Email: test-coach-[timestamp]@example.com
Mot de passe: TestPass123!
Prénom: Jean
Nom: Dupont
Téléphone: +22997001234
Profession: Coach sportif
Types de séances: individuelle, groupe
Zone d'intervention: Cotonou Centre
Rayon: 15 km
Certifications: "Diplôme d'État BPJEPS, CQP Coach Sportif"
```

---

## ✅ TEST 1: Inscription Coach Sportif Complète

### Étapes
1. **Accéder à la page d'inscription**
   ```
   URL: /signup/practitioner
   ```

2. **Remplir les informations personnelles**
   - [ ] Prénom: Jean
   - [ ] Nom: Dupont
   - [ ] Date de naissance: 01/01/1990
   - [ ] Sexe: Homme
   - [ ] Adresse: 123 Rue Test, Cotonou
   - [ ] Téléphone: +22997001234
   - [ ] Email: test-coach-123@example.com

3. **Sécurité**
   - [ ] Mot de passe: TestPass123!
   - [ ] Confirmer mot de passe: TestPass123!

4. **Informations professionnelles**
   - [ ] Profession: **Coach sportif**
   - [ ] Spécialité: (vide - normal pour coach)
   - [ ] N° d'enregistrement: (optionnel)
   - [ ] Années d'expérience: 5
   - [ ] Structure actuelle: Indépendant

5. **Coach Sportif - Champs spécifiques**
   - [ ] Types de séances: ✓ individuelle, ✓ groupe
   - [ ] Zone d'intervention: Cotonou Centre
   - [ ] Rayon d'intervention: 15 km
   - [ ] Certifications: "Diplôme d'État BPJEPS, CQP Coach Sportif"

6. **Documents**
   - [ ] Photo de profil: Uploader
   - [ ] Pièce d'identité: Uploader
   - [ ] Diplôme: Uploader
   - [ ] Licence: (Optionnel pour coach, ne pas uploader)

7. **Accepter les conditions**
   - [ ] Cocher "J'accepte la charte d'engagement"

8. **Soumettre**
   - [ ] Cliquer sur "Créer mon compte praticien"

### ✅ Résultats Attendus

#### Pendant la soumission
```
✅ Message: "Inscription en cours..."
✅ Bouton désactivé pendant le traitement
```

#### Si succès
```
✅ Redirection vers: /registration-success?type=practitioner
✅ Message affiché:
   - Titre: "Inscription réussie !"
   - Sous-titre: "Votre demande d'inscription a été soumise avec succès"
   - Statut: "Compte en attente de validation"
   - Délai: "24 à 48 heures"
✅ Countdown de 10 secondes
✅ Redirection automatique vers: /dashboard/practitioner
```

#### Dans la console (F12)
```
✅ "📝 Création profil..."
✅ "✅ Profil créé"
✅ "📤 Upload documents..."
✅ "✅ profilePhoto uploadé: practitioner-documents/..."
✅ "✅ idDocument uploadé: practitioner-documents/..."
✅ "✅ diploma uploadé: practitioner-documents/..."
✅ "✅ Documents uploadés: { profilePhoto: true, idDocument: true, ... }"
✅ "👨‍⚕️ Création praticien..."
✅ "🔔 Envoi notifications KYC aux admins..."
✅ "✅ Notifications KYC envoyées à X admin(s)"
✅ "✅ Compte praticien créé avec succès"
✅ "✅ Notification envoyée avec succès"
```

#### Dans la base de données
```sql
-- Vérifier le profil
SELECT * FROM profiles WHERE id = '[user_id]';
-- Attendu: full_name, phone, gender, date_of_birth

-- Vérifier le praticien
SELECT * FROM practitioners WHERE user_id = '[user_id]';
-- Attendu:
-- - name: "Jean Dupont"
-- - specialty: "Coach sportif"
-- - practitioner_type: "coach_sportif"
-- - kyc_status: "pending"
-- - can_accept_missions: false
-- - session_types: ["individuelle", "groupe"]
-- - intervention_zone: "Cotonou Centre"
-- - intervention_radius: 15
-- - certifications: ["Diplôme d'État BPJEPS", "CQP Coach Sportif"]
-- - image: URL Wasabi
-- - id_document_url: chemin Wasabi
-- - insurance_document_url: chemin Wasabi (diploma)

-- Vérifier les notifications admins
SELECT * FROM notifications WHERE type = 'kyc_pending' ORDER BY created_at DESC LIMIT 5;
-- Attendu: notifications aux admins avec le nom du praticien
```

#### Email reçu
```
✅ À: test-coach-123@example.com
✅ Sujet: "Demande d'inscription reçue - DomiCares"
✅ Contenu:
   - Bienvenue Jean Dupont
   - Statut: En attente de vérification
   - Délai: 24-48 heures
   - Liste des documents vérifiés
   - Prochaines étapes
```

---

## ❌ TEST 2: Validation des Erreurs

### Test 2.1: Document Trop Volumineux
```
1. Uploader un fichier > 5MB
✅ Attendu: "Fichier trop volumineux (max 5MB)"
```

### Test 2.2: Format de Document Invalide
```
1. Uploader un fichier .txt ou .docx
✅ Attendu: "Format non supporté (PDF, JPG, PNG)"
```

### Test 2.3: Champs Coach Sportif Manquants
```
1. Sélectionner "Coach sportif"
2. Ne pas cocher de type de séance
3. Soumettre
✅ Attendu: "Au moins un type de séance requis"

4. Laisser zone d'intervention vide
✅ Attendu: "Zone d'intervention requise"

5. Saisir zone < 3 caractères: "AB"
✅ Attendu: "Zone d'intervention trop courte (min 3 caractères)"

6. Saisir rayon = 0 ou > 100
✅ Attendu: "Rayon entre 1 et 100 km"
```

### Test 2.4: Document Manquant
```
1. Ne pas uploader la pièce d'identité
2. Soumettre
✅ Attendu: "Pièce d'identité requise"
```

### Test 2.5: Email Déjà Utilisé
```
1. Utiliser un email existant
2. Soumettre
✅ Attendu: "Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email."
```

---

## 🔄 TEST 3: Workflow KYC Complet

### Étape 1: Inscription (déjà testée)
```
✅ Coach inscrit avec kyc_status = 'pending'
✅ can_accept_missions = false
```

### Étape 2: Dashboard Praticien - État En Attente
```
1. Se connecter avec le compte coach
2. Accéder au dashboard: /dashboard/practitioner
✅ Attendu:
   - Message: "Votre compte est en attente de validation"
   - Badge: "En attente de validation KYC"
   - Désactivation des fonctionnalités de consultation
```

### Étape 3: Validation par Admin
```
1. Se connecter en tant qu'admin
2. Aller dans Admin Dashboard → KYC Queue
3. Trouver le dossier du coach
4. Valider le dossier (status: approved)
✅ Attendu:
   - practitioners.kyc_status = 'approved'
   - practitioners.can_accept_missions = true
   - Email envoyé au coach: "Votre compte est activé !"
```

### Étape 4: Coach Activé
```
1. Le coach se reconnecte
2. Dashboard praticien
✅ Attendu:
   - Message: "Compte activé"
   - Badge vert: "Validé"
   - Accès complet aux fonctionnalités
   - Peut accepter des consultations
```

---

## 📊 CHECKLIST DE VALIDATION

### ✅ Données Créées
- [ ] Profile dans `profiles`
- [ ] Practitioner dans `practitioners`
- [ ] Documents uploadés sur Wasabi
- [ ] Notifications KYC pour les admins

### ✅ États Corrects
- [ ] kyc_status = 'pending'
- [ ] can_accept_missions = false
- [ ] session_types correctement enregistrés
- [ ] intervention_zone et intervention_radius corrects
- [ ] certifications parse correctement

### ✅ Notifications
- [ ] Email reçu par le praticien
- [ ] SMS reçu (si Twilio configuré)
- [ ] Notifications in-app pour les admins

### ✅ Sécurité
- [ ] Pas de données sensibles en console
- [ ] Documents stockés de manière sécurisée
- [ ] RLS policies respectées

### ✅ UX
- [ ] Messages d'erreur clairs
- [ ] Loading states appropriés
- [ ] Redirections correctes
- [ ] Page de succès informative

---

## 🐛 En cas de Problème

### Erreur Upload Document
```
Vérifier dans la console:
- Message d'erreur exact
- Status code de la requête Wasabi
- Logs de upload-to-wasabi edge function

Actions:
1. Vérifier que WASABI_* secrets sont configurés
2. Vérifier la taille du fichier < 5MB
3. Vérifier le format (PDF, JPG, PNG)
```

### Erreur Création Praticien
```
Vérifier dans la console:
- Message d'erreur de create-practitioner-account
- Logs détaillés des étapes

Actions:
1. Vérifier que tous les champs requis sont fournis
2. Vérifier le mapping practitioner_type
3. Vérifier les contraintes de validation
```

### Pas de Notification
```
Vérifier:
1. Logs de complete-user-registration
2. Logs de send-registration-notification
3. SENDGRID_API_KEY configuré
4. Email du praticien valide

Actions:
- Tester l'envoi manuel via l'edge function
```

---

## 📞 Support

Si les tests échouent de manière persistante:
1. Vérifier tous les logs edge functions
2. Vérifier la base de données directement
3. Consulter docs/PRACTITIONER_SIGNUP_ANALYSIS.md
4. Contacter le support technique

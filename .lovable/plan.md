
# Plan : Migration de SendGrid vers Resend.com

## Contexte actuel

Le projet utilise actuellement **SendGrid** pour l'envoi d'emails dans 3 edge functions :
- `send-registration-notification` - Notification d'inscription (patients et praticiens)
- `send-account-activation` - Activation de compte praticien
- `send-kyc-status-notification` - Notifications de statut KYC (approved/rejected/incomplete)

La fonction utilitaire `_shared/notifications.ts` est déjà configurée pour Resend mais le secret `RESEND_API_KEY` est manquant.

## Avantages de Resend

- API moderne et simple
- Excellente documentation
- SDK npm natif (`npm:resend`)
- Dashboard intuitif
- Domaine de test gratuit pour le développement

---

## Etape 1 : Configuration du compte Resend

### Actions utilisateur requises :

1. Aller sur **https://resend.com** et créer un compte
2. Valider le domaine email sur **https://resend.com/domains** :
   - Ajouter `domicares.life` ou `domicares.com`
   - Configurer les enregistrements DNS (SPF, DKIM, DMARC)
3. Créer une clé API sur **https://resend.com/api-keys**
4. Fournir la clé API pour la stocker dans les secrets du projet

---

## Etape 2 : Ajouter le secret RESEND_API_KEY

Je demanderai l'ajout du secret `RESEND_API_KEY` via l'outil de gestion des secrets.

Optionnellement, ajouter aussi :
- `RESEND_FROM_EMAIL` = `noreply@domicares.life`

---

## Etape 3 : Modifier les Edge Functions

### 3.1 - send-registration-notification/index.ts

**Modifications :**
- Remplacer `SENDGRID_API_KEY` par `RESEND_API_KEY`
- Utiliser le SDK Resend (`npm:resend@2.0.0`)
- Mettre à jour l'appel API

**Code avant (SendGrid) :**
```typescript
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
if (!SENDGRID_API_KEY) {
  throw new Error('SENDGRID_API_KEY is not configured');
}

const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email }], subject: emailSubject }],
    from: { email: 'noreply@domicares.life', name: 'DomiCares' },
    content: [{ type: 'text/html', value: emailContent }]
  })
});
```

**Code après (Resend) :**
```typescript
import { Resend } from "npm:resend@2.0.0";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not configured');
}

const resend = new Resend(RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: 'DomiCares <noreply@domicares.life>',
  to: [email],
  subject: emailSubject,
  html: emailContent,
});
```

### 3.2 - send-account-activation/index.ts

Mêmes modifications que 3.1 :
- Import du SDK Resend
- Remplacement de l'appel SendGrid par Resend

### 3.3 - send-kyc-status-notification/index.ts

Mêmes modifications :
- Import du SDK Resend
- Remplacement de l'appel SendGrid par Resend
- Correction de l'email expéditeur : `noreply@domicares.com` → `noreply@domicares.life`

---

## Etape 4 : Mettre à jour la fonction utilitaire partagée

### _shared/notifications.ts

Cette fonction est déjà configurée pour Resend (lignes 50-86), mais utilise l'API REST directement. Je vais :
- Garder la logique existante (déjà compatible Resend)
- Vérifier que `RESEND_FROM_EMAIL` est utilisé comme fallback

---

## Etape 5 : Mettre à jour la documentation

### Fichiers à mettre à jour :
- `docs/WORKFLOW_NOTIFICATIONS_KYC.md` - Remplacer les références SendGrid par Resend
- `docs/WORKFLOW_OPTIMISATION_CENTRALISATION.md` - Mettre à jour les secrets requis
- `docs/TEST_PRACTITIONER_SIGNUP.md` - Mettre à jour le troubleshooting

---

## Resume des modifications

| Fichier | Action |
|---------|--------|
| `send-registration-notification/index.ts` | Migrer vers Resend SDK |
| `send-account-activation/index.ts` | Migrer vers Resend SDK |
| `send-kyc-status-notification/index.ts` | Migrer vers Resend SDK |
| `_shared/notifications.ts` | Déjà compatible (vérification) |
| Documentation (3 fichiers) | Mettre à jour références |
| Secrets | Ajouter `RESEND_API_KEY` |

---

## Secrets a configurer

| Secret | Valeur | Obligatoire |
|--------|--------|-------------|
| `RESEND_API_KEY` | `re_xxxxxxxx` (depuis dashboard Resend) | Oui |
| `RESEND_FROM_EMAIL` | `noreply@domicares.life` | Optionnel |

---

## Verification du domaine Resend

Pour que les emails soient délivrés correctement, il faut valider le domaine `domicares.life` sur Resend :

1. Ajouter le domaine sur https://resend.com/domains
2. Configurer les enregistrements DNS :
   - **SPF** : `v=spf1 include:_spf.resend.com ~all`
   - **DKIM** : Fourni par Resend
   - **DMARC** : `v=DMARC1; p=none;`
3. Attendre la validation (quelques minutes à quelques heures)

---

## Tests post-migration

1. **Test d'inscription patient** → Vérifier email de bienvenue
2. **Test d'inscription praticien** → Vérifier email "dossier en cours"
3. **Test activation compte** → Vérifier email d'activation
4. **Test KYC approved** → Vérifier email de validation
5. **Test KYC rejected** → Vérifier email de refus
6. **Test KYC incomplete** → Vérifier email de dossier incomplet

---

## Avantage bonus

Une fois `RESEND_API_KEY` configuré, la fonction `dispatchNotification()` dans `_shared/notifications.ts` fonctionnera automatiquement pour tous les autres emails du système.

# 🔧 Guide de Dépannage - Paiements Bloqués

## Résumé

Ce guide vous aide à diagnostiquer et résoudre les problèmes de paiements qui restent bloqués en statut "pending" ou "initiated".

---

## 🔍 Diagnostic Rapide

### Étape 1: Identifier les paiements bloqués

Utilisez la fonction de diagnostic :

```bash
curl -X POST https://your-project.supabase.co/functions/v1/diagnose-stuck-payments \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Cette fonction retourne :
- **Configuration FedaPay** : Vérifiez que les clés API sont configurées
- **Liste des paiements bloqués** : Avec l'âge et le statut
- **Problèmes identifiés** : Pour chaque paiement
- **Recommandations** : Actions à entreprendre

### Exemple de réponse :

```json
{
  "timestamp": "2025-11-29T10:00:00Z",
  "config": {
    "has_public_key": true,
    "has_secret_key": true,
    "environment": "sandbox",
    "config_loaded": true
  },
  "total_stuck_payments": 5,
  "summary": {
    "expired": 3,
    "sync_issues": 1,
    "no_transaction_id": 1,
    "no_payment_url": 0,
    "fedapay_errors": 0
  },
  "recommendations": [
    "Cancel 3 expired payments",
    "Run auto-sync for 1 payment with sync issues",
    "Cancel 1 incomplete payment"
  ]
}
```

---

## 🧹 Nettoyage Automatique

### Étape 2: Nettoyer les paiements bloqués

```bash
# Mode dry-run (test sans modification)
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-stuck-payments \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dryRun": true,
    "expirationMinutes": 10,
    "autoSync": true
  }'

# Mode réel (effectue les modifications)
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-stuck-payments \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dryRun": false,
    "expirationMinutes": 10,
    "autoSync": true
  }'
```

**Options** :
- `dryRun` : `true` pour simuler, `false` pour exécuter
- `expirationMinutes` : Timeout en minutes (défaut: 10)
- `autoSync` : Synchroniser avec FedaPay avant d'annuler (défaut: true)

### Que fait le nettoyage ?

1. **Paiements sans transaction ID** → Annulés (création échouée)
2. **Paiements sans URL** → Annulés (génération de token échouée)
3. **Paiements expirés** :
   - Vérifie d'abord le statut sur FedaPay
   - Si approuvé sur FedaPay → Synchronise le statut
   - Sinon → Annule le paiement
4. **Paiements récents avec changement de statut** → Synchronise avec FedaPay

---

## 📋 Causes Courantes et Solutions

### 1. Paiement expiré (> 10 minutes)

**Symptôme** :
- Paiement en "pending" ou "initiated" depuis plus de 10 minutes
- Le patient ne peut pas créer un nouveau paiement

**Cause** :
- Le patient n'a pas complété le paiement dans le délai
- Le webhook FedaPay n'a pas été reçu

**Solution** :
```bash
# Annuler le paiement expiré
curl -X POST https://your-project.supabase.co/functions/v1/cancel-pending-payment \
  -H "Authorization: Bearer PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appointmentId": "appointment-id-here"}'
```

Ou exécuter le nettoyage automatique.

---

### 2. Paiement sans transaction ID

**Symptôme** :
- Paiement créé dans la base de données
- `fedapay_transaction_id` est NULL
- Le patient voit une erreur "URL de paiement non reçue"

**Cause** :
- Erreur lors de l'appel à l'API FedaPay (étape 1 de create-payment)
- Problème de réseau ou timeout
- Clé API FedaPay invalide

**Solution** :
1. Vérifier les logs de `create-payment` pour l'erreur exacte
2. Vérifier que `FEDAPAY_SECRET_KEY` est correctement configurée
3. Annuler le paiement incomplet :
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/cleanup-stuck-payments \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"dryRun": false}'
   ```

---

### 3. Paiement sans URL

**Symptôme** :
- Paiement créé avec `fedapay_transaction_id`
- `fedapay_payment_url` est NULL
- Le patient ne peut pas accéder à la page de paiement

**Cause** :
- Erreur lors de la génération du token (étape 2 de create-payment)
- La méthode de paiement (mtn/moov) n'est pas supportée
- Problème de configuration FedaPay

**Solution** :
1. Vérifier les logs de `create-payment` pour l'erreur "token generation failed"
2. Vérifier que le mode (`mtn_benin`, `moov_benin`) est correct
3. Annuler le paiement et réessayer

---

### 4. Problème de synchronisation (webhook non reçu)

**Symptôme** :
- Le patient a payé sur FedaPay
- Le paiement reste en "pending" dans la base de données
- Le statut sur FedaPay est "approved"

**Cause** :
- Le webhook FedaPay n'a pas été reçu ou a échoué
- L'URL du webhook n'est pas correctement configurée
- La signature HMAC est invalide

**Solution** :
1. Vérifier la table `webhook_events` pour voir si le webhook a été reçu :
   ```sql
   SELECT * FROM webhook_events
   WHERE event_type LIKE '%transaction%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. Si le webhook n'a pas été reçu, synchroniser manuellement :
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/auto-sync-pending-payments \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

3. Si le webhook a échoué, vérifier les logs et relancer :
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/retry-failed-webhooks \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
   ```

---

### 5. Configuration FedaPay incorrecte

**Symptôme** :
- Erreur "Configuration de paiement non disponible"
- Le widget FedaPay ne se charge pas

**Cause** :
- Variables d'environnement manquantes ou incorrectes
- La fonction `get-fedapay-config` échoue

**Solution** :
1. Vérifier les variables d'environnement :
   ```bash
   # Dans Supabase Dashboard > Edge Functions > Secrets
   FEDAPAY_PUBLIC_KEY=pk_sandbox_xxx
   FEDAPAY_SECRET_KEY=sk_sandbox_xxx
   FEDAPAY_MODE=sandbox  # ou "live"
   FEDAPAY_WEBHOOK_SECRET=whsec_xxx
   ```

2. Tester la configuration :
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/get-fedapay-config \
     -H "Authorization: Bearer USER_TOKEN"
   ```

---

## 🔄 Timeouts et Délais

### Timeouts standardisés (10 minutes)

Tous les composants utilisent maintenant un timeout cohérent de **10 minutes** :

1. **create-payment** (backend) : 10 minutes
2. **PaymentDialog** (frontend) : 10 minutes
3. **auto-sync-pending-payments** : Vérifie les paiements > 10 minutes

### Pourquoi 10 minutes ?

- Temps suffisant pour que le patient complète le paiement
- Pas trop long pour bloquer d'autres tentatives
- Cohérent entre frontend et backend

---

## 📊 Workflow de Paiement Normal

```
1. Patient crée le paiement
   ↓
2. create-payment crée la transaction FedaPay
   - Statut: "initiated"
   - fedapay_transaction_id: créé
   - fedapay_payment_url: créé
   ↓
3. Patient paie via le widget FedaPay
   ↓
4. FedaPay envoie un webhook "transaction.approved"
   ↓
5. payment-webhook met à jour le statut
   - Statut: "paid"
   - payout_status: "held"
   - hold_until: T+2 jours
   ↓
6. Rendez-vous confirmé ✅
```

### Points de défaillance

- **Étape 2** : Erreur API FedaPay → Paiement sans transaction ID
- **Étape 2** : Erreur de token → Paiement sans URL
- **Étape 3** : Patient abandonne → Paiement expiré après 10 min
- **Étape 4** : Webhook non reçu → Problème de synchronisation

---

## 🛠️ Outils de Maintenance

### 1. Diagnostic quotidien (recommandé)

Ajoutez un cron job pour diagnostiquer quotidiennement :

```bash
# Dans supabase/config.toml
[[edge_runtime.scheduled_functions]]
name = "diagnose-stuck-payments"
schedule = "0 2 * * *"  # Tous les jours à 2h du matin
```

### 2. Nettoyage automatique (recommandé)

Ajoutez un cron job pour nettoyer automatiquement :

```bash
[[edge_runtime.scheduled_functions]]
name = "cleanup-stuck-payments"
schedule = "*/30 * * * *"  # Toutes les 30 minutes
```

### 3. Synchronisation FedaPay (déjà en place)

```bash
[[edge_runtime.scheduled_functions]]
name = "auto-sync-pending-payments"
schedule = "*/15 * * * *"  # Toutes les 15 minutes
```

---

## 📧 Support et Escalation

### Niveau 1 : Auto-dépannage

1. Exécuter le diagnostic
2. Exécuter le nettoyage en mode dry-run
3. Si tout semble bon, exécuter en mode réel

### Niveau 2 : Vérification manuelle

1. Consulter les logs Supabase Edge Functions
2. Vérifier la table `webhook_events`
3. Vérifier la table `payment_events`
4. Contacter le support FedaPay si nécessaire

### Niveau 3 : Intervention développeur

1. Vérifier le code de `create-payment`
2. Vérifier le code de `payment-webhook`
3. Vérifier la configuration réseau/firewall
4. Ouvrir un ticket GitHub

---

## 📈 Métriques à Surveiller

### Taux de paiements bloqués

```sql
SELECT
  COUNT(*) FILTER (WHERE status IN ('initiated', 'pending')) as stuck_payments,
  COUNT(*) FILTER (WHERE status = 'paid') as successful_payments,
  COUNT(*) FILTER (WHERE status IN ('failed', 'canceled')) as failed_payments,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('initiated', 'pending'))::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as stuck_rate_percent
FROM payments
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Délai moyen de paiement

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60) as avg_minutes
FROM payments
WHERE status = 'paid'
  AND created_at > NOW() - INTERVAL '24 hours';
```

### Taux de réussite des webhooks

```sql
SELECT
  COUNT(*) FILTER (WHERE processing_status = 'success') as successful,
  COUNT(*) FILTER (WHERE processing_status = 'failed') as failed,
  ROUND(
    COUNT(*) FILTER (WHERE processing_status = 'success')::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as success_rate_percent
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## ✅ Checklist de Vérification

- [ ] Configuration FedaPay correcte (clés API, mode, webhook secret)
- [ ] Timeouts cohérents (10 minutes partout)
- [ ] Cron jobs de maintenance actifs
- [ ] Logs accessibles et surveillés
- [ ] Webhooks reçus et traités correctement
- [ ] Taux de paiements bloqués < 5%
- [ ] Temps moyen de paiement < 3 minutes

---

## 🔗 Références

- [Documentation FedaPay](https://docs.fedapay.com/)
- [Code source create-payment](/supabase/functions/create-payment/index.ts)
- [Code source payment-webhook](/supabase/functions/payment-webhook/index.ts)
- [Code source cancel-pending-payment](/supabase/functions/cancel-pending-payment/index.ts)
- [Analyse des erreurs](/docs/PAYMENT_ERRORS_ANALYSIS.md)

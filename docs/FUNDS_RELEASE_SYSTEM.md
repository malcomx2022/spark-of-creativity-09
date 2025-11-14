# Système de Release Automatique des Fonds

## Vue d'ensemble

Le système de release automatique des fonds gère le déblocage des paiements des praticiens après une période de rétention (hold period). Ce mécanisme protège la plateforme contre les fraudes et les litiges tout en assurant un traitement automatique et fiable.

## Architecture

### 1. Edge Function: `release-held-funds`

**Emplacement**: `supabase/functions/release-held-funds/index.ts`

**Fonctionnalités**:
- Identifie les paiements dont la période de hold est expirée
- Transfère les fonds de `balance_on_hold` vers `balance_available`
- Met à jour le statut du paiement de `held` à `ready`
- Gère les erreurs avec rollback automatique
- Crée des événements de traçabilité dans `payment_events`

**Processus**:
```
1. Récupérer tous les paiements avec:
   - payout_status = 'held'
   - hold_until <= now()
   - status = 'paid'

2. Pour chaque paiement:
   a. Récupérer l'appointment et le practitioner_id
   b. Vérifier le solde du praticien
   c. Valider que balance_on_hold >= montant à libérer
   d. Mettre à jour le paiement (payout_status = 'ready')
   e. Mettre à jour le solde:
      - balance_available += net_amount
      - balance_on_hold -= net_amount
   f. Créer un événement de traçabilité
   g. En cas d'erreur: rollback et logger

3. Retourner un rapport détaillé:
   - Nombre total de paiements traités
   - Nombre de releases réussis
   - Nombre d'échecs
   - Détails des erreurs
```

### 2. Cron Job Automatique

**Configuration**: Exécution toutes les heures (à minute 0)

```sql
SELECT cron.schedule(
  'release-held-funds-hourly',
  '0 * * * *',
  $$ ... $$
);
```

**Extensions requises**:
- `pg_cron`: Planification des tâches
- `pg_net`: Appels HTTP depuis PostgreSQL

### 3. Interface Admin

**Composant**: `src/components/admin/FundsReleaseSection.tsx`

**Fonctionnalités**:
- Dashboard avec statistiques en temps réel
- Vue des paiements en attente de release
- Bouton pour déclencher manuellement le release
- Affichage du temps restant avant release
- Historique des erreurs du dernier run

**Statistiques affichées**:
- Total en rétention
- Montant prêt à libérer
- Montant encore bloqué
- Résultats du dernier release

## Tables Impactées

### `payments`
- `payout_status`: Passe de `'held'` à `'ready'`
- `hold_until`: Date limite de rétention

### `practitioner_balances`
- `balance_available`: Augmenté du montant net
- `balance_on_hold`: Diminué du montant net

### `payment_events`
- Création d'un événement `'funds_released'` pour traçabilité

## Gestion des Erreurs

### Types d'erreurs gérées

1. **Appointment non trouvé**
   - Erreur: "Appointment not found"
   - Action: Skip et logger

2. **Balance non trouvée**
   - Erreur: "Balance not found"
   - Action: Skip et logger

3. **Balance insuffisante**
   - Erreur: "Insufficient on_hold balance"
   - Action: Skip et logger (incohérence de données)

4. **Échec de mise à jour paiement**
   - Erreur: "Failed to update payment"
   - Action: Skip et logger

5. **Échec de mise à jour balance**
   - Erreur: "Failed to update balance (rolled back)"
   - Action: Rollback du paiement + logger

### Mécanisme de Rollback

En cas d'échec lors de la mise à jour du solde, le système:
1. Restaure le `payout_status` du paiement à `'held'`
2. Enregistre l'erreur dans les résultats
3. Continue avec le paiement suivant

## Période de Hold

### Configuration par défaut
- **Durée**: 48 heures après le paiement
- **Configurable dans**: `supabase/functions/create-payment/index.ts`

```typescript
hold_until: new Date(Date.now() + 48 * 60 * 60 * 1000)
```

### Raisons de la période de hold
1. Protection contre la fraude
2. Temps pour traiter d'éventuels litiges
3. Vérification de la qualité du service
4. Conformité réglementaire

## Utilisation

### Déclenchement automatique
Le système fonctionne automatiquement sans intervention. Le cron job s'exécute toutes les heures.

### Déclenchement manuel
Depuis l'interface admin (onglet Finance > Release Fonds):
1. Consulter les statistiques et paiements en attente
2. Cliquer sur "Libérer manuellement (N)"
3. Consulter les résultats dans le dashboard

### Monitoring
- **Logs**: Consultables dans les logs de l'edge function
- **Événements**: Table `payment_events` avec type `'funds_released'`
- **Interface**: Dashboard admin avec statistiques en temps réel

## Sécurité

### Contrôles en place
1. **Validation des montants**: Vérification que `balance_on_hold >= montant_à_libérer`
2. **Transactions atomiques**: Rollback en cas d'erreur partielle
3. **Authentification**: Function protégée (JWT requis pour appels manuels)
4. **Traçabilité**: Tous les releases sont enregistrés dans `payment_events`

### Permissions requises
- **Service role key**: Pour les opérations en base de données
- **Admin role**: Pour les déclenchements manuels

## Maintenance

### Surveillance recommandée
1. **Vérifier les logs régulièrement** pour détecter les erreurs récurrentes
2. **Monitorer les incohérences** de balance (errors "Insufficient on_hold balance")
3. **Analyser le taux d'échec** des releases
4. **Vérifier que le cron job fonctionne** (dernière exécution visible dans les logs)

### Actions correctives

**Si des erreurs récurrentes**:
1. Identifier la cause dans les logs
2. Corriger les données incohérentes si nécessaire
3. Relancer manuellement le release

**Si le cron ne fonctionne pas**:
1. Vérifier que les extensions pg_cron et pg_net sont activées
2. Vérifier la configuration du cron job
3. Tester l'appel manuel depuis l'interface admin

## Performance

### Optimisations
- **Batch processing**: Tous les paiements éligibles sont traités en une seule exécution
- **Index recommandés**: 
  - `payments(payout_status, hold_until, status)`
  - `practitioner_balances(practitioner_id)`

### Limites
- Pas de limite théorique sur le nombre de paiements par run
- En production, surveiller le temps d'exécution si >1000 paiements/heure

## Évolutions possibles

1. **Notifications**: Alerter les praticiens quand leurs fonds sont libérés
2. **Retry configurable**: Nombre de tentatives pour les échecs temporaires
3. **Règles métier avancées**: Hold period variable selon le type de service
4. **Dashboard analytics**: Graphiques d'évolution des releases dans le temps
5. **Export automatique**: Rapports de réconciliation comptable

## Support

Pour toute question ou problème:
1. Consulter les logs de l'edge function
2. Vérifier les événements dans `payment_events`
3. Utiliser le dashboard admin pour diagnostiquer
4. Contacter l'équipe technique avec les logs et le payment_id concerné

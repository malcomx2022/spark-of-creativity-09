# 🔴 Résolution: Erreur "Impossible de se connecter à fedapay-sandbox-checkout.fedapay.com"

## 🚨 Symptôme

Lors de la tentative de paiement, le navigateur affiche :
```
Hum, nous ne parvenons pas à trouver ce site.
Impossible de se connecter au serveur à l'adresse fedapay-sandbox-checkout.fedapay.com.
```

## 🔍 Causes Possibles

1. **Problème de réseau/firewall** : Votre réseau bloque l'accès aux domaines FedaPay
2. **Problème DNS** : Le DNS ne résout pas correctement le domaine
3. **VPN/Proxy** : Un VPN ou proxy interfère avec la connexion
4. **Service FedaPay indisponible** : Le service sandbox est temporairement down
5. **Configuration incorrecte** : Les clés API ne sont pas correctes
6. **Bloqueur de publicités** : Extension navigateur qui bloque les scripts tiers

---

## 🛠️ Étape 1 : Diagnostic Rapide

### Option A : Test Backend (Recommandé)

```bash
# Remplacez YOUR_SERVICE_ROLE_KEY par votre clé service role
curl -X POST https://your-project.supabase.co/functions/v1/test-fedapay-connectivity \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  | jq '.'
```

Ce test vérifiera :
- ✅ Configuration des clés API
- ✅ Accessibilité de l'API FedaPay
- ✅ Accessibilité du domaine checkout
- ✅ Accessibilité du CDN
- ✅ Validité des clés API

### Option B : Test Frontend

1. Ajoutez temporairement le composant de diagnostic dans votre interface admin :

```tsx
import { FedaPayDiagnostics } from '@/components/FedaPayDiagnostics';

// Dans votre page
<FedaPayDiagnostics />
```

2. Cliquez sur "Lancer le diagnostic"

---

## 🔧 Solutions par Cause

### Solution 1 : Problème de Réseau/Firewall

**Test** : Ouvrez votre navigateur et essayez d'accéder directement à :
```
https://fedapay-sandbox-checkout.fedapay.com
```

**Si la page ne charge pas** :
- ✅ Vérifiez que votre firewall n'est pas bloqué
- ✅ Essayez depuis un autre réseau (4G mobile par exemple)
- ✅ Désactivez temporairement votre VPN
- ✅ Contactez votre administrateur réseau

**Si la page charge** : Le problème vient d'ailleurs, continuez.

---

### Solution 2 : Problème DNS

**Test** : Vérifiez la résolution DNS

```bash
# Sous Linux/Mac
nslookup fedapay-sandbox-checkout.fedapay.com

# Sous Windows
nslookup fedapay-sandbox-checkout.fedapay.com
```

**Si la résolution échoue** :
- ✅ Changez de serveur DNS (utilisez 8.8.8.8 ou 1.1.1.1)
- ✅ Videz le cache DNS :
  ```bash
  # Linux
  sudo systemd-resolve --flush-caches

  # Mac
  sudo dscacheutil -flushcache

  # Windows
  ipconfig /flushdns
  ```

---

### Solution 3 : Bloqueur de Publicités / Extensions

**Test** : Désactivez temporairement toutes les extensions de navigateur

1. Ouvrez le navigateur en mode navigation privée
2. Essayez de faire un paiement
3. Si ça fonctionne → Le problème vient d'une extension

**Extensions connues pour bloquer FedaPay** :
- uBlock Origin
- AdBlock Plus
- Privacy Badger
- NoScript

**Solution** :
- Ajoutez `*.fedapay.com` à la liste blanche de votre bloqueur
- Ou désactivez le bloqueur pour votre site

---

### Solution 4 : Configuration FedaPay Incorrecte

**Vérifiez vos variables d'environnement** :

```bash
# Dans Supabase Dashboard > Edge Functions > Secrets
FEDAPAY_PUBLIC_KEY=pk_sandbox_XXXXXXXXXXXXXX
FEDAPAY_SECRET_KEY=sk_sandbox_XXXXXXXXXXXXXX
FEDAPAY_MODE=sandbox
FEDAPAY_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXX
```

**Points de vérification** :
- ✅ Les clés commencent bien par `pk_sandbox_` et `sk_sandbox_`
- ✅ Les deux clés sont pour le même environnement (sandbox ou live)
- ✅ `FEDAPAY_MODE` est bien défini sur `sandbox` ou `live`
- ✅ Les clés sont valides et actives sur votre compte FedaPay

---

### Solution 5 : Service FedaPay Indisponible

**Vérifiez le statut de FedaPay** :

1. Visitez la page de statut FedaPay (si disponible)
2. Contactez le support FedaPay : support@fedapay.com
3. Vérifiez leur compte Twitter/X pour des annonces

**En attendant** : Utilisez un mode de paiement alternatif temporaire

---

## 🔄 Solution de Contournement : Mode Redirect

Si le widget embedded ne fonctionne pas, vous pouvez essayer le mode redirect :

### Modifier PaymentDialog.tsx

Au lieu d'utiliser le widget embedded, redirigez directement vers l'URL de paiement :

```typescript
// Dans handlePayment, après avoir reçu paymentUrl
if (paymentUrl) {
  // Au lieu de widget.open()
  window.location.href = paymentUrl; // Redirection complète
  // OU
  window.open(paymentUrl, '_blank'); // Nouvelle fenêtre
}
```

---

## 📊 Vérification Post-Diagnostic

Après avoir appliqué une solution, vérifiez :

### 1. Test de connectivité

```bash
curl -I https://fedapay-sandbox-checkout.fedapay.com
```

Devrait retourner un code HTTP 200 ou 30x

### 2. Test du script FedaPay

Ouvrez la console développeur (F12) et tapez :

```javascript
console.log(typeof window.FedaPay);
// Devrait afficher: "object"
```

Si c'est "undefined", le script n'est pas chargé.

### 3. Test de création de paiement

Créez un paiement de test et vérifiez les logs :

```javascript
// Dans la console réseau (Network tab)
// Cherchez les requêtes vers:
- https://cdn.fedapay.com/checkout.js ✅
- https://sandbox-api.fedapay.com/v1/transactions ✅
- https://fedapay-sandbox-checkout.fedapay.com ✅
```

---

## 🌐 Cas Spécifiques par Région

### Afrique de l'Ouest (Bénin, Togo, etc.)

Si vous êtes au Bénin ou dans la région :
- ✅ Vérifiez que votre opérateur mobile (MTN, Moov) n'a pas de restrictions
- ✅ Essayez avec une connexion WiFi différente
- ✅ Certains FAI bloquent les domaines étrangers

### Hors Afrique

Si vous testez depuis l'Europe ou ailleurs :
- ✅ FedaPay peut avoir des restrictions géographiques
- ✅ Utilisez un VPN localisé au Bénin pour tester
- ✅ Vérifiez avec FedaPay si votre IP est bloquée

---

## 📞 Support

### Auto-diagnostic

1. Exécutez `test-fedapay-connectivity`
2. Copiez le JSON de résultat
3. Identifiez les erreurs dans `connectivity` et `configuration`

### Escalation

Si le problème persiste après avoir testé toutes les solutions :

1. **Support FedaPay** : support@fedapay.com
   - Fournissez le JSON du diagnostic
   - Indiquez votre adresse IP publique
   - Mentionnez votre environnement (sandbox/live)

2. **GitHub Issue** : Ouvrez un ticket avec :
   - Résultat du diagnostic complet
   - Screenshots de l'erreur
   - Console logs du navigateur (F12 > Console)
   - Network logs (F12 > Network)

---

## ✅ Checklist de Vérification

- [ ] Le domaine `fedapay-sandbox-checkout.fedapay.com` est accessible depuis mon navigateur
- [ ] Le script `https://cdn.fedapay.com/checkout.js` se charge correctement
- [ ] `window.FedaPay` est défini dans la console
- [ ] Les clés API sont configurées et valides
- [ ] Pas de VPN/Proxy qui bloque FedaPay
- [ ] Pas d'extension navigateur qui bloque FedaPay
- [ ] Le firewall/réseau autorise FedaPay
- [ ] Le diagnostic backend ne montre pas d'erreurs
- [ ] Les logs ne montrent pas d'erreurs 401 ou 403

---

## 🔬 Logs de Débogage

Ajoutez ces logs temporaires pour mieux comprendre le problème :

```typescript
// Dans PaymentDialog.tsx, avant widget.open()
console.log('=== DEBUG FEDAPAY ===');
console.log('FedaPay loaded:', isFedaPayLoaded());
console.log('FedaPay object:', window.FedaPay);
console.log('Transaction ID:', txId);
console.log('Config:', fedapayConfig);
console.log('Widget created:', !!widget);

// Essayer de capturer les erreurs du widget
widget.onError = (error: any) => {
  console.error('FedaPay widget error:', error);
  toast({
    title: 'Erreur Widget',
    description: JSON.stringify(error),
    variant: 'destructive',
  });
};
```

---

## 🎯 Solution Recommandée Immédiate

**Pour débloquer rapidement votre patient** :

1. **Court terme** : Utilisez le mode redirect au lieu du widget
   ```typescript
   window.location.href = paymentUrl;
   ```

2. **Moyen terme** : Diagnostiquez le problème réseau avec les outils fournis

3. **Long terme** : Configurez un monitoring de la disponibilité FedaPay

---

## 📚 Ressources

- [Documentation FedaPay](https://docs.fedapay.com/)
- [Guide de dépannage des paiements](/docs/PAYMENT_TROUBLESHOOTING.md)
- [Analyse des erreurs](/docs/PAYMENT_ERRORS_ANALYSIS.md)
- [Widget FedaPay API](https://docs.fedapay.com/api/#checkout-widget)

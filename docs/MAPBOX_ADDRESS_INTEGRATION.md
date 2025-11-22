# 🗺️ Intégration Mapbox - Recherche d'Adresse Dynamique

**Date:** 2025-01-XX  
**Périmètre:** Tous les champs d'adresse de l'application

---

## 🎯 VUE D'ENSEMBLE

Tous les champs d'adresse de l'application utilisent maintenant la recherche dynamique Mapbox avec:
- ✅ **Autocomplétion intelligente** des adresses au Bénin
- ✅ **Géolocalisation** automatique (latitude/longitude)
- ✅ **Historique** des recherches récentes
- ✅ **Validation** en temps réel
- ✅ **Expérience utilisateur** fluide avec debounce

---

## 📦 COMPOSANT PRINCIPAL

### `AddressSearchInput.tsx`

Composant réutilisable pour la recherche d'adresse avec Mapbox:

```typescript
interface LocationData {
  address: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

interface AddressSearchInputProps {
  label?: string;
  value: string;
  onChange: (location: LocationData) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}
```

**Fonctionnalités:**
- Recherche avec debounce de 400ms
- Filtrage par pays (BJ - Bénin)
- Types supportés: `address`, `place`, `poi`, `locality`
- Limite de 5 résultats
- Langue française
- Sauvegarde des 5 dernières recherches dans localStorage

---

## 🔄 INTÉGRATIONS RÉALISÉES

### 1. **Inscription Praticien** (`PractitionerSignup.tsx`)

```typescript
<AddressSearchInput
  label="Adresse complète"
  value={formData.address}
  onChange={(location) => setFormData(prev => ({ 
    ...prev, 
    address: location.address 
  }))}
  placeholder="Rechercher votre adresse au Bénin..."
  required
/>
```

**Avant:** Textarea simple sans validation  
**Après:** Recherche Mapbox avec autocomplétion

---

### 2. **Inscription Patient** (`PatientSignup.tsx`)

```typescript
<AddressSearchInput
  label="Adresse complète"
  value={formData.address}
  onChange={(location) => setFormData(prev => ({ 
    ...prev, 
    address: location.address 
  }))}
  placeholder="Rechercher votre adresse au Bénin..."
  required
/>
```

**Avant:** Textarea simple sans validation  
**Après:** Recherche Mapbox avec autocomplétion

---

### 3. **Ajout d'Adresse** (`AddAddressDialog.tsx`)

```typescript
<AddressSearchInput
  label="Adresse complète"
  value={formData.address}
  onChange={(location) => setFormData({
    ...formData,
    address: location.address,
    city: location.city || formData.city,
    latitude: location.latitude || null,
    longitude: location.longitude || null,
  })}
  placeholder="Rechercher une adresse au Bénin..."
  required
/>
```

**Fonctionnalités supplémentaires:**
- ✅ Extraction automatique de la ville
- ✅ Sauvegarde des coordonnées GPS
- ✅ Pré-remplissage intelligent

**Avant:** Input simple  
**Après:** Recherche Mapbox + extraction ville + GPS

---

### 4. **Nouveau Rendez-vous** (`NewAppointmentDialog.tsx`)

```typescript
{locationMode === 'manual' && (
  <AddressSearchInput
    label="Adresse complète"
    value={manualAddress}
    onChange={(location) => setManualAddress(location.address)}
    placeholder="Rechercher votre adresse au Bénin..."
    required
  />
)}
```

**Modes disponibles:**
- Mode auto: Utilise la géolocalisation GPS
- Mode manuel: Recherche Mapbox d'adresse

**Avant:** Textarea avec saisie libre  
**Après:** Recherche Mapbox intelligente

---

### 5. **Localisation Praticien** (`LocationSection.tsx`)

```typescript
<AddressSearchInput
  label="Adresse"
  value={formData.address}
  onChange={(location) => setFormData({
    address: location.address,
    latitude: location.latitude || null,
    longitude: location.longitude || null,
  })}
  placeholder="Rechercher votre adresse professionnelle..."
  required
/>
```

**Fonctionnalités:**
- ✅ Mise à jour automatique des coordonnées GPS
- ✅ Synchronisation avec la base de données
- ✅ Validation en temps réel

**Avant:** Input simple texte  
**Après:** Recherche Mapbox + sauvegarde GPS

---

## 🔧 CONFIGURATION

### Token Mapbox

Le token Mapbox est stocké dans les secrets Supabase:
```
VITE_MAPBOX_TOKEN
```

**Utilisation:**
```typescript
const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
```

### API Mapbox Geocoding

**Endpoint:**
```
https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json
```

**Paramètres:**
- `access_token`: Token Mapbox
- `country=BJ`: Filtrage Bénin uniquement
- `types=address,place,poi,locality`: Types de lieux
- `limit=5`: Maximum 5 résultats
- `language=fr`: Résultats en français

---

## 🎨 EXPÉRIENCE UTILISATEUR

### Flux d'utilisation

1. **Utilisateur tape l'adresse**
   - Debounce de 400ms avant la recherche
   - Minimum 3 caractères requis

2. **Suggestions apparaissent**
   - Maximum 5 résultats pertinents
   - Icônes différenciées (maison, bâtiment, point d'intérêt)
   - Adresse complète affichée

3. **Sélection d'une suggestion**
   - Adresse complète renseignée automatiquement
   - Ville extraite (si disponible)
   - Coordonnées GPS sauvegardées
   - Ajout à l'historique

4. **Recherches récentes**
   - Affichées si aucune recherche active
   - Maximum 5 dernières adresses
   - Icône horloge pour différencier

### États visuels

- **Recherche en cours:** Spinner animé
- **Résultats trouvés:** Liste avec icônes
- **Aucun résultat:** Message informatif
- **Historique:** Icône horloge + recherches récentes

---

## 📊 AVANTAGES

### Pour les Utilisateurs
- ✅ **Rapidité:** Pas besoin de taper l'adresse complète
- ✅ **Précision:** Adresses validées par Mapbox
- ✅ **Commodité:** Historique des recherches
- ✅ **Fiabilité:** Coordonnées GPS automatiques

### Pour l'Application
- ✅ **Données structurées:** Adresses normalisées
- ✅ **Géolocalisation:** Coordonnées précises pour le matching
- ✅ **Validation:** Format standardisé
- ✅ **UX cohérente:** Même comportement partout

---

## 🔒 SÉCURITÉ

### Token Mapbox
- Stocké dans les secrets Supabase (VITE_MAPBOX_TOKEN)
- Accessible uniquement côté client (préfixe VITE_)
- Token public, pas de risque d'exposition

### Données Personnelles
- Historique stocké en localStorage (côté client uniquement)
- Pas de partage avec des tiers
- Effaçable par l'utilisateur

---

## 🧪 TESTS

### Scénarios testés

1. **Recherche basique**
   - ✅ Tape "Cotonou" → Suggestions de lieux
   - ✅ Sélection → Adresse complète renseignée

2. **Recherche avec rue**
   - ✅ Tape "Rue Cardinal Bernardin" → Adresses précises
   - ✅ Coordonnées GPS extraites

3. **Historique**
   - ✅ Ouverture du champ → Affichage des recherches récentes
   - ✅ Sélection → Réutilisation de l'adresse

4. **Erreurs**
   - ✅ Token manquant → Message d'erreur clair
   - ✅ API indisponible → Message de retry
   - ✅ Pas de résultat → Message informatif

5. **Performance**
   - ✅ Debounce → Évite les requêtes excessives
   - ✅ Chargement → Indicateur visuel
   - ✅ Annulation → Cleanup des timeouts

---

## 📈 MÉTRIQUES

### Performance
- **Temps de réponse Mapbox:** ~200-500ms
- **Debounce:** 400ms (évite surcharge)
- **Cache localStorage:** Instantané pour historique

### Utilisation
- **Maximum 5 résultats** par recherche
- **Maximum 5 adresses** en historique
- **Limite 3 caractères** minimum pour rechercher

---

## 🔜 AMÉLIORATIONS FUTURES

### Court terme
- [ ] Support de la géolocalisation inverse (coords → adresse)
- [ ] Validation des adresses hors Bénin
- [ ] Export de l'historique

### Moyen terme
- [ ] Intégration avec Google Maps en fallback
- [ ] Suggestions basées sur l'historique de l'utilisateur
- [ ] Support de plusieurs langues (anglais, français)

### Long terme
- [ ] ML pour prédire l'adresse en fonction du contexte
- [ ] Validation des adresses existantes en base
- [ ] Enrichissement des données (quartier, commune, etc.)

---

## 📚 RESSOURCES

- [Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)
- [Mapbox React Components](https://github.com/mapbox/mapbox-gl-js)
- [Documentation Lovable - Mapbox](https://docs.lovable.dev/integrations/mapbox)

---

**Fin du document**  
*Généré le 2025-01-XX*

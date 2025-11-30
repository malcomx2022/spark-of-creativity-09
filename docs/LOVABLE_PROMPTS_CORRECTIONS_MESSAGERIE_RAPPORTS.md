# 🚀 Prompts Lovable.dev - Corrections Messagerie & Rapports Médicaux

**Date :** 30 novembre 2025
**Projet :** DomiCares - Système de santé à domicile
**Contexte :** Corrections suite à la revue complète du système de rapports médicaux et messagerie

---

## 📋 Table des Matières

1. [Prompt #1 - Restreindre Messagerie aux RDV Confirmés](#prompt-1---restreindre-messagerie-aux-rdv-confirmés)
2. [Prompt #2 - Créer Formulaire Rapports de Consultation](#prompt-2---créer-formulaire-rapports-de-consultation)
3. [Prompt #3 - Export PDF des Rapports Médicaux](#prompt-3---export-pdf-des-rapports-médicaux)
4. [Prompt #4 - Section Notes SOAP Dashboard Patient](#prompt-4---section-notes-soap-dashboard-patient)
5. [Prompt #5 - Documentation Usage Rapports vs Notes](#prompt-5---documentation-usage-rapports-vs-notes)
6. [Prompt #6 - Pagination Infinie Conversations](#prompt-6---pagination-infinie-conversations)
7. [Prompt de Test Global](#prompt-de-test-global)

---

## Prompt #1 - Restreindre Messagerie aux RDV Confirmés

### 🎯 Objectif
Limiter l'accès à la messagerie uniquement aux rendez-vous confirmés ou complétés pour éviter le spam et les notifications inutiles.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares (plateforme de santé à domicile). Actuellement, la messagerie patient-praticien est accessible dès la création d'un rendez-vous, même avant son acceptation par le praticien. Cela crée du spam et des notifications inutiles.

OBJECTIF :
Modifier la logique de récupération des conversations pour afficher UNIQUEMENT les conversations des rendez-vous avec status 'confirmed' ou 'completed'.

FICHIER À MODIFIER :
src/hooks/useConversations.ts

MODIFICATION REQUISE :
Dans la fonction useConversations (ligne ~43-66), ajouter un filtre sur le statut des rendez-vous.

CODE ACTUEL (lignes 43-66) :
```typescript
const { data: appointments, error: aptError } = await withTimeout(
  supabase
    .from('appointments')
    .select(`
      *,
      messages (
        id,
        content,
        created_at,
        sender_id,
        is_read
      )
    `)
    .or(
      userType === 'patient'
        ? `patient_id.eq.${userId}`
        : `practitioner_id.eq.${userId}`
    )
    .order('created_at', { ascending: false })
    .limit(50)
);
```

NOUVEAU CODE REQUIS :
Ajouter un filtre .in('status', ['confirmed', 'completed']) juste après le .or() et avant le .order().

CONTRAINTES IMPORTANTES :
1. ✅ Conserver EXACTEMENT la même structure de requête
2. ✅ Ne PAS modifier les autres paramètres (limit, order, select)
3. ✅ Vérifier que le filtre fonctionne pour les deux types d'utilisateurs (patient ET practitioner)
4. ✅ Tester qu'aucune conversation existante ne disparaît pour les RDV déjà confirmés
5. ✅ S'assurer que les messages des RDV 'completed' restent accessibles

TESTS À EFFECTUER :
1. Créer un nouveau rendez-vous → Vérifier que la conversation n'apparaît PAS dans l'onglet Messages
2. Faire accepter et payer le rendez-vous (status = 'confirmed') → Vérifier que la conversation apparaît
3. Compléter un rendez-vous (status = 'completed') → Vérifier que la conversation reste accessible
4. Vérifier côté patient ET côté praticien

RÉSULTAT ATTENDU :
- Les rendez-vous avec status 'awaiting_practitioner', 'pending_payment', 'cancelled', 'rejected' ne doivent PAS avoir de conversation visible
- Les rendez-vous 'confirmed' et 'completed' doivent avoir leur conversation accessible
- Aucun crash, aucune erreur console
- Pas de régression sur les fonctionnalités existantes (typing indicators, pièces jointes, read receipts)
```

---

## Prompt #2 - Créer Formulaire Rapports de Consultation

### 🎯 Objectif
Créer une interface complète permettant aux praticiens de créer des rapports de consultation détaillés.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares. Les praticiens ont actuellement un hook useCreateConsultationReport pour créer des rapports de consultation, mais il n'y a AUCUNE interface utilisateur pour utiliser ce hook. Ils peuvent seulement voir les rapports existants.

OBJECTIF :
Créer un dialog/formulaire complet permettant aux praticiens de créer des rapports de consultation pour leurs rendez-vous complétés.

FICHIERS À CRÉER :
1. src/components/dashboard/practitioner/ConsultationReportFormDialog.tsx (NOUVEAU)

FICHIER À MODIFIER :
2. src/components/dashboard/practitioner/ConsultationReportSection.tsx (ajouter bouton)

SCHÉMA DE LA TABLE consultation_reports :
```typescript
interface ConsultationReport {
  id: uuid;                           // Auto-généré
  practitioner_id: uuid;              // ID du praticien
  appointment_id: text;               // ID du rendez-vous
  consultation_date: timestamp;       // Date de consultation
  consultation_type: text;            // 'domicile' | 'teleconsultation' | 'suivi'
  consultation_reason: text;          // Motif de la consultation
  clinical_findings: text;            // Constats cliniques
  primary_diagnosis: text;            // Diagnostic principal
  treatment_prescription: text;       // Traitement prescrit
  follow_up_recommendation: text;     // Recommandations de suivi
  follow_up_timeframe: text;          // '24h' | '3-7j' | 'demande' | 'autre'
  additional_comments: text;          // Commentaires additionnels
  severity_level: text;               // 'urgent' | 'modere' | 'leger'
  share_with_doctor: boolean;         // Partager avec médecin traitant
  created_at: timestamp;              // Auto
  updated_at: timestamp;              // Auto
}
```

HOOK EXISTANT À UTILISER :
```typescript
import { useCreateConsultationReport } from '@/hooks/useConsultationReports';

const createReport = useCreateConsultationReport();

// Usage :
await createReport.mutateAsync({
  practitioner_id: practitionerId,
  appointment_id: appointmentId,
  consultation_date: new Date().toISOString(),
  consultation_type: 'domicile',
  consultation_reason: 'Douleurs abdominales',
  clinical_findings: 'Abdomen sensible au toucher',
  primary_diagnosis: 'Gastro-entérite aiguë',
  treatment_prescription: 'Paracétamol 1g x3/jour',
  follow_up_recommendation: 'Consulter si symptômes persistent',
  follow_up_timeframe: '3-7j',
  additional_comments: '',
  severity_level: 'modere',
  share_with_doctor: false,
});
```

SPÉCIFICATIONS DU COMPOSANT ConsultationReportFormDialog :

1. PROPS :
```typescript
interface ConsultationReportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitionerId: string;
  appointmentId: string;
  appointmentDate: string;
  patientName: string;
  onSuccess?: () => void;
}
```

2. CHAMPS DU FORMULAIRE (dans l'ordre) :
   a) Informations générales (lecture seule) :
      - Patient : {patientName}
      - Date du rendez-vous : {appointmentDate}

   b) Type de consultation (Select required) :
      - Options : "Consultation à domicile", "Téléconsultation", "Suivi post-consultation"
      - Values : "domicile", "teleconsultation", "suivi"

   c) Niveau de gravité (Select required) :
      - Options : "Léger" (green badge), "Modéré" (yellow badge), "Urgent" (red badge)
      - Values : "leger", "modere", "urgent"

   d) Motif de la consultation (Textarea required, 3 rows)
   e) Constats cliniques / Signes observés (Textarea required, 4 rows)
   f) Diagnostic principal (Textarea required, 3 rows)
   g) Traitement / Prescription proposée (Textarea required, 4 rows)
   h) Délai de suivi recommandé (Select required) :
      - Options : "Dans 24h", "Dans 3 à 7 jours", "À la demande du patient", "Autre (voir commentaires)"
      - Values : "24h", "3-7j", "demande", "autre"
   i) Recommandations de suivi (Textarea, 3 rows)
   j) Commentaires complémentaires (Textarea, 3 rows)
   k) Partager avec le médecin traitant (Switch/Checkbox)

3. VALIDATION :
   - Tous les champs marqués "required" doivent être remplis
   - Afficher un message d'erreur si un champ requis est vide
   - Désactiver le bouton "Créer le rapport" si validation échoue

4. COMPORTEMENT :
   - Bouton "Créer le rapport" → Appelle createReport.mutateAsync()
   - En cas de succès :
     * Toast success "Rapport créé avec succès"
     * Appeler onSuccess() si fourni
     * Fermer le dialog
     * Invalider queries ['consultation-reports', practitionerId]
   - En cas d'erreur :
     * Toast error "Impossible de créer le rapport"
     * Garder le dialog ouvert

5. UI/UX :
   - Utiliser shadcn/ui components : Dialog, Select, Textarea, Label, Button, Switch
   - Icône FileText dans le titre
   - Loading state sur le bouton pendant création
   - Responsive design

MODIFICATION DE ConsultationReportSection.tsx :

Ajouter un bouton "+ Nouveau rapport" dans le CardHeader :

```typescript
<CardHeader>
  <div className="flex items-center justify-between">
    <div>
      <CardTitle className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Rapports de consultation
      </CardTitle>
      <CardDescription>
        {totalCount} rapport(s) de consultation au total
      </CardDescription>
    </div>
    <Button onClick={() => setShowCreateDialog(true)}>
      <Plus className="h-4 w-4 mr-2" />
      Nouveau rapport
    </Button>
  </div>
</CardHeader>
```

Au clic, ouvrir un dialog de sélection de rendez-vous :
1. Afficher liste des rendez-vous avec status 'completed'
2. Filtrer ceux qui n'ont PAS déjà de rapport
3. Au clic sur un rendez-vous, ouvrir ConsultationReportFormDialog avec les infos du rendez-vous

CONTRAINTES IMPORTANTES :
1. ✅ Utiliser EXACTEMENT le hook useCreateConsultationReport existant (ne pas créer de nouveau hook)
2. ✅ Respecter le schéma de la table consultation_reports
3. ✅ Valider tous les champs required côté client
4. ✅ Gérer les états de loading et d'erreur
5. ✅ Utiliser les composants shadcn/ui existants
6. ✅ Suivre le style des autres composants du projet (CareNotesSection comme référence)
7. ✅ Ne PAS créer de rapport pour un rendez-vous qui en a déjà un

TESTS À EFFECTUER :
1. Ouvrir le dialog et vérifier que tous les champs s'affichent
2. Essayer de soumettre sans remplir les champs required → Validation doit bloquer
3. Remplir tous les champs et créer un rapport → Succès
4. Vérifier que le rapport apparaît dans la liste
5. Vérifier que le toast de succès s'affiche
6. Vérifier qu'on ne peut pas créer 2 rapports pour le même rendez-vous

RÉSULTAT ATTENDU :
- Dialog fonctionnel avec formulaire complet
- Validation des champs required
- Création de rapport fonctionnelle
- Toast notifications appropriés
- Aucune régression sur l'affichage des rapports existants
```

---

## Prompt #3 - Export PDF des Rapports Médicaux

### 🎯 Objectif
Permettre aux patients de télécharger leurs rapports de consultation en PDF.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares. Les patients peuvent voir leurs rapports de consultation à l'écran mais ne peuvent PAS les télécharger en PDF. L'application utilise déjà jsPDF et jspdf-autotable pour générer des reçus de paiement PDF (voir src/components/PaymentReceiptDialog.tsx comme référence).

OBJECTIF :
Ajouter un bouton "Télécharger PDF" dans chaque rapport de consultation affiché dans le dashboard patient, générant un PDF professionnel du rapport.

FICHIER À MODIFIER :
src/components/dashboard/PatientConsultationReportsVirtualized.tsx

BIBLIOTHÈQUES DÉJÀ INSTALLÉES :
```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
```

RÉFÉRENCE EXISTANTE :
Voir src/components/PaymentReceiptDialog.tsx:handleDownloadPDF() pour la structure générale.

SPÉCIFICATIONS DU PDF :

1. EN-TÊTE :
   ```
   ┌────────────────────────────────────────┐
   │  RAPPORT DE CONSULTATION MÉDICALE      │
   │                                        │
   │  Date: {consultation_date}             │
   │  Praticien: {practitioner_name}        │
   │  Type: {consultation_type}             │
   │  Gravité: {severity_level}             │
   └────────────────────────────────────────┘
   ```

2. SECTIONS DU PDF (dans l'ordre) :

   Section 1 : Motif de la consultation
   - Titre en gras
   - Contenu : {consultation_reason}

   Section 2 : Constats cliniques / Signes observés
   - Titre en gras
   - Contenu : {clinical_findings}

   Section 3 : Diagnostic principal
   - Titre en gras
   - Contenu : {primary_diagnosis}

   Section 4 : Traitement / Prescription
   - Titre en gras
   - Contenu : {treatment_prescription}

   Section 5 : Recommandations de suivi
   - Titre en gras
   - Contenu : {follow_up_recommendation}
   - Délai : {follow_up_timeframe}

   Section 6 : Commentaires complémentaires (si présent)
   - Titre en gras
   - Contenu : {additional_comments}

3. FORMATAGE :
   - Police : Helvetica
   - Titre principal : 18pt, gras, centré
   - Sous-titres sections : 12pt, gras
   - Contenu : 10pt, normal
   - Marges : 20mm de chaque côté
   - Espacement entre sections : 10mm
   - Utiliser autoTable pour un affichage propre des informations

4. NOM DU FICHIER :
   Format : `Rapport_Consultation_{YYYY-MM-DD}.pdf`
   Exemple : `Rapport_Consultation_2025-11-30.pdf`

IMPLÉMENTATION :

1. AJOUTER FONCTION handleDownloadPDF :
```typescript
const handleDownloadPDF = (report: Report) => {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPosition = 20;

    // EN-TÊTE
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT DE CONSULTATION MÉDICALE', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // INFORMATIONS GÉNÉRALES
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const headerInfo = [
      ['Date de consultation', format(new Date(report.consultation_date), 'PPP à HH:mm', { locale: fr })],
      ['Praticien', report.appointments?.practitioner_name || 'Non spécifié'],
      ['Type de consultation', getConsultationType(report.consultation_type)],
      ['Niveau de gravité', report.severity_level.toUpperCase()],
    ];

    autoTable(doc, {
      startY: yPosition,
      body: headerInfo,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { cellWidth: 'auto' },
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;

    // SECTIONS DE CONTENU
    const addSection = (title: string, content: string) => {
      if (!content) return;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 20, yPosition);
      yPosition += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(content, pageWidth - 40);
      doc.text(lines, 20, yPosition);
      yPosition += lines.length * 5 + 8;

      // Nouvelle page si nécessaire
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
    };

    addSection('MOTIF DE LA CONSULTATION', report.consultation_reason || 'Non spécifié');
    addSection('CONSTATS CLINIQUES / SIGNES OBSERVÉS', report.clinical_findings || 'Non spécifié');
    addSection('DIAGNOSTIC PRINCIPAL', report.primary_diagnosis || 'Non spécifié');
    addSection('TRAITEMENT / PRESCRIPTION', report.treatment_prescription || 'Non spécifié');

    if (report.follow_up_recommendation) {
      addSection(
        `RECOMMANDATIONS DE SUIVI (${getFollowUpLabel(report.follow_up_timeframe)})`,
        report.follow_up_recommendation
      );
    }

    if (report.additional_comments) {
      addSection('COMMENTAIRES COMPLÉMENTAIRES', report.additional_comments);
    }

    // FOOTER
    if (report.share_with_doctor) {
      yPosition += 5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('✓ Ce rapport peut être partagé avec votre médecin traitant', 20, yPosition);
    }

    // TÉLÉCHARGEMENT
    const fileName = `Rapport_Consultation_${format(new Date(report.consultation_date), 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);

    toast({
      title: 'Rapport téléchargé',
      description: 'Le rapport a été téléchargé avec succès.',
    });
  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    toast({
      title: 'Erreur',
      description: 'Impossible de générer le PDF du rapport.',
      variant: 'destructive',
    });
  }
};
```

2. AJOUTER BOUTON DANS CHAQUE RAPPORT :

Dans le CardContent, après les sections de contenu, ajouter :

```typescript
<div className="mt-6 pt-4 border-t">
  <Button
    onClick={() => handleDownloadPDF(report)}
    variant="outline"
    className="w-full"
  >
    <Download className="h-4 w-4 mr-2" />
    Télécharger le rapport en PDF
  </Button>
</div>
```

3. IMPORTS NÉCESSAIRES :
```typescript
import { Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
```

CONTRAINTES IMPORTANTES :
1. ✅ Utiliser EXACTEMENT la même structure que PaymentReceiptDialog.tsx
2. ✅ Gérer les champs null/undefined (afficher "Non spécifié")
3. ✅ Gérer les sauts de page si le contenu est trop long
4. ✅ Format de date cohérent avec le reste de l'app (format de date-fns avec locale fr)
5. ✅ Gestion d'erreurs avec try/catch et toast
6. ✅ Respecter le style visuel du reste de l'application

TESTS À EFFECTUER :
1. Télécharger un rapport avec tous les champs remplis → Vérifier le PDF complet
2. Télécharger un rapport avec des champs vides → Vérifier "Non spécifié"
3. Télécharger un rapport avec beaucoup de texte → Vérifier les sauts de page
4. Vérifier le nom du fichier téléchargé
5. Vérifier le toast de succès
6. Tester en cas d'erreur (simuler une erreur) → Toast d'erreur

RÉSULTAT ATTENDU :
- Bouton "Télécharger PDF" visible sur chaque rapport
- PDF généré avec mise en page professionnelle
- Toutes les informations du rapport présentes
- Nom de fichier avec date
- Toast de confirmation
- Pas de crash, pas de régression
```

---

## Prompt #4 - Section Notes SOAP Dashboard Patient

### 🎯 Objectif
Créer une section dédiée dans le dashboard patient pour afficher les notes de soin SOAP partagées par les praticiens.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares. Les praticiens peuvent créer et partager des notes de soin au format SOAP (Subjective, Objective, Assessment, Plan) avec les patients. Actuellement, les patients reçoivent une notification mais il n'y a PAS d'onglet dédié dans leur dashboard pour consulter ces notes. Ils doivent aller dans les messages pour voir la notification.

OBJECTIF :
Créer un composant PatientCareNotesSection qui affiche toutes les notes de soin partagées avec le patient, et l'ajouter comme nouvel onglet dans le dashboard patient.

FICHIERS À CRÉER :
1. src/components/dashboard/PatientCareNotesSection.tsx (NOUVEAU)
2. src/hooks/usePatientCareNotes.ts (NOUVEAU hook)

FICHIER À MODIFIER :
3. src/pages/PatientDashboard.tsx (ajouter onglet)

SCHÉMA DE LA TABLE care_notes :
```typescript
interface CareNote {
  id: uuid;
  appointment_id: text;
  practitioner_id: uuid;
  subjective: text;          // S: Plaintes du patient
  objective: text;           // O: Observations cliniques
  assessment: text;          // A: Analyse/Diagnostic
  plan: text;                // P: Plan de traitement
  attachments: text[];
  shared_with_patient: boolean;  // ⚠️ Filtrer uniquement shared = true
  created_at: timestamp;
  updated_at: timestamp;
}
```

ÉTAPE 1 : CRÉER LE HOOK usePatientCareNotes.ts

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

interface CareNote {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
  // Jointure avec appointments pour récupérer practitioner_name et date
  appointments?: {
    practitioner_name: string;
    date: string;
  };
}

export function usePatientCareNotes(patientId?: string, page = 0, pageSize = 20) {
  return useQuery({
    queryKey: ['patient-care-notes', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [], count: 0 };

      // ✅ Récupérer uniquement les notes partagées avec le patient
      const { data, error, count } = await withTimeout(
        supabase
          .from('care_notes')
          .select(`
            *,
            appointments!inner (
              id,
              patient_id,
              practitioner_name,
              date
            )
          `, { count: 'exact' })
          .eq('shared_with_patient', true)  // ⚠️ IMPORTANT : uniquement notes partagées
          .eq('appointments.patient_id', patientId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );

      if (error) throw error;
      return { data: (data as CareNote[]) || [], count: count || 0 };
    },
    enabled: !!patientId,
    staleTime: 30000,
  });
}
```

ÉTAPE 2 : CRÉER LE COMPOSANT PatientCareNotesSection.tsx

SPÉCIFICATIONS :

1. STRUCTURE :
   - Card avec titre "Mes Notes de Soin"
   - Description : "Notes cliniques partagées par vos praticiens"
   - Affichage paginé (10 notes par page)
   - Si aucune note : Message "Aucune note de soin partagée"

2. AFFICHAGE DE CHAQUE NOTE :
   ```
   ┌─────────────────────────────────────────────────┐
   │  📋 Note de Soin - Dr. {practitioner_name}      │
   │  📅 {date}                                      │
   ├─────────────────────────────────────────────────┤
   │  S - Subjectif (Plaintes du patient)           │
   │  {subjective}                                   │
   │                                                 │
   │  O - Objectif (Observations cliniques)         │
   │  {objective}                                    │
   │                                                 │
   │  A - Analyse (Diagnostic)                      │
   │  {assessment}                                   │
   │                                                 │
   │  P - Plan (Traitement)                         │
   │  {plan}                                         │
   └─────────────────────────────────────────────────┘
   ```

3. FORMATAGE :
   - Chaque section SOAP avec un fond légèrement différent (bg-muted/10)
   - Badge "SOAP" en haut à droite
   - Icônes pour chaque section (MessageSquare, Eye, Stethoscope, ClipboardList)
   - Separator entre chaque note

4. PAGINATION :
   - Boutons Précédent/Suivant en bas
   - Affichage "Page X sur Y"
   - Désactiver boutons si première/dernière page

IMPLÉMENTATION :

```typescript
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  MessageSquare,
  Eye,
  Stethoscope,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientCareNotes } from '@/hooks/usePatientCareNotes';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function PatientCareNotesSection() {
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: result, isLoading } = usePatientCareNotes(
    user?.id,
    page - 1,
    pageSize
  );

  const notes = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aucune note de soin partagée</p>
          <p className="text-sm text-muted-foreground mt-2">
            Les notes partagées par vos praticiens apparaîtront ici
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mes Notes de Soin</h2>
          <p className="text-muted-foreground">
            Notes cliniques au format SOAP partagées par vos praticiens
          </p>
        </div>
        {totalCount > 0 && (
          <Badge variant="outline">
            {totalCount} note{totalCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        {notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Note de Soin - {note.appointments?.practitioner_name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {note.appointments?.date &&
                      format(new Date(note.appointments.date), 'PPP', { locale: fr })
                    }
                  </CardDescription>
                </div>
                <Badge variant="secondary">SOAP</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {note.subjective && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <h4 className="font-semibold text-blue-900">S - Subjectif</h4>
                  </div>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{note.subjective}</p>
                </div>
              )}

              {note.objective && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-green-600" />
                    <h4 className="font-semibold text-green-900">O - Objectif</h4>
                  </div>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{note.objective}</p>
                </div>
              )}

              {note.assessment && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Stethoscope className="h-4 w-4 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">A - Analyse</h4>
                  </div>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">{note.assessment}</p>
                </div>
              )}

              {note.plan && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="h-4 w-4 text-orange-600" />
                    <h4 className="font-semibold text-orange-900">P - Plan</h4>
                  </div>
                  <p className="text-sm text-orange-800 whitespace-pre-wrap">{note.plan}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

ÉTAPE 3 : AJOUTER ONGLET DANS PatientDashboard.tsx

Dans src/pages/PatientDashboard.tsx :

1. IMPORT :
```typescript
import { PatientCareNotesSection } from '@/components/dashboard/PatientCareNotesSection';
```

2. AJOUTER ONGLET (après l'onglet "medical-reports") :
```typescript
<TabsTrigger value="care-notes" className="flex items-center gap-2 whitespace-nowrap">
  <ClipboardList className="h-4 w-4" />
  <span className="hidden sm:inline">Notes de Soin</span>
</TabsTrigger>
```

3. AJOUTER CONTENU :
```typescript
<TabsContent value="care-notes">
  <Suspense fallback={
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  }>
    <PatientCareNotesSection />
  </Suspense>
</TabsContent>
```

CONTRAINTES IMPORTANTES :
1. ✅ Filtrer UNIQUEMENT les notes avec shared_with_patient = true
2. ✅ Afficher uniquement les notes des rendez-vous du patient connecté
3. ✅ Gérer les champs null (ne pas afficher la section si null)
4. ✅ Respecter le format SOAP avec codes couleur distincts
5. ✅ Pagination fonctionnelle
6. ✅ Loading states appropriés
7. ✅ Responsive design

TESTS À EFFECTUER :
1. Praticien crée et partage une note SOAP → Patient doit la voir dans l'onglet
2. Praticien crée une note SANS la partager → Patient ne doit PAS la voir
3. Vérifier que seules les notes du patient connecté s'affichent
4. Tester la pagination si > 10 notes
5. Vérifier le responsive design
6. Vérifier les couleurs et la lisibilité

RÉSULTAT ATTENDU :
- Nouvel onglet "Notes de Soin" visible dans le dashboard patient
- Affichage clair et coloré du format SOAP
- Pagination fonctionnelle
- Uniquement les notes partagées visibles
- Aucun crash, aucune régression
```

---

## Prompt #5 - Documentation Usage Rapports vs Notes

### 🎯 Objectif
Ajouter des tooltips et de la documentation inline pour clarifier quand utiliser les rapports de consultation vs les notes SOAP.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares. Les praticiens ont accès à DEUX systèmes de documentation médicale :
1. Rapports de Consultation (consultation_reports) - Rapports formels détaillés
2. Notes de Soin SOAP (care_notes) - Notes cliniques rapides

Il n'y a actuellement AUCUNE explication sur quand utiliser l'un ou l'autre, ce qui crée de la confusion.

OBJECTIF :
Ajouter des tooltips, des descriptions et une documentation inline pour clarifier l'usage de chaque système.

FICHIERS À MODIFIER :
1. src/components/dashboard/practitioner/ConsultationReportSection.tsx
2. src/components/dashboard/practitioner/CareNotesSection.tsx

BIBLIOTHÈQUE À UTILISER :
shadcn/ui Tooltip component (déjà installé)

MODIFICATIONS :

FICHIER 1 : ConsultationReportSection.tsx

Dans le CardHeader, ajouter un tooltip explicatif :

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from 'lucide-react';

// Dans le CardHeader :
<CardTitle className="flex items-center gap-2">
  <FileText className="h-5 w-5" />
  Rapports de consultation
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" side="right">
        <div className="space-y-2">
          <p className="font-semibold">Quand utiliser les Rapports de Consultation ?</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Consultations importantes</li>
            <li>Diagnostics formels et détaillés</li>
            <li>Documentation complète pour médecin traitant</li>
            <li>Cas nécessitant un suivi médical spécifique</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            ℹ️ Ces rapports peuvent être partagés avec le médecin traitant du patient.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</CardTitle>

<CardDescription>
  Rapports formels et détaillés pour consultations importantes • {totalCount} rapport(s) au total
</CardDescription>
```

FICHIER 2 : CareNotesSection.tsx

Dans le CardHeader, ajouter un tooltip similaire :

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from 'lucide-react';

// Dans le CardHeader :
<CardTitle>
  <div className="flex items-center gap-2">
    Note de soin (Format SOAP)
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="right">
          <div className="space-y-2">
            <p className="font-semibold">Quand utiliser les Notes SOAP ?</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Suivis rapides et consultations de routine</li>
              <li>Notes cliniques quotidiennes</li>
              <li>Documentation structurée mais concise</li>
              <li>Partage rapide avec le patient</li>
            </ul>
            <div className="mt-3 p-2 bg-muted rounded text-xs">
              <p className="font-semibold mb-1">Format SOAP :</p>
              <p><strong>S</strong>ubjectif : Plaintes du patient</p>
              <p><strong>O</strong>bjectif : Observations cliniques</p>
              <p><strong>A</strong>nalyse : Diagnostic/Évaluation</p>
              <p><strong>P</strong>lan : Traitement/Recommandations</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</CardTitle>

<CardDescription>
  Notes cliniques rapides au format SOAP • Subjectif, Objectif, Analyse, Plan
</CardDescription>
```

AJOUTER AUSSI UN ENCART INFORMATIF :

Dans les deux composants, ajouter un Alert en haut du composant (après le titre) :

```typescript
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

// Pour ConsultationReportSection :
<Alert className="mb-4">
  <Info className="h-4 w-4" />
  <AlertDescription>
    <strong>Rapports de Consultation</strong> : Pour documentations formelles et détaillées.
    Utilisez <strong>Notes SOAP</strong> pour suivis rapides (onglet séparé).
  </AlertDescription>
</Alert>

// Pour CareNotesSection :
<Alert className="mb-4">
  <Info className="h-4 w-4" />
  <AlertDescription>
    <strong>Notes SOAP</strong> : Pour suivis rapides et notes cliniques quotidiennes.
    Utilisez <strong>Rapports de Consultation</strong> pour documentations formelles (onglet séparé).
  </AlertDescription>
</Alert>
```

DANS LE DIALOG DE CRÉATION (ConsultationReportFormDialog.tsx) :

Ajouter une section informative en haut du dialog :

```typescript
<DialogHeader>
  <DialogTitle className="flex items-center gap-2">
    <FileText className="h-5 w-5" />
    Créer un Rapport de Consultation
  </DialogTitle>
  <DialogDescription className="space-y-2">
    <p>Rapport formel et détaillé pour consultation importante</p>
    <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <p>
        Pour des notes cliniques rapides, utilisez plutôt l'onglet <strong>Notes de Soin (SOAP)</strong>.
      </p>
    </div>
  </DialogDescription>
</DialogHeader>
```

CONTRAINTES IMPORTANTES :
1. ✅ Tooltips doivent être clairs et concis
2. ✅ Utiliser les composants shadcn/ui existants
3. ✅ Respecter le style visuel de l'application
4. ✅ Ne PAS surcharger l'interface (tooltips sur icône Help uniquement)
5. ✅ Informations cohérentes entre les deux composants

TESTS À EFFECTUER :
1. Survoler l'icône Help dans Rapports → Tooltip s'affiche
2. Survoler l'icône Help dans Notes SOAP → Tooltip s'affiche
3. Vérifier que les descriptions sont claires et compréhensibles
4. Vérifier le responsive (tooltips s'adaptent)
5. Aucun crash, aucune régression

RÉSULTAT ATTENDU :
- Tooltips informatifs sur icônes Help
- Descriptions claires dans CardDescription
- Alerts informatifs en haut des sections
- Praticiens comprennent quand utiliser chaque système
- Aucune surcharge visuelle
```

---

## Prompt #6 - Pagination Infinie Conversations

### 🎯 Objectif
Ajouter une pagination infinie (scroll to load more) pour les conversations afin que les utilisateurs très actifs (>50 conversations) puissent accéder aux anciennes.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
Je travaille sur l'application DomiCares. La messagerie affiche actuellement un maximum de 50 conversations (limit: 50 dans la requête). Les utilisateurs très actifs ne peuvent pas accéder à leurs conversations plus anciennes.

OBJECTIF :
Remplacer la limite fixe de 50 par une pagination infinie utilisant React Query's useInfiniteQuery. L'utilisateur pourra scroller en bas de la liste pour charger plus de conversations.

FICHIERS À MODIFIER :
1. src/hooks/useConversations.ts
2. src/components/messaging/ConversationsList.tsx

ÉTAPE 1 : MODIFIER src/hooks/useConversations.ts

REMPLACER useQuery par useInfiniteQuery :

```typescript
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ANCIENNE VERSION (à remplacer) :
export function useConversations(userId?: string, userType?: 'patient' | 'practitioner') {
  const queryClient = useQueryClient();

  const query = useQuery<Conversation[]>({
    queryKey: ['conversations', userId, userType],
    queryFn: async () => {
      // ... requête avec .limit(50)
    },
    // ...
  });
  // ...
}

// NOUVELLE VERSION avec pagination infinie :
export function useConversations(userId?: string, userType?: 'patient' | 'practitioner') {
  const queryClient = useQueryClient();
  const pageSize = 20; // Charger 20 conversations par page

  const query = useInfiniteQuery<{
    conversations: Conversation[];
    hasMore: boolean;
  }>({
    queryKey: ['conversations', userId, userType],
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return { conversations: [], hasMore: false };

      // ✅ IMPORTANT : Ajouter filtre sur status (correction prompt #1)
      const { data: appointments, error: aptError } = await withTimeout(
        supabase
          .from('appointments')
          .select(`
            *,
            messages (
              id,
              content,
              created_at,
              sender_id,
              is_read
            )
          `)
          .or(
            userType === 'patient'
              ? `patient_id.eq.${userId}`
              : `practitioner_id.eq.${userId}`
          )
          .in('status', ['confirmed', 'completed']) // ✅ Filtre ajouté
          .order('created_at', { ascending: false })
          .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1)
      );

      if (aptError) throw aptError;
      if (!appointments || appointments.length === 0) {
        return { conversations: [], hasMore: false };
      }

      // Process conversations (même logique qu'avant)
      const conversations: Conversation[] = appointments.map((apt: any) => {
        const messages = apt.messages || [];
        const sortedMessages = messages.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const lastMessage = sortedMessages[0];
        const unreadCount = messages.filter(
          (m: any) => !m.is_read && m.sender_id !== userId
        ).length;

        return {
          appointment_id: apt.id,
          patient_id: apt.patient_id,
          patient_name: apt.patient_name,
          practitioner_id: apt.practitioner_id,
          practitioner_name: apt.practitioner_name,
          last_message: lastMessage?.content || 'Aucun message',
          last_message_at: lastMessage?.created_at || apt.created_at,
          unread_count: unreadCount,
          appointment_date: apt.date,
          appointment_status: apt.status,
        };
      });

      const sortedConversations = conversations.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

      // Déterminer s'il y a plus de pages
      const hasMore = appointments.length === pageSize;

      return { conversations: sortedConversations, hasMore };
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.hasMore ? allPages.length : undefined;
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Garder le même système de realtime subscription
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations', userId, userType] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, userType, queryClient]);

  return query;
}
```

ÉTAPE 2 : MODIFIER src/components/messaging/ConversationsList.tsx

ADAPTER POUR useInfiniteQuery :

```typescript
import { useEffect, useRef } from 'react';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversation?: Conversation;
  onSelectConversation: (conversation: Conversation) => void;
  userType: 'patient' | 'practitioner';
  // NOUVEAUX PROPS :
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

export function ConversationsList({
  conversations,
  selectedConversation,
  onSelectConversation,
  userType,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: ConversationsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll : détecter quand on atteint le bas
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !hasNextPage || isFetchingNextPage) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;

      // Si on est à 100px du bas, charger plus
      if (scrollHeight - scrollTop - clientHeight < 100) {
        fetchNextPage?.();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ... reste du code identique jusqu'au ScrollArea

  return (
    <Card className="h-[calc(100vh-12rem)]">
      <CardHeader className="border-b pb-4">
        {/* ... CardHeader identique ... */}
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea
          className="h-[calc(100vh-16rem)]"
          ref={scrollRef} // ✅ Ajouter ref
        >
          <div className="divide-y">
            {conversations.map((conversation) => (
              // ... même code de rendu ...
            ))}

            {/* Indicateur de chargement en bas */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Chargement...
                </span>
              </div>
            )}

            {/* Message si plus de conversations */}
            {!hasNextPage && conversations.length > 0 && (
              <div className="text-center p-4 text-sm text-muted-foreground">
                Toutes les conversations chargées
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
```

ÉTAPE 3 : ADAPTER LES COMPOSANTS PARENTS

Dans MessagesSection.tsx et PractitionerMessagesSection.tsx :

```typescript
export function MessagesSection() {
  const { data: user } = useSupabaseUser();
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversations(user?.id, 'patient');

  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();

  // Aplatir les pages de conversations
  const conversations = data?.pages.flatMap(page => page.conversations) || [];

  // ... reste du code ...

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <ConversationsList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          userType="patient"
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      </div>
      {/* ... reste ... */}
    </div>
  );
}
```

CONTRAINTES IMPORTANTES :
1. ✅ Conserver la fonctionnalité de realtime subscription
2. ✅ Gérer les états de loading (initial + fetchNextPage)
3. ✅ Scroll smooth (pas de saut visuel)
4. ✅ Désactiver le scroll trigger pendant le chargement
5. ✅ Tester avec >100 conversations
6. ✅ Vérifier que la sélection de conversation fonctionne toujours

TESTS À EFFECTUER :
1. Créer >20 conversations → Vérifier que seules les 20 premières se chargent
2. Scroller en bas de la liste → Vérifier que 20 autres se chargent
3. Continuer jusqu'à épuiser toutes les conversations → Message "Toutes chargées"
4. Vérifier l'indicateur de chargement pendant fetchNextPage
5. Tester la sélection d'une conversation (doit fonctionner normalement)
6. Vérifier que les messages temps réel fonctionnent toujours

RÉSULTAT ATTENDU :
- Pagination infinie fonctionnelle
- Chargement progressif par batch de 20
- Pas de limite sur le nombre total de conversations
- Loading states appropriés
- Aucune régression sur messagerie temps réel
```

---

## Prompt de Test Global

### 🎯 Objectif
Tester l'ensemble des corrections implémentées pour s'assurer qu'aucune régression n'a été introduite.

### 📝 Prompt pour Lovable.dev

```
CONTEXTE :
J'ai implémenté plusieurs corrections sur le système de messagerie et de rapports médicaux de l'application DomiCares. Je veux maintenant effectuer un test complet pour m'assurer qu'il n'y a AUCUNE régression.

CORRECTIONS IMPLÉMENTÉES :
1. ✅ Messagerie restreinte aux RDV confirmés/complétés
2. ✅ Formulaire de création de rapports de consultation
3. ✅ Export PDF des rapports médicaux
4. ✅ Section Notes SOAP dans dashboard patient
5. ✅ Documentation tooltips rapports vs notes
6. ✅ Pagination infinie conversations

PLAN DE TEST COMPLET :

═══════════════════════════════════════════════════════════
PHASE 1 : TESTS MESSAGERIE
═══════════════════════════════════════════════════════════

Test 1.1 - Messagerie NON accessible avant confirmation
─────────────────────────────────────────────────────────
[ ] En tant que PATIENT :
    1. Créer un nouveau rendez-vous
    2. Vérifier status = 'awaiting_practitioner'
    3. Aller dans onglet "Messages"
    4. ✅ ATTENDU : La conversation ne doit PAS apparaître

[ ] En tant que PRATICIEN :
    1. Voir le nouveau rendez-vous
    2. Aller dans onglet "Messages"
    3. ✅ ATTENDU : La conversation ne doit PAS apparaître

Test 1.2 - Messagerie accessible après confirmation
─────────────────────────────────────────────────────────
[ ] En tant que PRATICIEN :
    1. Accepter le rendez-vous (status = 'pending_payment')
    2. Vérifier dans "Messages"
    3. ❌ ATTENDU : Conversation toujours invisible (pas encore payé)

[ ] En tant que PATIENT :
    1. Effectuer le paiement (status = 'confirmed')
    2. Rafraîchir l'onglet "Messages"
    3. ✅ ATTENDU : Conversation apparaît maintenant

[ ] En tant que PRATICIEN :
    1. Rafraîchir "Messages"
    2. ✅ ATTENDU : Conversation apparaît maintenant

Test 1.3 - Fonctionnalités messagerie temps réel
─────────────────────────────────────────────────────────
[ ] Ouvrir 2 fenêtres : une patient, une praticien
[ ] Patient envoie message → Praticien reçoit en temps réel
[ ] Vérifier typing indicator "En train d'écrire..."
[ ] Praticien envoie message → Patient reçoit en temps réel
[ ] Vérifier read receipts (✓ → ✓✓)
[ ] Envoyer pièce jointe image → Vérifier affichage
[ ] Envoyer pièce jointe PDF → Vérifier download

Test 1.4 - Pagination infinie conversations
─────────────────────────────────────────────────────────
[ ] Créer >20 conversations (si possible)
[ ] Vérifier que seules 20 premières apparaissent
[ ] Scroller en bas → 20 autres chargent
[ ] Vérifier indicateur "Chargement..."
[ ] Atteindre la fin → Message "Toutes chargées"

═══════════════════════════════════════════════════════════
PHASE 2 : TESTS RAPPORTS DE CONSULTATION
═══════════════════════════════════════════════════════════

Test 2.1 - Création de rapport par praticien
─────────────────────────────────────────────────────────
[ ] En tant que PRATICIEN :
    1. Compléter un rendez-vous (status = 'completed')
    2. Aller dans onglet "Rapports"
    3. Cliquer "Nouveau rapport"
    4. ✅ ATTENDU : Dialog de sélection s'ouvre

[ ] Sélectionner un rendez-vous complété
[ ] ✅ ATTENDU : Formulaire de rapport s'ouvre

[ ] Essayer de soumettre sans remplir champs required
[ ] ❌ ATTENDU : Validation bloque + messages d'erreur

[ ] Remplir tous les champs :
    - Type : "Consultation à domicile"
    - Gravité : "Modéré"
    - Motif : "Test douleurs abdominales"
    - Constats : "Abdomen sensible"
    - Diagnostic : "Gastro-entérite"
    - Traitement : "Paracétamol 1g x3/j"
    - Suivi : "Dans 3 à 7 jours"
    - Recommandations : "Repos et hydratation"
    - Commentaires : "Rappeler si aggravation"
    - Partage médecin : Activé

[ ] Soumettre le formulaire
[ ] ✅ ATTENDU : Toast "Rapport créé avec succès"
[ ] ✅ ATTENDU : Rapport apparaît dans la liste

Test 2.2 - Visualisation rapport par patient
─────────────────────────────────────────────────────────
[ ] En tant que PATIENT :
    1. Aller dans onglet "Rapports Médicaux"
    2. ✅ ATTENDU : Le rapport créé apparaît
    3. Vérifier toutes les sections :
       - Informations générales
       - Motif consultation
       - Constats cliniques
       - Diagnostic principal
       - Traitement
       - Recommandations suivi
       - Commentaires
    4. ✅ ATTENDU : Badge "Partage médecin" visible

Test 2.3 - Export PDF rapport
─────────────────────────────────────────────────────────
[ ] En tant que PATIENT :
    1. Sur un rapport, cliquer "Télécharger PDF"
    2. ✅ ATTENDU : PDF téléchargé avec nom "Rapport_Consultation_YYYY-MM-DD.pdf"
    3. Ouvrir le PDF
    4. ✅ ATTENDU : Toutes les sections présentes et formatées
    5. ✅ ATTENDU : En-tête avec date, praticien, type, gravité
    6. ✅ ATTENDU : Toast "Rapport téléchargé"

═══════════════════════════════════════════════════════════
PHASE 3 : TESTS NOTES SOAP
═══════════════════════════════════════════════════════════

Test 3.1 - Création note SOAP par praticien
─────────────────────────────────────────────────────────
[ ] En tant que PRATICIEN :
    1. Aller dans onglet "Notes de Soin"
    2. Sélectionner un rendez-vous complété
    3. Remplir format SOAP :
       - S : "Patient se plaint de maux de tête"
       - O : "Tension artérielle 130/85"
       - A : "Probable céphalée de tension"
       - P : "Repos, paracétamol si nécessaire"
    4. Activer "Partager avec patient"
    5. Cliquer "Sauvegarder"
    6. ✅ ATTENDU : Toast "Note sauvegardée"

[ ] Cliquer "Partager"
[ ] ✅ ATTENDU : Dialog de confirmation
[ ] Confirmer le partage
[ ] ✅ ATTENDU : Toast "Note partagée"

Test 3.2 - Réception note par patient
─────────────────────────────────────────────────────────
[ ] En tant que PATIENT :
    1. ✅ ATTENDU : Notification "Nouvelle note de soin"
    2. Aller dans onglet "Messages"
    3. ✅ ATTENDU : Message du praticien sur note disponible
    4. Aller dans onglet "Notes de Soin" (NOUVEAU)
    5. ✅ ATTENDU : La note partagée apparaît

[ ] Vérifier affichage de la note :
    - ✅ Section S en bleu avec icône MessageSquare
    - ✅ Section O en vert avec icône Eye
    - ✅ Section A en violet avec icône Stethoscope
    - ✅ Section P en orange avec icône ClipboardList
    - ✅ Badge "SOAP" visible
    - ✅ Nom praticien et date affichés

Test 3.3 - Note NON partagée invisible
─────────────────────────────────────────────────────────
[ ] En tant que PRATICIEN :
    1. Créer une nouvelle note SOAP
    2. NE PAS activer "Partager avec patient"
    3. Sauvegarder

[ ] En tant que PATIENT :
    1. Vérifier onglet "Notes de Soin"
    2. ❌ ATTENDU : Cette note ne doit PAS apparaître

═══════════════════════════════════════════════════════════
PHASE 4 : TESTS DOCUMENTATION & UX
═══════════════════════════════════════════════════════════

Test 4.1 - Tooltips explicatifs
─────────────────────────────────────────────────────────
[ ] En tant que PRATICIEN :
    1. Onglet "Rapports" → Survoler icône Help (?)
    2. ✅ ATTENDU : Tooltip avec explication quand utiliser
    3. Onglet "Notes de Soin" → Survoler icône Help (?)
    4. ✅ ATTENDU : Tooltip avec explication format SOAP

Test 4.2 - Alerts informatifs
─────────────────────────────────────────────────────────
[ ] Vérifier Alert en haut de "Rapports"
[ ] ✅ ATTENDU : Mention des Notes SOAP pour suivis rapides
[ ] Vérifier Alert en haut de "Notes de Soin"
[ ] ✅ ATTENDU : Mention des Rapports pour docs formelles

Test 4.3 - Dialog de création rapport
─────────────────────────────────────────────────────────
[ ] Ouvrir dialog "Nouveau rapport"
[ ] ✅ ATTENDU : Encart bleu avec info sur Notes SOAP

═══════════════════════════════════════════════════════════
PHASE 5 : TESTS DE RÉGRESSION
═══════════════════════════════════════════════════════════

Test 5.1 - Système de paiement
─────────────────────────────────────────────────────────
[ ] Créer rendez-vous → Paiement FedaPay
[ ] ✅ ATTENDU : Widget embarqué fonctionne
[ ] ✅ ATTENDU : Dashboard se rafraîchit après paiement
[ ] ✅ ATTENDU : Reçu PDF téléchargeable

Test 5.2 - Validation rendez-vous dupliqués
─────────────────────────────────────────────────────────
[ ] Créer rendez-vous pour date X avec praticien Y
[ ] Essayer créer 2e rendez-vous même date, même praticien
[ ] ❌ ATTENDU : Message d'erreur "Vous avez déjà un rendez-vous"

Test 5.3 - Dashboard général
─────────────────────────────────────────────────────────
[ ] Patient : Vérifier tous les onglets s'affichent
[ ] Praticien : Vérifier tous les onglets s'affichent
[ ] ✅ ATTENDU : Aucun crash, aucune erreur console

═══════════════════════════════════════════════════════════
RÉSULTATS ATTENDUS GLOBAUX
═══════════════════════════════════════════════════════════

[ ] ✅ Tous les tests PHASE 1 passent (Messagerie)
[ ] ✅ Tous les tests PHASE 2 passent (Rapports Consultation)
[ ] ✅ Tous les tests PHASE 3 passent (Notes SOAP)
[ ] ✅ Tous les tests PHASE 4 passent (Documentation)
[ ] ✅ Tous les tests PHASE 5 passent (Non-régression)
[ ] ✅ Aucune erreur console dans l'application
[ ] ✅ Aucun warning TypeScript
[ ] ✅ Aucun crash durant les tests
[ ] ✅ Toutes les fonctionnalités existantes fonctionnent toujours

Si un test échoue, reporter :
- Numéro du test
- Comportement attendu vs observé
- Message d'erreur (si applicable)
- Étapes pour reproduire
```

---

## 📊 Tableau Récapitulatif des Prompts

| # | Prompt | Priorité | Complexité | Fichiers Modifiés | Temps Estimé |
|---|--------|----------|------------|-------------------|--------------|
| 1 | Restreindre messagerie RDV confirmés | 🔴 Haute | Faible | `useConversations.ts` | 15 min |
| 2 | Formulaire rapports consultation | 🔴 Haute | Moyenne | `ConsultationReportFormDialog.tsx` (nouveau), `ConsultationReportSection.tsx` | 2-3h |
| 3 | Export PDF rapports | 🟡 Moyenne | Moyenne | `PatientConsultationReportsVirtualized.tsx` | 1-2h |
| 4 | Section Notes SOAP patient | 🟡 Moyenne | Moyenne | `PatientCareNotesSection.tsx` (nouveau), `usePatientCareNotes.ts` (nouveau), `PatientDashboard.tsx` | 2-3h |
| 5 | Documentation tooltips | 🟡 Moyenne | Faible | `ConsultationReportSection.tsx`, `CareNotesSection.tsx` | 30 min |
| 6 | Pagination infinie | 🟢 Basse | Moyenne | `useConversations.ts`, `ConversationsList.tsx`, `MessagesSection.tsx`, `PractitionerMessagesSection.tsx` | 1-2h |

---

## ✅ Checklist d'Implémentation

### Ordre Recommandé d'Exécution

**Jour 1 - Corrections Urgentes :**
```
[ ] Prompt #1 - Restreindre messagerie (15 min)
[ ] Test messagerie avec différents statuts
[ ] Prompt #2 - Formulaire rapports (2-3h)
[ ] Test création et affichage rapport
```

**Jour 2 - Améliorations UX :**
```
[ ] Prompt #3 - Export PDF (1-2h)
[ ] Test téléchargement PDF avec différents rapports
[ ] Prompt #5 - Documentation tooltips (30 min)
[ ] Test tooltips et clarté documentation
```

**Jour 3 - Nouvelles Fonctionnalités :**
```
[ ] Prompt #4 - Section Notes SOAP patient (2-3h)
[ ] Test partage et affichage notes
[ ] Prompt de Test Global (1h)
```

**Optionnel - Optimisations :**
```
[ ] Prompt #6 - Pagination infinie (1-2h)
[ ] Test avec nombreuses conversations
[ ] Prompt de Test Global complet
```

---

## 🎯 Conseils d'Utilisation avec Lovable.dev

### Bonnes Pratiques

1. **Copier-Coller Exactement**
   - Copier TOUT le prompt (y compris le bloc "CONTEXTE")
   - Ne pas modifier les contraintes
   - Respecter l'ordre des étapes

2. **Tester Après Chaque Prompt**
   - Ne PAS enchaîner tous les prompts d'un coup
   - Tester chaque fonctionnalité individuellement
   - Vérifier qu'il n'y a pas de régression

3. **Commit Git Entre Chaque Modification**
   ```bash
   git add .
   git commit -m "feat: [description courte de la modification]"
   git push
   ```

4. **En Cas d'Erreur**
   - Relire la section "CONTRAINTES IMPORTANTES"
   - Vérifier les imports manquants
   - Consulter les fichiers de référence mentionnés

5. **Validation Finale**
   - Exécuter le "Prompt de Test Global"
   - Cocher TOUTES les cases
   - S'assurer 0 erreur console

---

**Dernière mise à jour :** 30 novembre 2025
**Version :** 1.0
**Auteur :** Équipe Technique DomiCares

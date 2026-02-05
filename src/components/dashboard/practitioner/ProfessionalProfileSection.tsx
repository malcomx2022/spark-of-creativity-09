import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText, Upload, CheckCircle, XCircle, Clock, AlertCircle,
  RefreshCw, User, Copy, Check, Loader2, HelpCircle, FileCheck, Info
} from "lucide-react";
import { getSignedFileUrl, uploadUserDocument } from "@/lib/file-upload";
import { AvatarUpload } from "@/components/dashboard/AvatarUpload";

const BIO_MAX_LENGTH = 500;

interface ProfessionalProfileSectionProps {
  practitionerId: string;
  practitionerData: any;
  isCoach?: boolean;
}

export function ProfessionalProfileSection({ practitionerId, practitionerData, isCoach = false }: ProfessionalProfileSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [documentState, setDocumentState] = useState({
    idDocument: practitionerData?.id_document_url ?? null,
    licenseDocument: practitionerData?.license_document_url ?? null,
    insuranceDocument: practitionerData?.insurance_document_url ?? null,
  });
  const [pendingDocuments, setPendingDocuments] = useState({
    idDocument: null as File | null,
    licenseDocument: null as File | null,
    insuranceDocument: null as File | null,
  });

  const [formData, setFormData] = useState({
    bio: "",
    diplomas: "",
    languages: "",
    years_experience: 0,
    intervention_radius: 10,
    communes_served: "",
    license_number: "",
  });

  useEffect(() => {
    if (practitionerData) {
      setFormData({
        bio: practitionerData.bio || "",
        diplomas: practitionerData.diplomas?.join(", ") || "",
        languages: practitionerData.languages?.join(", ") || "",
        years_experience: practitionerData.years_experience || 0,
        intervention_radius: practitionerData.intervention_radius || 10,
        communes_served: practitionerData.communes_served?.join(", ") || "",
        license_number: practitionerData.license_number || "",
      });
    }
  }, [practitionerData]);

  useEffect(() => {
    setDocumentState({
      idDocument: practitionerData?.id_document_url ?? null,
      licenseDocument: practitionerData?.license_document_url ?? null,
      insuranceDocument: practitionerData?.insurance_document_url ?? null,
    });
  }, [practitionerData]);

  // Calcul de la complétion du profil
  const profileCompletion = useMemo(() => {
    if (!practitionerData) return { percentage: 0, completed: 0, total: 10 };

    const fields = [
      { name: 'bio', value: practitionerData.bio },
      { name: 'diplomas', value: practitionerData.diplomas?.length > 0 },
      { name: 'languages', value: practitionerData.languages?.length > 0 },
      { name: 'years_experience', value: practitionerData.years_experience > 0 },
      { name: 'license_number', value: practitionerData.license_number },
      { name: 'intervention_radius', value: practitionerData.intervention_radius > 0 },
      { name: 'communes_served', value: practitionerData.communes_served?.length > 0 },
      { name: 'id_document', value: practitionerData.id_document_url },
      { name: 'license_document', value: practitionerData.license_document_url },
      { name: 'insurance_document', value: practitionerData.insurance_document_url },
    ];

    const completed = fields.filter(f => !!f.value).length;
    const total = fields.length;
    const percentage = Math.round((completed / total) * 100);

    return { percentage, completed, total };
  }, [practitionerData]);

  // Compter les documents téléchargés
  const documentsCount = useMemo(() => {
    let count = 0;
    if (documentState.idDocument) count++;
    if (documentState.licenseDocument) count++;
    if (documentState.insuranceDocument) count++;
    return count;
  }, [documentState]);

  // Compter les documents en attente
  const pendingCount = useMemo(() => {
    let count = 0;
    if (pendingDocuments.idDocument) count++;
    if (pendingDocuments.licenseDocument) count++;
    if (pendingDocuments.insuranceDocument) count++;
    return count;
  }, [pendingDocuments]);

  // Fonction de copie
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: "Copié",
        description: "Le contenu a été copié dans le presse-papiers.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier le contenu.",
        variant: "destructive",
      });
    }
  };

  // Fonction de rafraîchissement
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["practitioner", practitionerData?.user_id] });
      toast({
        title: "Actualisé",
        description: "Les données ont été rafraîchies.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les données.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (!practitionerData?.user_id) {
        throw new Error("Identifiant utilisateur introuvable");
      }

      const uploads: Partial<typeof documentState> = {};

      for (const key of Object.keys(pendingDocuments) as Array<keyof typeof pendingDocuments>) {
        const file = pendingDocuments[key];
        if (file) {
          const uploaded = await uploadUserDocument({
            file,
            folder: "practitioner-documents",
            userId: practitionerData.user_id,
          });
          uploads[key] = uploaded.path;
        }
      }

      const { error } = await supabase
        .from("practitioners")
        .update({
          bio: formData.bio,
          diplomas: formData.diplomas.split(",").map((d) => d.trim()),
          languages: formData.languages.split(",").map((l) => l.trim()),
          years_experience: formData.years_experience,
          intervention_radius: formData.intervention_radius,
          communes_served: formData.communes_served.split(",").map((c) => c.trim()),
          license_number: formData.license_number,
          id_document_url: uploads.idDocument ?? documentState.idDocument,
          license_document_url: uploads.licenseDocument ?? documentState.licenseDocument,
          insurance_document_url: uploads.insuranceDocument ?? documentState.insuranceDocument,
        })
        .eq("id", practitionerId);

      if (error) throw error;

      setDocumentState((prev) => ({
        idDocument: uploads.idDocument ?? prev.idDocument,
        licenseDocument: uploads.licenseDocument ?? prev.licenseDocument,
        insuranceDocument: uploads.insuranceDocument ?? prev.insuranceDocument,
      }));
      setPendingDocuments({ idDocument: null, licenseDocument: null, insuranceDocument: null });

      toast({
        title: "Profil mis à jour",
        description: "Vos informations professionnelles ont été sauvegardées.",
      });
      setIsEditing(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le profil.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelection = (key: keyof typeof pendingDocuments, file: File | null) => {
    if (!isEditing) {
      toast({
        title: "Mode édition requis",
        description: "Cliquez sur modifier pour mettre à jour vos documents.",
        variant: "destructive",
      });
      return;
    }

    if (file) {
      setPendingDocuments((prev) => ({ ...prev, [key]: file }));
      toast({
        title: "Document sélectionné",
        description: "Le téléchargement sera effectué lors de la sauvegarde.",
      });
    }
  };

  const handleViewDocument = async (path: string | null) => {
    if (!path) {
      toast({
        title: "Document indisponible",
        description: "Aucun document n'a été fourni pour cette section.",
        variant: "destructive",
      });
      return;
    }

    try {
      const url = await getSignedFileUrl(path);
      if (!url) {
        throw new Error("URL non générée");
      }
      
      // Ouvrir immédiatement et laisser le navigateur gérer l'erreur 404
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Document access error:", error);
      }
      
      toast({
        title: "Impossible d'ouvrir le document",
        description: "Une erreur est survenue lors de l'accès au document. Veuillez réessayer ou télécharger un nouveau document.",
        variant: "destructive",
      });
    }
  };

  // ✅ CORRECTION P0-3: Seul "approved" est un statut KYC valide en base de données
  const isKYCValidated = () => {
    const status = practitionerData?.kyc_status || "pending";
    return status === "approved";
  };

  const getKYCStatusBadge = () => {
    const status = practitionerData?.kyc_status || "pending";
    // Statuts KYC selon la base de données: pending, incomplete, rejected, approved
    const config = {
      pending: { icon: Clock, variant: "secondary" as const, label: "En attente" },
      approved: { icon: CheckCircle, variant: "default" as const, label: "Validé" },
      rejected: { icon: XCircle, variant: "destructive" as const, label: "Refusé" },
      incomplete: { icon: AlertCircle, variant: "outline" as const, label: "Incomplet" },
    };
    const { icon: Icon, variant, label } = config[status as keyof typeof config] || config.pending;
    
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  // Skeleton loading
  if (!practitionerData) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton complétion */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>

        {/* Skeleton KYC */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Skeleton profil */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Photo de profil */}
      <Card>
        <CardContent className="py-6 flex justify-center">
          <AvatarUpload
            userId={practitionerData?.user_id || ""}
            currentImageUrl={practitionerData?.image}
            userName={practitionerData?.name || ""}
            editable={!isKYCValidated()}
            onImageUploaded={async (path) => {
              const { error } = await supabase
                .from('practitioners')
                .update({ image: path })
                .eq('id', practitionerId);
              
              if (error) throw error;
              
              // Synchroniser aussi avec le profil utilisateur
              if (practitionerData?.user_id) {
                await supabase
                  .from('profiles')
                  .update({ avatar_url: path })
                  .eq('id', practitionerData.user_id);
              }
              
              queryClient.invalidateQueries({ queryKey: ["practitioner", practitionerData?.user_id] });
            }}
          />
        </CardContent>
      </Card>

      {/* En-tête global */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6" />
            Profil professionnel
            {profileCompletion.percentage === 100 && (
              <Badge className="bg-green-500">Complet</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Gérez vos informations et documents professionnels
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Barre de complétion */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Complétion du profil
            </span>
            <span className="text-sm text-muted-foreground">
              {profileCompletion.completed}/{profileCompletion.total} champs
            </span>
          </div>
          <Progress value={profileCompletion.percentage} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {profileCompletion.percentage < 100
              ? `Complétez votre profil pour améliorer votre visibilité (${profileCompletion.percentage}%)`
              : "Votre profil est complet !"}
          </p>
        </CardContent>
      </Card>

      {/* Statut KYC */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Statut d'agrément
                <Badge variant="outline">{documentsCount}/3 documents</Badge>
              </CardTitle>
              <CardDescription>Validation de vos documents professionnels</CardDescription>
            </div>
            {getKYCStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          {isKYCValidated() && (
            <div className="bg-primary/10 text-primary p-4 rounded-lg flex items-start gap-3 mb-4">
              <CheckCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Dossier validé</p>
                <p className="text-sm mt-1">
                  Votre dossier a été validé. Vous ne pouvez plus modifier vos documents, uniquement les consulter.
                </p>
              </div>
            </div>
          )}

          {!practitionerData?.can_accept_missions && !isKYCValidated() && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Acceptation de missions bloquée</p>
                <p className="text-sm mt-1">
                  Vous ne pouvez pas accepter de missions tant que votre profil n'est pas validé. Vous pouvez resoummettre votre dossier avec de nouveaux documents.
                </p>
              </div>
            </div>
          )}
          
          {practitionerData?.kyc_comment && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Commentaire de l'administrateur</p>
              <p className="text-sm text-muted-foreground">{practitionerData.kyc_comment}</p>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {pendingCount > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  {pendingCount} document{pendingCount > 1 ? 's' : ''} en attente de téléchargement
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label>Pièce d'identité</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Carte d'identité, passeport ou titre de séjour</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {documentState.idDocument && <CheckCircle className="h-4 w-4 text-green-500" />}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing || isKYCValidated()}
                  onChange={(e) => handleDocumentSelection("idDocument", e.target.files?.[0] || null)}
                />
                {documentState.idDocument && (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => handleViewDocument(documentState.idDocument)}
                    className="shrink-0"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Voir
                  </Button>
                )}
              </div>
              {pendingDocuments.idDocument && (
                <p className="text-xs text-blue-600 mt-1">
                  📎 Fichier sélectionné : {pendingDocuments.idDocument.name}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label>Document d'agrément</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Diplôme, attestation ou carte professionnelle</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {documentState.licenseDocument && <CheckCircle className="h-4 w-4 text-green-500" />}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing || isKYCValidated()}
                  onChange={(e) => handleDocumentSelection("licenseDocument", e.target.files?.[0] || null)}
                />
                {documentState.licenseDocument && (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => handleViewDocument(documentState.licenseDocument)}
                    className="shrink-0"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Voir
                  </Button>
                )}
              </div>
              {pendingDocuments.licenseDocument && (
                <p className="text-xs text-blue-600 mt-1">
                  📎 Fichier sélectionné : {pendingDocuments.licenseDocument.name}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label>Assurance RCP</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Attestation d'assurance responsabilité civile professionnelle</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {documentState.insuranceDocument && <CheckCircle className="h-4 w-4 text-green-500" />}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing || isKYCValidated()}
                  onChange={(e) => handleDocumentSelection("insuranceDocument", e.target.files?.[0] || null)}
                />
                {documentState.insuranceDocument && (
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={() => handleViewDocument(documentState.insuranceDocument)}
                    className="shrink-0"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Voir
                  </Button>
                )}
              </div>
              {pendingDocuments.insuranceDocument && (
                <p className="text-xs text-blue-600 mt-1">
                  📎 Fichier sélectionné : {pendingDocuments.insuranceDocument.name}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profil professionnel */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Profil professionnel</CardTitle>
              <CardDescription>Vos informations et compétences</CardDescription>
            </div>
            {!isKYCValidated() && (
              <>
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)}>Modifier</Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)} disabled={loading}>
                      Annuler
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        "Sauvegarder"
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="bio">Biographie</Label>
              <span className={`text-xs ${formData.bio.length > BIO_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                {formData.bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value.slice(0, BIO_MAX_LENGTH) })}
              disabled={!isEditing || isKYCValidated()}
              rows={4}
              placeholder="Présentez votre parcours et votre approche..."
              className={formData.bio.length > BIO_MAX_LENGTH * 0.9 ? 'border-orange-500' : ''}
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="diplomas">Diplômes (séparés par des virgules)</Label>
              <Input
                id="diplomas"
                value={formData.diplomas}
                onChange={(e) => setFormData({ ...formData, diplomas: e.target.value })}
                disabled={!isEditing || isKYCValidated()}
                placeholder="Master en Soins Infirmiers, ..."
              />
            </div>
            <div>
              <Label htmlFor="languages">Langues (séparées par des virgules)</Label>
              <Input
                id="languages"
                value={formData.languages}
                onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                disabled={!isEditing || isKYCValidated()}
                placeholder="Français, Anglais, ..."
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="experience">Années d'expérience</Label>
              <Input
                id="experience"
                type="number"
                value={formData.years_experience}
                onChange={(e) => setFormData({ ...formData, years_experience: parseInt(e.target.value) })}
                disabled={!isEditing || isKYCValidated()}
              />
            </div>
            <div>
              <Label htmlFor="license">Numéro d'agrément</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="license"
                  value={formData.license_number}
                  onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                  disabled={!isEditing || isKYCValidated()}
                  placeholder="N° d'agrément"
                />
                {formData.license_number && !isEditing && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopy(formData.license_number, 'license')}
                        >
                          {copiedField === 'license' ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copier le numéro</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="radius">Rayon d'intervention (km)</Label>
            <Input
              id="radius"
              type="number"
              value={formData.intervention_radius}
              onChange={(e) => setFormData({ ...formData, intervention_radius: parseInt(e.target.value) })}
              disabled={!isEditing || isKYCValidated()}
            />
          </div>

          <div>
            <Label htmlFor="communes">Communes desservies (séparées par des virgules)</Label>
            <Textarea
              id="communes"
              value={formData.communes_served}
              onChange={(e) => setFormData({ ...formData, communes_served: e.target.value })}
              disabled={!isEditing || isKYCValidated()}
              rows={2}
              placeholder="Paris 15e, Issy-les-Moulineaux, ..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
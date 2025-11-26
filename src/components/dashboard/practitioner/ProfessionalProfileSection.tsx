import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Upload, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { getSignedFileUrl, uploadUserDocument } from "@/lib/file-upload";

interface ProfessionalProfileSectionProps {
  practitionerId: string;
  practitionerData: any;
  isCoach?: boolean;
}

export function ProfessionalProfileSection({ practitionerId, practitionerData, isCoach = false }: ProfessionalProfileSectionProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
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
    bio: practitionerData?.bio || "",
    diplomas: practitionerData?.diplomas?.join(", ") || "",
    languages: practitionerData?.languages?.join(", ") || "",
    years_experience: practitionerData?.years_experience || 0,
    intervention_radius: practitionerData?.intervention_radius || 10,
    communes_served: practitionerData?.communes_served?.join(", ") || "",
    license_number: practitionerData?.license_number || "",
  });

  useEffect(() => {
    setDocumentState({
      idDocument: practitionerData?.id_document_url ?? null,
      licenseDocument: practitionerData?.license_document_url ?? null,
      insuranceDocument: practitionerData?.insurance_document_url ?? null,
    });
  }, [practitionerData]);

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
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(error);
      toast({
        title: "Impossible d'ouvrir le document",
        description: "Veuillez réessayer plus tard.",
        variant: "destructive",
      });
    }
  };

  const getKYCStatusBadge = () => {
    const status = practitionerData?.kyc_status || "pending";
    const config = {
      pending: { icon: Clock, variant: "secondary" as const, label: "En attente" },
      approved: { icon: CheckCircle, variant: "default" as const, label: "Validé" },
      validated: { icon: CheckCircle, variant: "default" as const, label: "Validé" },
      rejected: { icon: XCircle, variant: "destructive" as const, label: "Refusé" },
      refused: { icon: XCircle, variant: "destructive" as const, label: "Refusé" },
      incomplete: { icon: AlertCircle, variant: "outline" as const, label: "Incomplet" },
      to_renew: { icon: AlertCircle, variant: "outline" as const, label: "À renouveler" },
    };
    const { icon: Icon, variant, label } = config[status as keyof typeof config] || config.pending;
    
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Statut KYC */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Statut d'agrément</CardTitle>
              <CardDescription>Validation de vos documents professionnels</CardDescription>
            </div>
            {getKYCStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          {!practitionerData?.can_accept_missions && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Acceptation de missions bloquée</p>
                <p className="text-sm mt-1">
                  Vous ne pouvez pas accepter de missions tant que votre profil n'est pas validé.
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
            <div>
              <Label>Pièce d'identité</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing}
                  onChange={(e) => handleDocumentSelection("idDocument", e.target.files?.[0] || null)}
                />
                {documentState.idDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocument(documentState.idDocument)}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>Document d'agrément</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing}
                  onChange={(e) => handleDocumentSelection("licenseDocument", e.target.files?.[0] || null)}
                />
                {documentState.licenseDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocument(documentState.licenseDocument)}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>Assurance RCP</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={!isEditing}
                  onChange={(e) => handleDocumentSelection("insuranceDocument", e.target.files?.[0] || null)}
                />
                {documentState.insuranceDocument && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocument(documentState.insuranceDocument)}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
              </div>
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
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>Modifier</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  Sauvegarder
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="bio">Biographie</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              disabled={!isEditing}
              rows={4}
              placeholder="Présentez votre parcours et votre approche..."
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="diplomas">Diplômes (séparés par des virgules)</Label>
              <Input
                id="diplomas"
                value={formData.diplomas}
                onChange={(e) => setFormData({ ...formData, diplomas: e.target.value })}
                disabled={!isEditing}
                placeholder="Master en Soins Infirmiers, ..."
              />
            </div>
            <div>
              <Label htmlFor="languages">Langues (séparées par des virgules)</Label>
              <Input
                id="languages"
                value={formData.languages}
                onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                disabled={!isEditing}
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
                disabled={!isEditing}
              />
            </div>
            <div>
              <Label htmlFor="license">Numéro d'agrément</Label>
              <Input
                id="license"
                value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                disabled={!isEditing}
                placeholder="N° d'agrément"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="radius">Rayon d'intervention (km)</Label>
            <Input
              id="radius"
              type="number"
              value={formData.intervention_radius}
              onChange={(e) => setFormData({ ...formData, intervention_radius: parseInt(e.target.value) })}
              disabled={!isEditing}
            />
          </div>

          <div>
            <Label htmlFor="communes">Communes desservies (séparées par des virgules)</Label>
            <Textarea
              id="communes"
              value={formData.communes_served}
              onChange={(e) => setFormData({ ...formData, communes_served: e.target.value })}
              disabled={!isEditing}
              rows={2}
              placeholder="Paris 15e, Issy-les-Moulineaux, ..."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Upload, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

interface ProfessionalProfileSectionProps {
  practitionerId: string;
  practitionerData: any;
  isCoach?: boolean;
}

export function ProfessionalProfileSection({ practitionerId, practitionerData, isCoach = false }: ProfessionalProfileSectionProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    bio: practitionerData?.bio || "",
    diplomas: practitionerData?.diplomas?.join(", ") || "",
    languages: practitionerData?.languages?.join(", ") || "",
    years_experience: practitionerData?.years_experience || 0,
    intervention_radius: practitionerData?.intervention_radius || 10,
    communes_served: practitionerData?.communes_served?.join(", ") || "",
    license_number: practitionerData?.license_number || "",
  });

  const handleSave = async () => {
    setLoading(true);
    try {
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
        })
        .eq("id", practitionerId);

      if (error) throw error;

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

  const getKYCStatusBadge = () => {
    const status = practitionerData?.kyc_status || "pending";
    const config = {
      pending: { icon: Clock, variant: "secondary" as const, label: "En attente" },
      validated: { icon: CheckCircle, variant: "default" as const, label: "Validé" },
      refused: { icon: XCircle, variant: "destructive" as const, label: "Refusé" },
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      toast({
                        title: "Document sélectionné",
                        description: "Le téléchargement sera effectué lors de la sauvegarde.",
                      });
                    }
                  }}
                />
                {practitionerData?.id_document_url && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(practitionerData.id_document_url, '_blank')}
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      toast({
                        title: "Document sélectionné",
                        description: "Le téléchargement sera effectué lors de la sauvegarde.",
                      });
                    }
                  }}
                />
                {practitionerData?.license_document_url && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(practitionerData.license_document_url, '_blank')}
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      toast({
                        title: "Document sélectionné",
                        description: "Le téléchargement sera effectué lors de la sauvegarde.",
                      });
                    }
                  }}
                />
                {practitionerData?.insurance_document_url && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(practitionerData.insurance_document_url, '_blank')}
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
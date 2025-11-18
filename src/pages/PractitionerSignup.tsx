import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Stethoscope, Shield, Upload, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { CreatePractitionerResponse } from "@/types/edge-function-responses";
import { uploadUserDocument } from "@/lib/file-upload";

interface SignupFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  profession: string;
  specialty: string;
  registrationNumber: string;
  experience: string;
  currentWorkplace: string;
  profilePhoto: File | null;
  idDocument: File | null;
  diploma: File | null;
  licenseDocument: File | null;
  acceptTerms: boolean;
  sessionTypes: string[];
  interventionZone: string;
  interventionRadius: string;
  certifications: string;
}

export default function PractitionerSignup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SignupFormData>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    profession: "",
    specialty: "",
    registrationNumber: "",
    experience: "",
    currentWorkplace: "",
    profilePhoto: null,
    idDocument: null,
    diploma: null,
    licenseDocument: null,
    acceptTerms: false,
    // Coach sportif specific fields
    sessionTypes: [] as string[],
    interventionZone: "",
    interventionRadius: "",
    certifications: "",
  });
  const [documentUploads, setDocumentUploads] = useState({
    profilePhoto: null as File | null,
    idDocument: null as File | null,
    diploma: null as File | null,
    licenseDocument: null as File | null,
  });

  const professionToType = useMemo<Record<string, string>>(() => ({
    "Médecin généraliste": "medecin",
    "Infirmier(ère)": "infirmier",
    "Kinésithérapeute": "kinesitherapeute",
    "Nutritionniste": "nutritionniste",
    "Sage-femme": "sage_femme",
    "Psychologue": "psychologue",
    "Coach sportif": "coach_sportif",
    "Autre": "autre",
  }), []);

  const professions = [
    "Médecin généraliste",
    "Infirmier(ère)",
    "Kinésithérapeute",
    "Nutritionniste",
    "Sage-femme",
    "Psychologue",
    "Coach sportif",
    "Autre"
  ];

  const sessionTypes = ["individuelle", "duo", "groupe"];

  const isCoachSportif = formData.profession === "Coach sportif";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    if (!formData.acceptTerms) {
      toast({
        title: "Erreur", 
        description: "Vous devez accepter la charte d'engagement",
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // Validation des documents obligatoires
      if (!documentUploads.idDocument) {
        toast({
          title: "Document manquant",
          description: "La pièce d'identité est obligatoire",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // L'attestation d'inscription n'est pas obligatoire pour les coachs sportifs
      if (!isCoachSportif && !documentUploads.licenseDocument) {
        toast({
          title: "Document manquant",
          description: "Le document d'autorisation d'exercice est obligatoire",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Validation taille et type des fichiers
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

      for (const [key, file] of Object.entries(documentUploads)) {
        if (file) {
          if (file.size > MAX_FILE_SIZE) {
            toast({
              title: "Fichier trop volumineux",
              description: `${key}: Maximum 5MB autorisé`,
              variant: "destructive"
            });
            setIsSubmitting(false);
            return;
          }

          if (!ALLOWED_TYPES.includes(file.type)) {
            toast({
              title: "Type de fichier non supporté",
              description: `${key}: Seuls PDF, JPG et PNG sont autorisés`,
              variant: "destructive"
            });
            setIsSubmitting(false);
            return;
          }
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard/practitioner`,
          data: {
            full_name: `${formData.firstName} ${formData.lastName}`.trim(),
            role: "practitioner",
            phone: formData.phone,
          },
        },
      });

      if (error) {
        // Gestion erreurs spécifiques
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          toast({
            title: "Email déjà utilisé",
            description: "Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email.",
            variant: "destructive"
          });
        } else if (error.message.includes('password') || error.message.includes('Password')) {
          toast({
            title: "Mot de passe trop faible",
            description: "Le mot de passe doit contenir au moins 8 caractères.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Erreur d'inscription",
            description: error.message,
            variant: "destructive"
          });
        }
        setIsSubmitting(false);
        return;
      }

      if (!data.user) {
        toast({
          title: "Confirmez votre adresse email",
          description: "Un lien de confirmation vous a été envoyé. Veuillez confirmer avant de finaliser votre inscription.",
        });
        setIsSubmitting(false);
        return;
      }

      const userId = data.user.id;

      // Utiliser l'edge function transactionnelle pour créer le profil complet
      const practitionerType = professionToType[formData.profession as keyof typeof professionToType] ?? "autre";
      const yearsExperience = Number.parseInt(formData.experience, 10) || null;
      const interventionRadius = formData.interventionRadius ? Number.parseInt(formData.interventionRadius, 10) : null;

      // Préparer les données pour l'edge function
      const profileData = {
        id: userId,
        full_name: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone,
        gender: (formData.gender as "homme" | "femme" | "autre" | "non_specifie") || null,
        date_of_birth: formData.dateOfBirth || null,
      };

      const practitionerData = {
        user_id: userId,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone,
        address: formData.address,
        specialty: formData.specialty || formData.profession,
        practitioner_type: practitionerType,
        years_experience: yearsExperience,
        kyc_status: "pending",
        can_accept_missions: false,
        bio: `Profession: ${formData.profession}\nStructure: ${formData.currentWorkplace}`,
        license_number: formData.registrationNumber,
        session_types: formData.profession === "Coach sportif" ? formData.sessionTypes : null,
        intervention_zone: formData.profession === "Coach sportif" ? formData.interventionZone : null,
        intervention_radius: formData.profession === "Coach sportif" ? interventionRadius : null,
        certifications: formData.profession === "Coach sportif" && formData.certifications
          ? formData.certifications.split(",").map(cert => cert.trim()).filter(Boolean)
          : null,
      };

      // Convertir les fichiers en base64 pour l'edge function
      const documentsBase64: Record<string, string> = {};
      for (const [key, file] of Object.entries(documentUploads)) {
        if (file) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          documentsBase64[key] = base64;
        }
      }

      // Appeler l'edge function transactionnelle
      const { data: createResult, error: createError } = await invokeEdgeFunctionWithRetry<CreatePractitionerResponse>(
        'create-practitioner-account',
        {
          body: {
            userId,
            profileData,
            practitionerData,
            documents: documentsBase64,
          }
        }
      );

      if (createError || !createResult?.success) {
        throw new Error(createError?.message || createResult?.error || "Échec de création du compte");
      }

      // Send registration notification
      try {
        await supabase.functions.invoke('send-registration-notification', {
          body: {
            email: formData.email,
            phone: formData.phone,
            fullName: `${formData.firstName} ${formData.lastName}`,
            userType: 'practitioner'
          }
        });
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }

      toast({
        title: "Demande d'inscription soumise !",
        description: "Votre dossier est en cours de validation. Vous recevrez une notification dès que votre compte sera activé.",
      });

      // Rediriger vers le dashboard praticien (l'utilisateur reste connecté)
      navigate("/dashboard/practitioner");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      toast({
        title: "Impossible de finaliser l'inscription",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (field: string, file: File | null) => {
    setFormData(prev => ({ ...prev, [field]: file }));
    setDocumentUploads(prev => ({ ...prev, [field]: file }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
      <Header />
      
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto bg-secondary rounded-full flex items-center justify-center mb-4">
                <Stethoscope className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Inscription Praticien</CardTitle>
              <CardDescription>
                Rejoignez notre réseau de professionnels de santé certifiés
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Informations personnelles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Stethoscope className="h-5 w-5 mr-2 text-secondary" />
                    Informations personnelles
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Prénom *</Label>
                      <Input
                        id="firstName"
                        placeholder="Votre prénom"
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom de famille *</Label>
                      <Input
                        id="lastName"
                        placeholder="Votre nom"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date de naissance *</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexe *</Label>
                      <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionnez" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homme">Homme</SelectItem>
                          <SelectItem value="femme">Femme</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Adresse complète *</Label>
                    <Textarea
                      id="address"
                      placeholder="Votre adresse complète"
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Téléphone *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+221 77 xxx xx xx"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email professionnel *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Informations professionnelles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-secondary" />
                    Informations professionnelles
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profession">Profession *</Label>
                      <Select value={formData.profession} onValueChange={(value) => setFormData(prev => ({ ...prev, profession: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionnez votre profession" />
                        </SelectTrigger>
                        <SelectContent>
                          {professions.map((prof) => (
                            <SelectItem key={prof} value={prof}>{prof}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {!isCoachSportif && (
                      <div className="space-y-2">
                        <Label htmlFor="specialty">Spécialité</Label>
                        <Input
                          id="specialty"
                          placeholder="Ex: Cardiologie, Pédiatrie..."
                          value={formData.specialty}
                          onChange={(e) => setFormData(prev => ({ ...prev, specialty: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>

                  {!isCoachSportif && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="registrationNumber">N° d'inscription Ordre *</Label>
                          <Input
                            id="registrationNumber"
                            placeholder="Numéro d'inscription"
                            value={formData.registrationNumber}
                            onChange={(e) => setFormData(prev => ({ ...prev, registrationNumber: e.target.value }))}
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="experience">Années d'expérience *</Label>
                          <Input
                            id="experience"
                            type="number"
                            min="1"
                            placeholder="Ex: 5"
                            value={formData.experience}
                            onChange={(e) => setFormData(prev => ({ ...prev, experience: e.target.value }))}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="currentWorkplace">Structure d'exercice actuelle *</Label>
                        <Input
                          id="currentWorkplace"
                          placeholder="Ex: Hôpital Principal, Cabinet Médical..."
                          value={formData.currentWorkplace}
                          onChange={(e) => setFormData(prev => ({ ...prev, currentWorkplace: e.target.value }))}
                          required
                        />
                      </div>
                    </>
                  )}

                  {isCoachSportif && (
                    <div className="space-y-2">
                      <Label htmlFor="experience">Années d'expérience *</Label>
                      <Input
                        id="experience"
                        type="number"
                        min="1"
                        placeholder="Ex: 5"
                        value={formData.experience}
                        onChange={(e) => setFormData(prev => ({ ...prev, experience: e.target.value }))}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Coach Sportif Specific Fields */}
                {formData.profession === "Coach sportif" && (
                  <div className="space-y-4 mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="font-semibold text-primary">Informations spécifiques Coach Sportif</h4>
                    
                    <div className="space-y-2">
                      <Label>Types de séances proposées *</Label>
                      <div className="flex gap-4">
                        {sessionTypes.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`session-${type}`}
                              checked={formData.sessionTypes.includes(type)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    sessionTypes: [...prev.sessionTypes, type] 
                                  }));
                                } else {
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    sessionTypes: prev.sessionTypes.filter(t => t !== type) 
                                  }));
                                }
                              }}
                            />
                            <Label htmlFor={`session-${type}`} className="capitalize cursor-pointer">
                              {type}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="interventionZone">Zone d'intervention *</Label>
                        <Input
                          id="interventionZone"
                          placeholder="Ex: Dakar, Thiès..."
                          value={formData.interventionZone}
                          onChange={(e) => setFormData(prev => ({ ...prev, interventionZone: e.target.value }))}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="interventionRadius">Rayon d'intervention (km) *</Label>
                        <Input
                          id="interventionRadius"
                          type="number"
                          min="1"
                          max="50"
                          placeholder="Ex: 15"
                          value={formData.interventionRadius}
                          onChange={(e) => setFormData(prev => ({ ...prev, interventionRadius: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="certifications">Certifications / Diplômes en coaching sportif *</Label>
                      <Textarea
                        id="certifications"
                        placeholder="Listez vos certifications (fitness, kinésithérapie sportive, etc.)"
                        value={formData.certifications}
                        onChange={(e) => setFormData(prev => ({ ...prev, certifications: e.target.value }))}
                        required
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Upload className="h-5 w-5 mr-2 text-secondary" />
                    Documents requis
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="profilePhoto">Photo de profil *</Label>
                      <Input
                        id="profilePhoto"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload('profilePhoto', e.target.files?.[0] || null)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="idDocument">Pièce d'identité *</Label>
                      <Input
                        id="idDocument"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload('idDocument', e.target.files?.[0] || null)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="diploma">Diplôme/Certificat *</Label>
                      <Input
                        id="diploma"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload('diploma', e.target.files?.[0] || null)}
                        required
                      />
                    </div>

                    {!isCoachSportif && (
                      <div className="space-y-2">
                        <Label htmlFor="licenseDocument">Attestation d'inscription *</Label>
                        <Input
                          id="licenseDocument"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => handleFileUpload('licenseDocument', e.target.files?.[0] || null)}
                          required
                        />
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Tous les documents seront vérifiés par notre équipe. 
                      L'activation de votre compte peut prendre 24 à 48 heures.
                    </p>
                  </div>
                </div>

                {/* Sécurité */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-secondary" />
                    Sécurité
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Mot de passe *</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Min. 8 caractères"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Répétez le mot de passe"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, acceptTerms: checked as boolean }))}
                  />
                  <Label htmlFor="terms" className="text-sm">
                    J'accepte la{" "}
                    <a href="/terms-of-service#charte-praticiens" className="text-secondary hover:underline">
                      Charte d'engagement des praticiens DomiCares
                    </a>{" "}
                    et les{" "}
                    <a href="/terms-of-service" className="text-secondary hover:underline">
                      CGU
                    </a>
                  </Label>
                </div>

                <Button
                  type="submit"
                  variant="practitioner"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Soumission en cours..." : "Soumettre ma candidature"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
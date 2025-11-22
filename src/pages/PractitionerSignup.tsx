import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Stethoscope, Shield, Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { CreatePractitionerResponse } from "@/types/edge-function-responses";
import { uploadUserDocument } from "@/lib/file-upload";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToHome, navigateToEmailConfirmation, navigateToDashboard } from "@/lib/auth-navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const { data: user, isLoading } = useSupabaseUser();

  useEffect(() => {
    const redirectAuthenticatedUser = async () => {
      if (!isLoading && user) {
        const { getDashboardPathForUser } = await import("@/lib/dashboardNavigation");
        const dashboardPath = await getDashboardPathForUser(user.id);
        navigate(dashboardPath, { replace: true });
      }
    };
    redirectAuthenticatedUser();
  }, [user, isLoading, navigate]);
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
    sessionTypes: [] as string[],
    interventionZone: "",
    interventionRadius: "",
    certifications: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  // Validation en temps réel
  const validateField = (name: string, value: any): string => {
    switch (name) {
      case 'firstName':
      case 'lastName':
        return value.trim().length < 2 ? "Minimum 2 caractères requis" : "";
      case 'email':
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "Email invalide" : "";
      case 'phone':
        return !/^\+?[0-9]{8,15}$/.test(value.replace(/\s/g, '')) ? "Numéro invalide (8-15 chiffres)" : "";
      case 'password':
        return value.length < 8 ? "Minimum 8 caractères requis" : "";
      case 'dateOfBirth':
        if (!value) return "Date de naissance requise";
        const age = new Date().getFullYear() - new Date(value).getFullYear();
        return age < 18 || age > 100 ? "Âge invalide (18-100 ans)" : "";
      case 'interventionRadius':
        if (isCoachSportif && value) {
          const radius = parseInt(value);
          return isNaN(radius) || radius < 1 || radius > 100 ? "Rayon entre 1 et 100 km" : "";
        }
        return "";
      default:
        return "";
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleFileChange = (key: keyof typeof formData, file: File | null) => {
    setFormData(prev => ({ ...prev, [key]: file }));
    
    if (file) {
      // Validation fichier
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      
      if (file.size > MAX_FILE_SIZE) {
        setFieldErrors(prev => ({ ...prev, [key]: "Fichier trop volumineux (max 5MB)" }));
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFieldErrors(prev => ({ ...prev, [key]: "Format non supporté (PDF, JPG, PNG)" }));
        return;
      }
      setFieldErrors(prev => ({ ...prev, [key]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Champs obligatoires
    if (!formData.firstName.trim()) errors.firstName = "Prénom requis";
    if (!formData.lastName.trim()) errors.lastName = "Nom requis";
    if (!formData.dateOfBirth) errors.dateOfBirth = "Date de naissance requise";
    if (!formData.gender) errors.gender = "Genre requis";
    if (!formData.address.trim()) errors.address = "Adresse requise";
    if (!formData.phone.trim()) errors.phone = "Téléphone requis";
    if (!formData.email.trim()) errors.email = "Email requis";
    if (!formData.password) errors.password = "Mot de passe requis";
    if (!formData.profession) errors.profession = "Profession requise";
    if (!isCoachSportif && !formData.specialty.trim()) errors.specialty = "Spécialité requise";
    if (!formData.experience) errors.experience = "Expérience requise";
    
    // Documents obligatoires
    if (!formData.idDocument) errors.idDocument = "Pièce d'identité requise";
    if (!isCoachSportif && !formData.licenseDocument) {
      errors.licenseDocument = "Autorisation d'exercice requise";
    }
    
    // Validations spécifiques
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Les mots de passe ne correspondent pas";
    }
    
    // Coach sportif
    if (isCoachSportif) {
      if (formData.sessionTypes.length === 0) errors.sessionTypes = "Au moins un type de séance requis";
      if (!formData.interventionZone.trim()) {
        errors.interventionZone = "Zone d'intervention requise";
      } else if (formData.interventionZone.trim().length < 3) {
        errors.interventionZone = "Zone d'intervention trop courte (min 3 caractères)";
      }
      if (!formData.interventionRadius) {
        errors.interventionRadius = "Rayon d'intervention requis";
      } else {
        const radius = parseInt(formData.interventionRadius);
        if (isNaN(radius) || radius < 1 || radius > 100) {
          errors.interventionRadius = "Rayon entre 1 et 100 km";
        }
      }
    }
    
    if (!formData.acceptTerms) {
      errors.acceptTerms = "Vous devez accepter la charte d'engagement";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Erreur de validation",
        description: "Veuillez corriger les erreurs dans le formulaire",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {

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
            ...AUTH_MESSAGES.SIGNUP_ERROR,
            description: "Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email.",
            variant: "destructive"
          });
        } else if (error.message.includes('password') || error.message.includes('Password')) {
          toast({
            ...AUTH_MESSAGES.SIGNUP_ERROR,
            description: "Le mot de passe doit contenir au moins 8 caractères.",
            variant: "destructive"
          });
        } else {
          toast({
            ...AUTH_MESSAGES.SIGNUP_ERROR,
            description: error.message || AUTH_MESSAGES.SIGNUP_ERROR.defaultDescription,
            variant: "destructive"
          });
        }
        setIsSubmitting(false);
        return;
      }

      // Vérifier si l'email nécessite une confirmation
      if (data.user && !data.user.confirmed_at && !data.session) {
        toast(AUTH_MESSAGES.EMAIL_NEEDS_CONFIRMATION);
        navigateToEmailConfirmation(navigate, formData.email, 'practitioner');
        setIsSubmitting(false);
        return;
      }

      if (!data.user) {
        throw new Error("Échec de création du compte");
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
      const fileKeys: (keyof SignupFormData)[] = ['profilePhoto', 'idDocument', 'diploma', 'licenseDocument'];
      
      for (const key of fileKeys) {
        const file = formData[key] as File | null;
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
        const errorMessage = createError?.message || createResult?.error || "Échec de création du compte";
        console.error('❌ Erreur création compte praticien:', { createError, createResult });
        
        // Messages d'erreur plus explicites
        let userMessage = errorMessage;
        if (errorMessage.includes('Document invalide') || errorMessage.includes('document')) {
          userMessage = "Un ou plusieurs documents sont invalides. Vérifiez le format (PDF, JPG, PNG) et la taille (max 5MB).";
        } else if (errorMessage.includes('validation') || errorMessage.includes('invalide')) {
          userMessage = "Certaines informations du formulaire sont invalides. Veuillez vérifier vos données.";
        } else if (errorMessage.includes('upload') || errorMessage.includes('Wasabi')) {
          userMessage = "Erreur lors de l'upload des documents. Veuillez réessayer.";
        }
        
        throw new Error(userMessage);
      }
      
      console.log('✅ Compte praticien créé avec succès');

      // Finaliser l'inscription et envoyer notification via edge function centralisée
      try {
        const { data: completeResult, error: completeError } = await supabase.functions.invoke('complete-user-registration', {
          body: {
            userId: userId,
            data: {
              userType: 'practitioner',
              email: formData.email,
              phone: formData.phone,
              fullName: `${formData.firstName} ${formData.lastName}`
            }
          }
        });
        
        if (completeError) {
          console.error('⚠️ Erreur notification (non bloquante):', completeError);
        } else {
          console.log('✅ Notification envoyée avec succès');
        }
      } catch (notifError) {
        console.error('⚠️ Erreur notification (non bloquante):', notifError);
      }

      // Rediriger vers la page de confirmation avec le type de praticien
      navigate(`/registration-success?type=practitioner&practitionerType=${practitionerType}`, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      toast({
        ...AUTH_MESSAGES.SIGNUP_ERROR,
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
      <Header />
      
      <main className="pt-20 sm:pt-24 pb-8 sm:pb-12">
        <div className="container mx-auto px-3 sm:px-4 max-w-2xl">
          <div className="mb-4 sm:mb-6">
            <Button
              variant="ghost"
              onClick={() => navigateToHome(navigate)}
              className="mb-3 sm:mb-4 min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center px-4 sm:px-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto bg-secondary rounded-full flex items-center justify-center mb-3 sm:mb-4">
                <Stethoscope className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold">Inscription Praticien</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Rejoignez notre réseau de professionnels de santé certifiés
              </CardDescription>
            </CardHeader>

            <CardContent className="px-4 sm:px-6">
              <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
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
                      <PhoneInput
                        id="phone"
                        value={formData.phone}
                        onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
                        countryCode="+229"
                        localNumberLength={8}
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
                      <Label htmlFor="profession" className="text-sm sm:text-base">
                        Profession <span className="text-destructive">*</span>
                      </Label>
                      <Select 
                        value={formData.profession} 
                        onValueChange={(value) => handleInputChange('profession', value)}
                      >
                        <SelectTrigger className={`h-11 sm:h-12 ${fieldErrors.profession ? 'border-destructive' : ''}`}>
                          <SelectValue placeholder="Sélectionnez votre profession" />
                        </SelectTrigger>
                        <SelectContent>
                          {professions.map((prof) => (
                            <SelectItem key={prof} value={prof}>{prof}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.profession && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.profession}</p>
                      )}
                    </div>

                    {!isCoachSportif && (
                      <div className="space-y-2">
                        <Label htmlFor="specialty" className="text-sm sm:text-base">
                          Spécialité <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="specialty"
                          placeholder="Ex: Cardiologie, Pédiatrie..."
                          value={formData.specialty}
                          onChange={(e) => handleInputChange('specialty', e.target.value)}
                          required
                          className={`h-11 sm:h-12 ${fieldErrors.specialty ? 'border-destructive' : ''}`}
                        />
                        {fieldErrors.specialty && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.specialty}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {!isCoachSportif && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="registrationNumber" className="text-sm sm:text-base">
                            N° d'inscription Ordre
                          </Label>
                          <Input
                            id="registrationNumber"
                            placeholder="Numéro d'inscription"
                            value={formData.registrationNumber}
                            onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                            className="h-11 sm:h-12"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="experience" className="text-sm sm:text-base">
                            Années d'expérience <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="experience"
                            type="number"
                            min="0"
                            max="70"
                            placeholder="Ex: 5"
                            value={formData.experience}
                            onChange={(e) => handleInputChange('experience', e.target.value)}
                            required
                            className={`h-11 sm:h-12 ${fieldErrors.experience ? 'border-destructive' : ''}`}
                          />
                          {fieldErrors.experience && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors.experience}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="currentWorkplace" className="text-sm sm:text-base">
                          Structure d'exercice actuelle
                        </Label>
                        <Input
                          id="currentWorkplace"
                          placeholder="Ex: Hôpital Principal, Cabinet Médical..."
                          value={formData.currentWorkplace}
                          onChange={(e) => handleInputChange('currentWorkplace', e.target.value)}
                          className="h-11 sm:h-12"
                        />
                      </div>
                    </>
                  )}

                  {isCoachSportif && (
                    <div className="space-y-2">
                    <Label htmlFor="experience" className="text-sm sm:text-base">
                      Années d'expérience <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="experience"
                      type="number"
                      min="0"
                      max="70"
                      placeholder="Ex: 5"
                      value={formData.experience}
                      onChange={(e) => handleInputChange('experience', e.target.value)}
                      required
                      className={`h-11 sm:h-12 ${fieldErrors.experience ? 'border-destructive' : ''}`}
                    />
                    {fieldErrors.experience && (
                      <p className="text-xs text-destructive mt-1">{fieldErrors.experience}</p>
                    )}
                    </div>
                  )}
                </div>

                {/* Coach Sportif Specific Fields */}
                {formData.profession === "Coach sportif" && (
                  <div className="space-y-4 mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="font-semibold text-primary">Informations spécifiques Coach Sportif</h4>
                    
                    <div className="space-y-2">
                      <Label className="text-sm sm:text-base">
                        Types de séances proposées <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex flex-wrap gap-4">
                        {sessionTypes.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`session-${type}`}
                              checked={formData.sessionTypes.includes(type)}
                              onCheckedChange={(checked) => {
                                const newSessionTypes = checked
                                  ? [...formData.sessionTypes, type]
                                  : formData.sessionTypes.filter(t => t !== type);
                                handleInputChange('sessionTypes', newSessionTypes);
                              }}
                            />
                            <Label htmlFor={`session-${type}`} className="capitalize cursor-pointer text-sm sm:text-base">
                              {type}
                            </Label>
                          </div>
                        ))}
                      </div>
                      {fieldErrors.sessionTypes && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.sessionTypes}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="interventionZone" className="text-sm sm:text-base">
                          Zone d'intervention <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="interventionZone"
                          placeholder="Ex: Dakar, Thiès..."
                          value={formData.interventionZone}
                          onChange={(e) => handleInputChange('interventionZone', e.target.value)}
                          required
                          className={`h-11 sm:h-12 ${fieldErrors.interventionZone ? 'border-destructive' : ''}`}
                        />
                        {fieldErrors.interventionZone && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.interventionZone}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="interventionRadius" className="text-sm sm:text-base">
                          Rayon d'intervention (km) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="interventionRadius"
                          type="number"
                          min="1"
                          max="100"
                          placeholder="Ex: 15"
                          value={formData.interventionRadius}
                          onChange={(e) => handleInputChange('interventionRadius', e.target.value)}
                          required
                          className={`h-11 sm:h-12 ${fieldErrors.interventionRadius ? 'border-destructive' : ''}`}
                        />
                        {fieldErrors.interventionRadius && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.interventionRadius}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="certifications" className="text-sm sm:text-base">
                        Certifications / Diplômes
                      </Label>
                      <Textarea
                        id="certifications"
                        placeholder="Listez vos certifications (fitness, kinésithérapie sportive, etc.)"
                        value={formData.certifications}
                        onChange={(e) => handleInputChange('certifications', e.target.value)}
                        rows={3}
                        className="min-h-[80px]"
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
                      <Label htmlFor="profilePhoto" className="text-sm sm:text-base">
                        Photo de profil
                      </Label>
                      <Input
                        id="profilePhoto"
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange('profilePhoto', e.target.files?.[0] || null)}
                        className={`h-11 ${fieldErrors.profilePhoto ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.profilePhoto && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.profilePhoto}</p>
                      )}
                      {formData.profilePhoto && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {formData.profilePhoto.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="idDocument" className="text-sm sm:text-base">
                        Pièce d'identité <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="idDocument"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileChange('idDocument', e.target.files?.[0] || null)}
                        required
                        className={`h-11 ${fieldErrors.idDocument ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.idDocument && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.idDocument}</p>
                      )}
                      {formData.idDocument && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {formData.idDocument.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="diploma" className="text-sm sm:text-base">
                        Diplôme/Certificat
                      </Label>
                      <Input
                        id="diploma"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileChange('diploma', e.target.files?.[0] || null)}
                        className={`h-11 ${fieldErrors.diploma ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.diploma && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.diploma}</p>
                      )}
                      {formData.diploma && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {formData.diploma.name}
                        </p>
                      )}
                    </div>

                    {!isCoachSportif && (
                      <div className="space-y-2">
                        <Label htmlFor="licenseDocument" className="text-sm sm:text-base">
                          Autorisation d'exercice <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="licenseDocument"
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => handleFileChange('licenseDocument', e.target.files?.[0] || null)}
                          required
                          className={`h-11 ${fieldErrors.licenseDocument ? 'border-destructive' : ''}`}
                        />
                        {fieldErrors.licenseDocument && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.licenseDocument}</p>
                        )}
                        {formData.licenseDocument && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                            {formData.licenseDocument.name}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Tous les documents seront vérifiés par notre équipe. 
                      L'activation de votre compte peut prendre 24 à 48 heures.
                    </p>
                    {isCoachSportif && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <strong>Coach sportif :</strong> L'autorisation d'exercice n'est pas obligatoire. 
                        Vos certifications seront vérifiées à partir des informations fournies.
                      </p>
                    )}
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
                      <Label htmlFor="password" className="text-sm sm:text-base">
                        Mot de passe <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Min. 8 caractères"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        required
                        className={`h-11 sm:h-12 ${fieldErrors.password ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.password && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-sm sm:text-base">
                        Confirmer le mot de passe <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Répétez le mot de passe"
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                        required
                        className={`h-11 sm:h-12 ${fieldErrors.confirmPassword ? 'border-destructive' : ''}`}
                      />
                      {fieldErrors.confirmPassword && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conditions */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="terms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => handleInputChange('acceptTerms', checked as boolean)}
                      className={fieldErrors.acceptTerms ? 'border-destructive' : ''}
                    />
                    <Label htmlFor="terms" className="text-sm sm:text-base font-normal leading-relaxed cursor-pointer">
                      J'accepte la{" "}
                      <a href="/terms-of-service#charte-praticiens" className="text-primary hover:underline">
                        Charte d'engagement des praticiens DomiCares
                      </a>{" "}
                      et les{" "}
                      <a href="/terms-of-service" className="text-primary hover:underline">
                        CGU
                      </a>
                    </Label>
                  </div>
                  {fieldErrors.acceptTerms && (
                    <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-12 sm:h-14 text-base"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Soumission en cours...
                    </>
                  ) : (
                    "Soumettre ma candidature"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
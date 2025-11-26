import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, User, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { completePatientOnboarding, type PatientOnboardingPayload } from "@/lib/patient-onboarding";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToHome, navigateToEmailConfirmation, navigateToDashboard } from "@/lib/auth-navigation";
import { AddressSearchInput } from "@/components/AddressSearchInput";
import { withTimeout, NetworkTimeoutError } from "@/lib/network-timeout";
import { z } from "zod";

// Schéma de validation Zod
const patientSignupSchema = z.object({
  firstName: z.string()
    .trim()
    .min(2, "Le prénom doit contenir au moins 2 caractères")
    .max(50, "Le prénom ne peut pas dépasser 50 caractères"),
  lastName: z.string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(50, "Le nom ne peut pas dépasser 50 caractères"),
  dateOfBirth: z.string()
    .refine((date) => {
      const birthDate = new Date(date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      return age >= 0 && age <= 120 && birthDate <= today;
    }, "Date de naissance invalide"),
  gender: z.string()
    .min(1, "Veuillez sélectionner votre sexe"),
  address: z.string()
    .trim()
    .min(10, "L'adresse doit contenir au moins 10 caractères"),
  phone: z.string()
    .regex(/^\+229\d{8}$/, "Le numéro doit être au format +229XXXXXXXX"),
  email: z.string()
    .email("Adresse email invalide")
    .max(255, "L'email ne peut pas dépasser 255 caractères"),
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(72, "Le mot de passe ne peut pas dépasser 72 caractères"),
  confirmPassword: z.string(),
  emergencyContactName: z.string()
    .trim()
    .min(2, "Le nom du contact doit contenir au moins 2 caractères"),
  emergencyContactPhone: z.string()
    .regex(/^\+229\d{8}$/, "Le numéro doit être au format +229XXXXXXXX"),
  medicalHistory: z.array(z.string()),
  acceptTerms: z.boolean()
    .refine((val) => val === true, "Vous devez accepter les conditions d'utilisation")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});

export default function PatientSignup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: user, isLoading } = useSupabaseUser();
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard/patient", { replace: true });
    }
  }, [user, isLoading, navigate]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    medicalHistory: [],
    emergencyContactName: "",
    emergencyContactPhone: "",
    acceptTerms: false,
  });

  const medicalConditions = [
    "Hypertension",
    "Diabète",
    "Asthme",
    "Allergies médicamenteuses", 
    "Problèmes cardiaques",
    "Arthrite",
    "Autre"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setValidationErrors({});

    // Validation Zod
    try {
      patientSignupSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setValidationErrors(errors);
        
        // Afficher la première erreur
        const firstError = error.issues[0];
        toast({
          title: "Erreur de validation",
          description: firstError.message,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
    }

    const acceptedAt = new Date().toISOString();

    const onboardingPayload: PatientOnboardingPayload = {
      profile: {
        fullName: `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone,
        gender: formData.gender,
        dateOfBirth: formData.dateOfBirth,
      },
      address: formData.address
        ? {
            label: "Domicile",
            address: formData.address,
          }
        : null,
      emergencyContact:
        formData.emergencyContactName && formData.emergencyContactPhone
          ? {
              name: formData.emergencyContactName,
              phone: formData.emergencyContactPhone,
              relationship: "Contact d'urgence",
            }
          : null,
      medicalHistory: formData.medicalHistory,
      acceptTermsAt: acceptedAt,
    };

    // Inscription avec Supabase
    try {
      // ✅ Vérifier l'unicité du téléphone AVANT inscription
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', formData.phone)
        .maybeSingle();

      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        // PGRST116 = not found (ce qui est bon)
        throw profileCheckError;
      }

      if (existingProfile) {
        toast({
          title: "Erreur",
          description: "Ce numéro de téléphone est déjà utilisé",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      // 1. Créer le compte utilisateur Supabase (auto-confirmé)
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard/patient`,
          data: {
            full_name: `${formData.firstName} ${formData.lastName}`,
            user_type: 'patient',
            // ✅ Sauvegarder les données en backup au cas où edge function échoue
            pending_onboarding: onboardingPayload
          }
        }
      })
      );

      if (authError) {
        toast({
          ...AUTH_MESSAGES.SIGNUP_ERROR,
          description: authError.message || AUTH_MESSAGES.SIGNUP_ERROR.defaultDescription,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      if (!authData.user) {
        toast({
          ...AUTH_MESSAGES.SIGNUP_ERROR,
          description: "Échec de création du compte",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Vérifier si l'email nécessite une confirmation
      if (authData.user && !authData.user.confirmed_at && !authData.session) {
        // Email non confirmé : rediriger vers page de confirmation
        toast(AUTH_MESSAGES.EMAIL_NEEDS_CONFIRMATION);
        navigateToEmailConfirmation(navigate, formData.email, 'patient');
        setIsSubmitting(false);
        return;
      }

      // Si l'utilisateur est auto-confirmé et a une session, on continue
      const userId = authData.user.id;

      // 2. Finaliser l'inscription via edge function centralisée
      const { error: registrationError } = await withTimeout(
        supabase.functions.invoke('complete-user-registration',
        {
          body: {
            userId,
            data: {
              userType: 'patient',
              ...onboardingPayload
            }
          }
        })
      );

      if (registrationError) {
        console.error('Erreur lors de la finalisation:', registrationError);
        
        // ⚠️ Compte créé mais données non finalisées
        // Les données sont dans user_metadata.pending_onboarding et pourront être récupérées plus tard
        
        toast({
          ...AUTH_MESSAGES.SIGNUP_ERROR,
          description: "Compte créé mais finalisation incomplète. Reconnectez-vous pour terminer.",
          variant: "destructive"
        });
        
        // On déconnecte pour forcer l'utilisateur à se reconnecter et récupérer les données
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error('Erreur lors de la déconnexion:', signOutError);
        }
        
        setIsSubmitting(false);
        return;
      }

      // ✅ Finalisation réussie : nettoyer le pending_onboarding
      await supabase.auth.updateUser({
        data: {
          pending_onboarding: null,
          patient_onboarding_completed: true
        }
      });

      // ✅ Inscription réussie : reste connecté et redirige vers succès
      toast({
        title: "Inscription réussie !",
        description: "Bienvenue sur Domicares",
      });
      
      // Rediriger vers la page de confirmation
      navigate('/registration-success?type=patient', { replace: true });
    } catch (error: any) {
      console.error('Erreur inscription:', error);
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        ...AUTH_MESSAGES.SIGNUP_ERROR,
        description: isTimeoutError 
          ? error.message 
          : (error.message || AUTH_MESSAGES.SIGNUP_ERROR.defaultDescription),
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMedicalHistoryChange = (condition: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      medicalHistory: checked 
        ? [...prev.medicalHistory, condition]
        : prev.medicalHistory.filter(c => c !== condition)
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
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
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-3 sm:mb-4">
                <User className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold">Inscription Patient</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Créez votre compte pour accéder aux soins de santé à domicile
              </CardDescription>
            </CardHeader>

            <CardContent className="px-4 sm:px-6">
              <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
                {/* Informations personnelles */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <User className="h-5 w-5 mr-2 text-primary" />
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
                        className={validationErrors.firstName ? "border-destructive" : ""}
                      />
                      {validationErrors.firstName && (
                        <p className="text-sm text-destructive">{validationErrors.firstName}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom de famille *</Label>
                      <Input
                        id="lastName"
                        placeholder="Votre nom"
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        required
                        className={validationErrors.lastName ? "border-destructive" : ""}
                      />
                      {validationErrors.lastName && (
                        <p className="text-sm text-destructive">{validationErrors.lastName}</p>
                      )}
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
                        className={validationErrors.dateOfBirth ? "border-destructive" : ""}
                      />
                      {validationErrors.dateOfBirth && (
                        <p className="text-sm text-destructive">{validationErrors.dateOfBirth}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexe *</Label>
                      <Select 
                        value={formData.gender} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
                        required
                      >
                        <SelectTrigger className={validationErrors.gender ? "border-destructive" : ""}>
                          <SelectValue placeholder="Sélectionnez" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homme">Homme</SelectItem>
                          <SelectItem value="femme">Femme</SelectItem>
                        </SelectContent>
                      </Select>
                      {validationErrors.gender && (
                        <p className="text-sm text-destructive">{validationErrors.gender}</p>
                      )}
                    </div>
                  </div>

                  <AddressSearchInput
                    label="Adresse complète *"
                    value={formData.address}
                    onChange={(location) => setFormData(prev => ({ ...prev, address: location.address }))}
                    placeholder="Rechercher votre adresse au Bénin..."
                    required
                    className={validationErrors.address ? "border-destructive" : ""}
                  />
                  {validationErrors.address && (
                    <p className="text-sm text-destructive">{validationErrors.address}</p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Téléphone *</Label>
                      <PhoneInput
                        id="phone"
                        value={formData.phone}
                        onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
                        countryCode="+229"
                        localNumberLength={8}
                        className={validationErrors.phone ? "border-destructive" : ""}
                      />
                      {validationErrors.phone && (
                        <p className="text-sm text-destructive">{validationErrors.phone}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                        className={validationErrors.email ? "border-destructive" : ""}
                      />
                      {validationErrors.email && (
                        <p className="text-sm text-destructive">{validationErrors.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sécurité */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-primary" />
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
                        className={validationErrors.password ? "border-destructive" : ""}
                      />
                      {validationErrors.password && (
                        <p className="text-sm text-destructive">{validationErrors.password}</p>
                      )}
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
                        className={validationErrors.confirmPassword ? "border-destructive" : ""}
                      />
                      {validationErrors.confirmPassword && (
                        <p className="text-sm text-destructive">{validationErrors.confirmPassword}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Antécédents médicaux */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Antécédents médicaux</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {medicalConditions.map((condition) => (
                      <div key={condition} className="flex items-center space-x-2">
                        <Checkbox
                          id={condition}
                          checked={formData.medicalHistory.includes(condition)}
                          onCheckedChange={(checked) => handleMedicalHistoryChange(condition, checked as boolean)}
                        />
                        <Label htmlFor={condition} className="text-sm font-normal">
                          {condition}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact d'urgence */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Contact d'urgence</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName">Nom du contact *</Label>
                      <Input
                        id="emergencyContactName"
                        placeholder="Nom du contact d'urgence"
                        value={formData.emergencyContactName}
                        onChange={(e) => setFormData(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                        required
                        className={validationErrors.emergencyContactName ? "border-destructive" : ""}
                      />
                      {validationErrors.emergencyContactName && (
                        <p className="text-sm text-destructive">{validationErrors.emergencyContactName}</p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone">Téléphone du contact *</Label>
                      <PhoneInput
                        id="emergencyContactPhone"
                        value={formData.emergencyContactPhone}
                        onChange={(value) => setFormData(prev => ({ ...prev, emergencyContactPhone: value }))}
                        countryCode="+229"
                        localNumberLength={8}
                        className={validationErrors.emergencyContactPhone ? "border-destructive" : ""}
                      />
                      {validationErrors.emergencyContactPhone && (
                        <p className="text-sm text-destructive">{validationErrors.emergencyContactPhone}</p>
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
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, acceptTerms: checked as boolean }))}
                    />
                    <Label htmlFor="terms" className="text-sm">
                      J'accepte les{" "}
                      <a href="/terms-of-service" className="text-primary hover:underline">
                        Conditions Générales d'Utilisation
                      </a>{" "}
                      et la{" "}
                      <a href="/privacy-policy" className="text-primary hover:underline">
                        Politique de Confidentialité
                      </a>
                    </Label>
                  </div>
                  {validationErrors.acceptTerms && (
                    <p className="text-sm text-destructive">{validationErrors.acceptTerms}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="patient"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Inscription en cours..." : "Créer mon compte patient"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
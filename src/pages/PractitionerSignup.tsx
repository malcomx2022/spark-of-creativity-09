import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Stethoscope, Shield, Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { FileUploadInput } from "@/components/FileUploadInput";
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
import { AddressSearchInput } from "@/components/AddressSearchInput";
import { withTimeout, NetworkTimeoutError } from "@/lib/network-timeout";
import { TermsDialog, useTermsDialogs } from "@/components/TermsDialog";

interface SignupFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
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
  communesServed: string;
}

export default function PractitionerSignup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<'idle' | 'auth' | 'profile' | 'documents' | 'finalizing'>('idle');
  const { data: user, isLoading } = useSupabaseUser();
  const termsDialogs = useTermsDialogs();

  const [formData, setFormData] = useState<SignupFormData>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    latitude: null,
    longitude: null,
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
    communesServed: "",
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [phoneCheckTimeout, setPhoneCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const redirectAuthenticatedUser = async () => {
      if (!isLoading && user) {
        // Utilisateur déjà connecté - rediriger vers son dashboard
        const { getDashboardPathForUser } = await import("@/lib/dashboardNavigation");
        const dashboardPath = await getDashboardPathForUser(user.id);
        navigate(dashboardPath, { replace: true });
      }
    };
    redirectAuthenticatedUser();
  }, [user, isLoading, navigate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (phoneCheckTimeout) {
        clearTimeout(phoneCheckTimeout);
      }
    };
  }, [phoneCheckTimeout]);

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
  const validateField = (name: string, value: unknown): string => {
    switch (name) {
      case 'firstName':
      case 'lastName':
        if (typeof value !== 'string' || !value.trim()) return name === 'firstName' ? "Prénom requis" : "Nom requis";
        if (value.trim().length < 2) return "Minimum 2 caractères requis";
        return !/^[a-zA-ZÀ-ÿ\s'-]+$/.test(value.trim()) ? "Caractères invalides" : "";
      case 'address':
        if (typeof value !== 'string' || !value.trim()) return "Adresse requise";
        if (value.trim().length < 5) return "Adresse trop courte (min. 5 caractères)";
        return value.trim().length > 200 ? "Adresse trop longue (max 200 caractères)" : "";
      case 'email':
        return typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "Email invalide" : "";
      case 'phone':
        return typeof value === 'string' && !/^\+?[0-9]{8,15}$/.test(value.replace(/\s/g, '')) ? "Numéro invalide (8-15 chiffres)" : "";
      case 'password':
        return typeof value === 'string' && value.length < 8 ? "Minimum 8 caractères requis" : "";
      case 'confirmPassword':
        return typeof value === 'string' && value !== formData.password ? "Les mots de passe ne correspondent pas" : "";
      case 'gender':
        return !value ? "Genre requis" : "";
      case 'dateOfBirth': {
        if (typeof value !== 'string' || !value) return "Date de naissance requise";
        const age = new Date().getFullYear() - new Date(value).getFullYear();
        return age < 18 || age > 100 ? "Âge invalide (18-100 ans)" : "";
      }
      case 'profession':
        return !value ? "Profession requise" : "";
      case 'specialty': {
        const specialtyValue = (value || '').toString().trim();
        if (!specialtyValue) return isCoachSportif ? "Spécialité sportive requise" : "Spécialité requise";
        if (specialtyValue.length < 2) return "La spécialité doit contenir au moins 2 caractères";
        return specialtyValue.length > 100 ? "La spécialité ne peut pas dépasser 100 caractères" : "";
      }
      case 'experience': {
        if (!value) return "Expérience requise";
        const valueStr = typeof value === 'string' ? value : String(value);
        const exp = parseInt(valueStr, 10);
        return isNaN(exp) || exp < 0 || exp > 70 ? "L'expérience doit être entre 0 et 70 ans" : "";
      }
      case 'interventionZone': {
        if (!isCoachSportif) return "";
        const zoneValue = typeof value === 'string' ? value : String(value || '');
        const zone = zoneValue.trim();
        if (!zone) return "Zone d'intervention requise";
        if (zone.length < 3) return "Zone d'intervention trop courte (min 3 caractères)";
        return zone.length > 200 ? "Zone d'intervention ne peut pas dépasser 200 caractères" : "";
      }
      case 'interventionRadius':
        if (isCoachSportif && value) {
          const valueStr = typeof value === 'string' ? value : String(value);
          const radius = parseInt(valueStr);
          return isNaN(radius) || radius < 1 || radius > 100 ? "Rayon entre 1 et 100 km" : "";
        } else if (isCoachSportif && !value) {
          return "Rayon d'intervention requis";
        }
        return "";
      case 'sessionTypes':
        return isCoachSportif && (!value || (Array.isArray(value) && value.length === 0))
          ? "Au moins un type de séance requis"
          : "";
      case 'communesServed': {
        if (!isCoachSportif) return "";
        const communesValue = typeof value === 'string' ? value : String(value || '');
        const communes = communesValue.trim();
        if (!communes) return "Communes desservies requises";
        if (communes.length < 3) return "Minimum 3 caractères requis";
        return communes.length > 500 ? "Maximum 500 caractères" : "";
      }
      case 'acceptTerms':
        return value !== true ? "Vous devez accepter la charte d'engagement" : "";
      default:
        return "";
    }
  };

  // Vérification en temps réel du numéro de téléphone
  const checkPhoneAvailability = async (phone: string) => {
    if (!phone || phone.length < 8) {
      return;
    }

    setIsCheckingPhone(true);
    
    try {
      // Vérifier dans profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('phone', phone)
        .maybeSingle();

      if (profileData) {
        setFieldErrors(prev => ({
          ...prev,
          phone: "Ce numéro est déjà utilisé par un autre utilisateur"
        }));
        setIsCheckingPhone(false);
        return;
      }

      // Vérifier dans practitioners
      const { data: practitionerData } = await supabase
        .from('practitioners')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (practitionerData) {
        setFieldErrors(prev => ({
          ...prev,
          phone: "Ce numéro est déjà utilisé par un autre praticien"
        }));
      } else {
        // Numéro disponible - enlever l'erreur si elle existe
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          if (newErrors.phone === "Ce numéro est déjà utilisé par un autre utilisateur" ||
              newErrors.phone === "Ce numéro est déjà utilisé par un autre praticien") {
            delete newErrors.phone;
          }
          return newErrors;
        });
      }
    } catch (error) {
      console.warn('Erreur vérification téléphone en temps réel:', error);
    } finally {
      setIsCheckingPhone(false);
    }
  };

  const handleInputChange = (name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));

    // Vérification en temps réel pour le téléphone avec debounce
    if (name === 'phone' && typeof value === 'string') {
      // Annuler le timeout précédent
      if (phoneCheckTimeout) {
        clearTimeout(phoneCheckTimeout);
      }

      // Si le numéro a une longueur valide, vérifier après 1 seconde
      if (value.length >= 8 && !error) {
        const timeout = setTimeout(() => {
          checkPhoneAvailability(value);
        }, 1000);
        setPhoneCheckTimeout(timeout);
      }
    }
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
    
    // ✅ Validation stricte avec limites de longueur
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const address = formData.address.trim();
    const phone = formData.phone.trim();
    const email = formData.email.trim().toLowerCase();
    
    // Prénom
    if (!firstName) {
      errors.firstName = "Prénom requis";
    } else if (firstName.length < 2) {
      errors.firstName = "Le prénom doit contenir au moins 2 caractères";
    } else if (firstName.length > 50) {
      errors.firstName = "Le prénom ne peut pas dépasser 50 caractères";
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(firstName)) {
      errors.firstName = "Le prénom contient des caractères invalides";
    }
    
    // Nom
    if (!lastName) {
      errors.lastName = "Nom requis";
    } else if (lastName.length < 2) {
      errors.lastName = "Le nom doit contenir au moins 2 caractères";
    } else if (lastName.length > 50) {
      errors.lastName = "Le nom ne peut pas dépasser 50 caractères";
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(lastName)) {
      errors.lastName = "Le nom contient des caractères invalides";
    }
    
    // Date de naissance
    if (!formData.dateOfBirth) {
      errors.dateOfBirth = "Date de naissance requise";
    } else {
      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18 || age > 100) {
        errors.dateOfBirth = "Vous devez avoir entre 18 et 100 ans";
      }
    }
    
    // Genre
    if (!formData.gender) errors.gender = "Genre requis";
    
    // Adresse
    if (!address) {
      errors.address = "Adresse requise";
    } else if (address.length < 5) {
      errors.address = "L'adresse doit contenir au moins 5 caractères";
    } else if (address.length > 200) {
      errors.address = "L'adresse ne peut pas dépasser 200 caractères";
    }
    
    // Validation coordonnées GPS
    if (!formData.latitude || !formData.longitude) {
      errors.address = "Localisation GPS requise. Sélectionnez une adresse dans la liste.";
    }
    
    // Téléphone
    if (!phone) {
      errors.phone = "Téléphone requis";
    } else if (!/^\+?[0-9]{8,15}$/.test(phone.replace(/\s/g, ''))) {
      errors.phone = "Numéro de téléphone invalide (format: +229XXXXXXXX)";
    }
    
    // Email
    if (!email) {
      errors.email = "Email requis";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Format d'email invalide";
    } else if (email.length > 255) {
      errors.email = "L'email ne peut pas dépasser 255 caractères";
    }
    
    // Mot de passe
    if (!formData.password) {
      errors.password = "Mot de passe requis";
    } else if (formData.password.length < 8) {
      errors.password = "Le mot de passe doit contenir au moins 8 caractères";
    } else if (formData.password.length > 100) {
      errors.password = "Le mot de passe ne peut pas dépasser 100 caractères";
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Les mots de passe ne correspondent pas";
    }
    
    // Profession
    if (!formData.profession) errors.profession = "Profession requise";
    
    // Spécialité (requise pour tous, y compris les coachs)
    const specialty = formData.specialty.trim();
    if (!specialty) {
      errors.specialty = isCoachSportif ? "Spécialité sportive requise" : "Spécialité requise";
    } else if (specialty.length < 2) {
      errors.specialty = "La spécialité doit contenir au moins 2 caractères";
    } else if (specialty.length > 100) {
      errors.specialty = "La spécialité ne peut pas dépasser 100 caractères";
    }
    
    // Expérience
    if (!formData.experience) {
      errors.experience = "Expérience requise";
    } else {
      const exp = parseInt(formData.experience);
      if (isNaN(exp) || exp < 0 || exp > 70) {
        errors.experience = "L'expérience doit être entre 0 et 70 ans";
      }
    }
    
    // Lieu de travail (optionnel mais avec limite)
    if (formData.currentWorkplace && formData.currentWorkplace.length > 200) {
      errors.currentWorkplace = "Le lieu de travail ne peut pas dépasser 200 caractères";
    }
    
    // Documents obligatoires
    if (!formData.idDocument) errors.idDocument = "Pièce d'identité requise";
    
    if (isCoachSportif) {
      // Pour coach sportif: diplôme obligatoire
      if (!formData.diploma) {
        errors.diploma = "Diplôme ou certification requis";
      }
      
      // Types de séances
      if (formData.sessionTypes.length === 0) {
        errors.sessionTypes = "Au moins un type de séance requis";
      }
      
      // Zone d'intervention
      const zone = formData.interventionZone.trim();
      if (!zone) {
        errors.interventionZone = "Zone d'intervention requise";
      } else if (zone.length < 3) {
        errors.interventionZone = "Zone d'intervention trop courte (min 3 caractères)";
      } else if (zone.length > 200) {
        errors.interventionZone = "Zone d'intervention ne peut pas dépasser 200 caractères";
      }
      
      // Rayon d'intervention
      if (!formData.interventionRadius) {
        errors.interventionRadius = "Rayon d'intervention requis";
      } else {
        const radius = parseInt(formData.interventionRadius);
        if (isNaN(radius) || radius < 1 || radius > 100) {
          errors.interventionRadius = "Rayon entre 1 et 100 km";
        }
      }
      
      // Certifications (optionnel mais avec limite)
      if (formData.certifications && formData.certifications.length > 500) {
        errors.certifications = "Les certifications ne peuvent pas dépasser 500 caractères";
      }
      
      // Communes desservies
      const communes = formData.communesServed.trim();
      if (!communes) {
        errors.communesServed = "Communes desservies requises";
      } else if (communes.length < 3) {
        errors.communesServed = "Minimum 3 caractères requis";
      } else if (communes.length > 500) {
        errors.communesServed = "Maximum 500 caractères";
      }
    } else {
      // Pour autres praticiens: autorisation d'exercice obligatoire
      if (!formData.licenseDocument) {
        errors.licenseDocument = "Autorisation d'exercice requise";
      }
    }
    
    // Acceptation CGU
    if (!formData.acceptTerms) {
      errors.acceptTerms = "Vous devez accepter la charte d'engagement";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Fonction de retry manuel de l'edge function
  const handleRetryEdgeFunction = async (
    userId: string,
    profileData: any,
    practitionerData: any,
    documents: any
  ) => {
    setIsSubmitting(true);

    try {
      const retryResult = await invokeEdgeFunctionWithRetry<CreatePractitionerResponse>(
        'create-practitioner-account',
        { body: { userId, profileData, practitionerData, documents } }
      );

      const { data: createResult, error: createError, details: resultDetails } = retryResult;

      if (createError || !createResult?.success) {
        const errorMessage = createError?.message || createResult?.error || "Échec du retry";
        const errorDetails = resultDetails || createResult?.details;

        toast({
          title: "Échec du retry",
          description: errorDetails?.length
            ? errorDetails.join(', ')
            : errorMessage,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Continuer avec le succès...
      toast({ 
        title: "Inscription réussie !", 
        description: "Redirection en cours..." 
      });

      // Extraire le practitionerType depuis practitionerData
      const practitionerType = practitionerData.practitioner_type || 'autre';
      
      // Rediriger vers la page de succès avec le message de validation
      navigate(`/registration-success?type=practitioner&practitionerType=${practitionerType}&email=${encodeURIComponent(formData.email)}`, { replace: true });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
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
    setSubmissionStep('auth');

    try {
      // ✅ Vérifier l'unicité du téléphone dans profiles ET practitioners AVANT inscription
      let existingPhone = false;
      try {
        // Vérifier dans profiles (prioritaire car c'est là que le trigger check_phone_uniqueness vérifie)
        const profileCheckResult = await withTimeout(
          supabase
            .from('profiles')
            .select('id, full_name')
            .eq('phone', formData.phone)
            .maybeSingle(),
          8000
        );

        if (profileCheckResult.error && profileCheckResult.error.code !== 'PGRST116') {
          console.warn('Erreur vérification téléphone dans profiles:', profileCheckResult.error);
        } else if (profileCheckResult.data) {
          existingPhone = true;
        }

        // Vérifier aussi dans practitioners au cas où
        if (!existingPhone) {
          const practitionerCheckResult = await withTimeout(
            supabase
              .from('practitioners')
              .select('id')
              .eq('phone', formData.phone)
              .maybeSingle(),
            8000
          );

          if (practitionerCheckResult.error && practitionerCheckResult.error.code !== 'PGRST116') {
            console.warn('Erreur vérification téléphone dans practitioners:', practitionerCheckResult.error);
          } else if (practitionerCheckResult.data) {
            existingPhone = true;
          }
        }
      } catch (phoneCheckError) {
        if (phoneCheckError instanceof NetworkTimeoutError) {
          console.warn('Timeout lors de la vérification du téléphone, on continue quand même');
        } else {
          console.warn('Erreur réseau vérification téléphone:', phoneCheckError);
        }
      }

      if (existingPhone) {
        setFieldErrors(prev => ({
          ...prev,
          phone: "Ce numéro de téléphone est déjà utilisé"
        }));
        
        toast({
          title: "Numéro de téléphone déjà utilisé",
          description: "Ce numéro de téléphone est déjà enregistré dans notre système. Veuillez en utiliser un autre ou vous connecter si c'est votre compte.",
          variant: "destructive"
        });
        
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
          phoneInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          phoneInput.focus();
        }

        setIsSubmitting(false);
        setSubmissionStep('idle');
        return;
      }

      // Déterminer le dashboard selon le type de praticien
      const practitionerTypeForSignup = professionToType[formData.profession as keyof typeof professionToType] ?? "autre";
      const dashboardPath = practitionerTypeForSignup === 'coach_sportif' ? '/dashboard/coach' : '/dashboard/practitioner';

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}${dashboardPath}`,
          data: {
            full_name: `${formData.firstName} ${formData.lastName}`.trim(),
            user_type: "practitioner",
            practitioner_type: practitionerTypeForSignup,
            phone: formData.phone,
          },
        },
      })
      );

      if (error) {
        let userMessage = "Une erreur est survenue lors de l'inscription";
        let userDescription = "";
        let errorField: keyof SignupFormData | null = null;

        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('already registered') || errorMsg.includes('already been registered')) {
          userMessage = "Email déjà utilisé";
          userDescription = "Un compte existe déjà avec cet email. Veuillez vous connecter si c'est votre compte, ou utiliser un autre email.";
          errorField = 'email';
          
          // Mettre en évidence le champ email
          setFieldErrors(prev => ({
            ...prev,
            email: "Cet email est déjà utilisé. Veuillez en choisir un autre ou vous connecter."
          }));
          
          // Scroller vers le champ email
          setTimeout(() => {
            const emailInput = document.getElementById('email');
            if (emailInput) {
              emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              emailInput.focus();
            }
          }, 100);
        } else if (errorMsg.includes('password')) {
          userMessage = "Mot de passe invalide";
          userDescription = "Le mot de passe doit contenir au moins 8 caractères avec lettres et chiffres.";
          errorField = 'password';
          
          setFieldErrors(prev => ({
            ...prev,
            password: "Le mot de passe doit contenir au moins 8 caractères"
          }));
        } else if (errorMsg.includes('email')) {
          userMessage = "Email invalide";
          userDescription = "Veuillez vérifier le format de votre adresse email.";
          errorField = 'email';
          
          setFieldErrors(prev => ({
            ...prev,
            email: "Format d'email invalide"
          }));
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many')) {
          userMessage = "Trop de tentatives";
          userDescription = "Veuillez patienter quelques minutes avant de réessayer.";
        } else {
          userDescription = error.message;
        }

        toast({
          title: userMessage,
          description: userDescription,
          variant: "destructive",
          duration: 8000,
        });
        setIsSubmitting(false);
        setSubmissionStep('idle');
        return;
      }

      if (!data.user) {
        throw new Error("Échec de création du compte");
      }

      const userId = data.user.id;
      setSubmissionStep('profile');

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
        latitude: formData.latitude,
        longitude: formData.longitude,
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
        communes_served: formData.profession === "Coach sportif" && formData.communesServed
          ? formData.communesServed.split(",").map(c => c.trim()).filter(Boolean)
          : null,
      };

      // Convertir les fichiers en base64 pour l'edge function
      const documentsBase64: Record<string, string> = {};
      const fileKeys: (keyof SignupFormData)[] = ['profilePhoto', 'idDocument', 'diploma', 'licenseDocument'];
      
      try {
        for (const key of fileKeys) {
          const file = formData[key] as File | null;
          if (file) {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                if (reader.result) {
                  resolve(reader.result as string);
                } else {
                  reject(new Error(`Impossible de lire le fichier ${key}`));
                }
              };
              reader.onerror = () => reject(new Error(`Erreur de lecture du fichier ${key}`));
              reader.readAsDataURL(file);
            });
            documentsBase64[key] = base64;
          }
        }
      } catch (fileError) {
        toast({
          title: "Erreur",
          description: fileError instanceof Error ? fileError.message : "Erreur de lecture des fichiers",
          variant: "destructive"
        });
        setIsSubmitting(false);
        setSubmissionStep('idle');
        return;
      }

      setSubmissionStep('documents');

      // Appeler l'edge function transactionnelle
      const edgeFunctionResult = await invokeEdgeFunctionWithRetry<CreatePractitionerResponse>(
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

      const { data: createResult, error: createError, details: resultDetails } = edgeFunctionResult;

      // Note: When edge function returns 4xx, error is set but data may still contain the response body
      // The edge-function-retry now extracts the detailed error from data.error
      const hasError = createError || (createResult && !createResult.success);

      if (hasError) {
        // Get error message from: 1) createError.message (extracted from data.error), 2) createResult.error, 3) fallback
        const errorMessage = createError?.message || createResult?.error || "Échec de création du compte";
        // Get error details from: 1) result.details (extracted by retry function), 2) createResult.details (direct from response)
        const serverDetails = resultDetails || createResult?.details;

        if (import.meta.env.DEV) {
          console.error('❌ Erreur création compte praticien:', {
            createError,
            createResult,
            errorMessage,
            details: serverDetails
          });
        }
        
        // Déterminer si c'est un timeout ou une erreur de validation
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorMessage.includes('TimeoutError');
        const isValidation = serverDetails && Array.isArray(serverDetails) && serverDetails.length > 0;

        if (isTimeout) {
          // Le compte auth est créé, on redirige vers la page de succès
          // Le profil praticien sera finalisé en arrière-plan ou l'admin peut le créer manuellement
          toast({
            title: "Inscription en cours de traitement",
            description: "Votre compte a été créé. La finalisation peut prendre quelques minutes. Vous serez notifié par email.",
          });

          // Rediriger vers la page de succès malgré le timeout
          // Car le compte auth existe et l'inscription sera finalisée
          navigate(`/registration-success?type=practitioner&practitionerType=${practitionerType}&pending=true&email=${encodeURIComponent(formData.email)}`, { replace: true });
          return;
        }
        
        // Messages d'erreur contextuels et explicites
        let userMessage = errorMessage;
        let errorDetails: string[] = [];
        
        // Gestion des erreurs de validation détaillées
        if (isValidation) {
          errorDetails = serverDetails;
          userMessage = "Erreurs de validation détectées :";
        } else if (errorMessage.includes('existe déjà') || errorMessage.includes('already')) {
          // Déterminer quel champ existe déjà
          if (errorMessage.toLowerCase().includes('phone') || errorMessage.toLowerCase().includes('téléphone')) {
            userMessage = "Numéro de téléphone déjà utilisé";
            errorDetails = ["Ce numéro de téléphone est déjà enregistré. Veuillez en utiliser un autre ou vous connecter si c'est votre compte."];
            
            setFieldErrors(prev => ({
              ...prev,
              phone: "Ce numéro de téléphone est déjà utilisé"
            }));
            
            // Scroller vers le champ téléphone
            setTimeout(() => {
              const phoneInput = document.getElementById('phone');
              if (phoneInput) {
                phoneInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                phoneInput.focus();
              }
            }, 100);
          } else if (errorMessage.toLowerCase().includes('email')) {
            userMessage = "Email déjà utilisé";
            errorDetails = ["Cet email est déjà enregistré. Veuillez vous connecter si c'est votre compte, ou utiliser un autre email."];
            
            setFieldErrors(prev => ({
              ...prev,
              email: "Cet email est déjà utilisé"
            }));
            
            // Scroller vers le champ email
            setTimeout(() => {
              const emailInput = document.getElementById('email');
              if (emailInput) {
                emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                emailInput.focus();
              }
            }, 100);
          } else {
            userMessage = "Informations déjà utilisées";
            errorDetails = ["Un compte existe déjà avec ces informations. Vérifiez votre email et numéro de téléphone, ou connectez-vous si vous avez déjà un compte."];
          }
        } else if (errorMessage.includes('Document invalide') || errorMessage.includes('document')) {
          userMessage = "Un ou plusieurs documents sont invalides.";
          errorDetails = ["Vérifiez le format (PDF, JPG, PNG uniquement) et la taille (maximum 5MB par fichier)."];
        } else if (errorMessage.includes('validation') || errorMessage.includes('invalide')) {
          userMessage = "Certaines informations du formulaire sont invalides.";
          errorDetails = ["Vérifiez que tous les champs obligatoires sont correctement remplis."];
        } else if (errorMessage.includes('upload') || errorMessage.includes('Wasabi') || errorMessage.includes('storage')) {
          userMessage = "Erreur lors de l'upload des documents.";
          errorDetails = ["Veuillez vérifier votre connexion internet et réessayer."];
        } else if (errorMessage.includes('phone') || errorMessage.includes('téléphone')) {
          userMessage = "Numéro de téléphone invalide ou déjà utilisé";
          errorDetails = ["Vérifiez votre numéro de téléphone. Format attendu: +229XXXXXXXX"];
          
          setFieldErrors(prev => ({
            ...prev,
            phone: "Numéro de téléphone invalide ou déjà utilisé"
          }));
          
          // Scroller vers le champ téléphone
          setTimeout(() => {
            const phoneInput = document.getElementById('phone');
            if (phoneInput) {
              phoneInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              phoneInput.focus();
            }
          }, 100);
        } else if (errorMessage.includes('email')) {
          userMessage = "Email invalide ou déjà utilisé";
          errorDetails = ["Vérifiez votre adresse email ou utilisez-en une autre."];
          
          setFieldErrors(prev => ({
            ...prev,
            email: "Email invalide ou déjà utilisé"
          }));
          
          // Scroller vers le champ email
          setTimeout(() => {
            const emailInput = document.getElementById('email');
            if (emailInput) {
              emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
              emailInput.focus();
            }
          }, 100);
        }
        
        // Afficher toast avec les détails
        toast({
          title: "Erreur d'inscription",
          description: (
            <div className="space-y-2">
              <p className="font-semibold">{userMessage}</p>
              {errorDetails.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {errorDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          ),
          variant: "destructive",
        });

        setIsSubmitting(false);
        setSubmissionStep('idle');
        return;
      }
      
      if (import.meta.env.DEV) {
        console.log('✅ Compte praticien créé avec succès');
      }

      setSubmissionStep('finalizing');

      // Finaliser l'inscription et envoyer notification via edge function centralisée
      try {
        const { data: completeResult, error: completeError } = await withTimeout(
          supabase.functions.invoke('complete-user-registration', {
          body: {
            userId: userId,
            data: {
              userType: 'practitioner',
              email: formData.email,
              phone: formData.phone,
              fullName: `${formData.firstName} ${formData.lastName}`
            }
          }
        })
        );
        
        if (completeError) {
          if (import.meta.env.DEV) {
            console.error('⚠️ Erreur notification (non bloquante):', completeError);
          }
        } else {
          if (import.meta.env.DEV) {
            console.log('✅ Notification envoyée avec succès');
          }
        }
      } catch (notifError) {
        if (import.meta.env.DEV) {
          console.error('⚠️ Erreur notification (non bloquante):', notifError);
        }
      }

      // ✅ Succès : rediriger vers la page de succès avec le message de validation
      toast({
        title: "Inscription réussie !",
        description: "Votre compte a été créé avec succès. Redirection en cours...",
      });
      
      if (import.meta.env.DEV) {
        console.log('✅ Redirection vers page de succès avec type:', practitionerType);
      }
      
      // Rediriger vers la page de succès qui affichera le message de validation en attente
      navigate(`/registration-success?type=practitioner&practitionerType=${practitionerType}&email=${encodeURIComponent(formData.email)}`, { replace: true });
    } catch (err) {
      const isTimeoutError = err instanceof NetworkTimeoutError;
      const message = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      toast({
        ...AUTH_MESSAGES.SIGNUP_ERROR,
        description: isTimeoutError ? message : message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setSubmissionStep('idle');
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
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        required
                        aria-invalid={!!fieldErrors.firstName}
                        className={fieldErrors.firstName ? 'border-destructive focus-visible:ring-destructive' : ''}
                      />
                      {fieldErrors.firstName && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.firstName}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nom de famille *</Label>
                      <Input
                        id="lastName"
                        placeholder="Votre nom"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        required
                        aria-invalid={!!fieldErrors.lastName}
                        className={fieldErrors.lastName ? 'border-destructive focus-visible:ring-destructive' : ''}
                      />
                      {fieldErrors.lastName && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.lastName}</p>
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
                        onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                        required
                        aria-invalid={!!fieldErrors.dateOfBirth}
                        className={fieldErrors.dateOfBirth ? 'border-destructive focus-visible:ring-destructive' : ''}
                      />
                      {fieldErrors.dateOfBirth && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.dateOfBirth}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender">Sexe *</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                        <SelectTrigger className={fieldErrors.gender ? 'border-destructive' : ''}>
                          <SelectValue placeholder="Sélectionnez" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="homme">Homme</SelectItem>
                          <SelectItem value="femme">Femme</SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldErrors.gender && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.gender}</p>
                      )}
                    </div>
                  </div>

                  <AddressSearchInput
                    label="Adresse complète"
                    value={formData.address}
                    onChange={(location) => {
                      setFormData(prev => ({
                        ...prev,
                        address: location.address,
                        latitude: location.latitude ?? null,
                        longitude: location.longitude ?? null,
                      }));

                      // Valider que les coordonnées sont présentes
                      if (!location.latitude || !location.longitude) {
                        setFieldErrors(prev => ({
                          ...prev,
                          address: "Veuillez sélectionner une adresse dans la liste pour obtenir la localisation GPS"
                        }));
                      } else {
                        const error = validateField('address', location.address);
                        setFieldErrors(prev => ({ ...prev, address: error }));
                      }
                    }}
                    placeholder="Rechercher votre adresse au Bénin..."
                    required
                    error={fieldErrors.address}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Téléphone *</Label>
                      <div className="relative">
                        <PhoneInput
                          id="phone"
                          value={formData.phone}
                          onChange={(value) => handleInputChange('phone', value)}
                          countryCode="+229"
                          localNumberLength={8}
                          error={fieldErrors.phone}
                        />
                        {isCheckingPhone && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {!isCheckingPhone && formData.phone.length >= 8 && !fieldErrors.phone && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </div>
                        )}
                      </div>
                      {isCheckingPhone && (
                        <p className="text-xs text-muted-foreground mt-1">Vérification du numéro...</p>
                      )}
                      {!isCheckingPhone && formData.phone.length >= 8 && !fieldErrors.phone && (
                        <p className="text-xs text-success mt-1">✓ Numéro disponible</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email professionnel *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        required
                        aria-invalid={!!fieldErrors.email}
                        className={fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
                      />
                      {fieldErrors.email && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>
                      )}
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

                    <div className="space-y-2">
                      <Label htmlFor="specialty" className="text-sm sm:text-base">
                        {isCoachSportif ? 'Spécialité sportive' : 'Spécialité'} <span className="text-destructive">*</span>
                      </Label>
                      {isCoachSportif ? (
                        <Select
                          value={formData.specialty}
                          onValueChange={(value) => handleInputChange('specialty', value)}
                        >
                          <SelectTrigger className={`h-11 sm:h-12 ${fieldErrors.specialty ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder="Sélectionnez votre spécialité sportive" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Fitness">Fitness</SelectItem>
                            <SelectItem value="Musculation">Musculation</SelectItem>
                            <SelectItem value="Cardio-training">Cardio-training</SelectItem>
                            <SelectItem value="Yoga">Yoga</SelectItem>
                            <SelectItem value="Pilates">Pilates</SelectItem>
                            <SelectItem value="CrossFit">CrossFit</SelectItem>
                            <SelectItem value="Sport santé">Sport santé</SelectItem>
                            <SelectItem value="Préparation physique">Préparation physique</SelectItem>
                            <SelectItem value="Coaching nutritionnel sportif">Coaching nutritionnel sportif</SelectItem>
                            <SelectItem value="Remise en forme">Remise en forme</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="specialty"
                          placeholder="Ex: Cardiologie, Pédiatrie..."
                          value={formData.specialty}
                          onChange={(e) => handleInputChange('specialty', e.target.value)}
                          required
                          className={`h-11 sm:h-12 ${fieldErrors.specialty ? 'border-destructive' : ''}`}
                        />
                      )}
                      {fieldErrors.specialty && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.specialty}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!isCoachSportif && (
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
                    )}

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

                  {!isCoachSportif && (
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
                          placeholder="Ex: Cotonou, Porto-Novo, Abomey-Calavi..."
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
                          placeholder="Ex: 100"
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

                    <div className="space-y-2">
                      <Label htmlFor="communesServed" className="text-sm sm:text-base">
                        Communes desservies <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="communesServed"
                        placeholder="Ex: Cotonou, Porto-Novo, Abomey-Calavi, Parakou, Bohicon, Natitingou, Ouidah, Lokossa..."
                        value={formData.communesServed}
                        onChange={(e) => handleInputChange('communesServed', e.target.value)}
                        rows={2}
                        required
                        className={`min-h-[60px] ${fieldErrors.communesServed ? 'border-destructive' : ''}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        Séparez les communes par des virgules
                      </p>
                      {fieldErrors.communesServed && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.communesServed}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <Upload className="h-5 w-5 mr-2 text-secondary" />
                    Documents requis
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FileUploadInput
                      id="profilePhoto"
                      label="Photo de profil"
                      accept="image/*"
                      file={formData.profilePhoto}
                      onChange={(file) => handleFileChange('profilePhoto', file)}
                      error={fieldErrors.profilePhoto}
                      helpText="Photo claire de votre visage"
                    />

                    <FileUploadInput
                      id="idDocument"
                      label="Pièce d'identité"
                      accept="image/*,.pdf"
                      required
                      file={formData.idDocument}
                      onChange={(file) => handleFileChange('idDocument', file)}
                      error={fieldErrors.idDocument}
                      helpText="CNI, passeport ou permis de conduire"
                    />

                    <FileUploadInput
                      id="diploma"
                      label="Diplôme/Certificat"
                      accept="image/*,.pdf"
                      required={isCoachSportif}
                      file={formData.diploma}
                      onChange={(file) => handleFileChange('diploma', file)}
                      error={fieldErrors.diploma}
                      helpText={isCoachSportif ? "Obligatoire pour les coachs sportifs" : "Diplôme professionnel"}
                    />

                    {!isCoachSportif && (
                      <FileUploadInput
                        id="licenseDocument"
                        label="Autorisation d'exercice"
                        accept="image/*,.pdf"
                        required
                        file={formData.licenseDocument}
                        onChange={(file) => handleFileChange('licenseDocument', file)}
                        error={fieldErrors.licenseDocument}
                        helpText="Autorisation officielle d'exercer"
                      />
                    )}
                  </div>

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Tous les documents seront vérifiés par notre équipe. 
                      L'activation de votre compte peut prendre 24 à 48 heures.
                    </p>
                    {isCoachSportif && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <strong>Coach sportif :</strong> Le diplôme ou certificat est obligatoire. L'autorisation d'exercice n'est pas requise. 
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
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="terms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => handleInputChange('acceptTerms', checked as boolean)}
                      className={`mt-1 ${fieldErrors.acceptTerms ? 'border-destructive' : ''}`}
                    />
                    <Label htmlFor="terms" className="text-sm sm:text-base font-normal leading-relaxed cursor-pointer">
                      J'accepte la{" "}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          termsDialogs.openCharte();
                        }}
                        className="text-primary hover:underline font-medium"
                      >
                        Charte d'engagement des praticiens DomiCares
                      </button>{" "}
                      et les{" "}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          termsDialogs.openCGU();
                        }}
                        className="text-primary hover:underline font-medium"
                      >
                        CGU
                      </button>
                    </Label>
                  </div>
                  {fieldErrors.acceptTerms && (
                    <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p>
                  )}
                </div>

                {/* Dialogues des termes */}
                <TermsDialog
                  open={termsDialogs.isOpen('charte')}
                  onOpenChange={termsDialogs.closeDialog}
                  type="charte"
                />
                <TermsDialog
                  open={termsDialogs.isOpen('cgu')}
                  onOpenChange={termsDialogs.closeDialog}
                  type="cgu"
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-12 sm:h-14 text-base"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {submissionStep === 'auth' && "Création du compte..."}
                      {submissionStep === 'profile' && "Préparation du profil..."}
                      {submissionStep === 'documents' && "Upload des documents..."}
                      {submissionStep === 'finalizing' && "Finalisation..."}
                      {submissionStep === 'idle' && "Soumission en cours..."}
                    </>
                  ) : (
                    "Soumettre ma candidature"
                  )}
                </Button>

                {isSubmitting && (
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    Cette opération peut prendre jusqu'à 2 minutes selon votre connexion. Ne fermez pas cette page.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
import { z } from 'zod';

// Schéma de validation pour l'inscription praticien
export const practitionerSignupSchema = z.object({
  // Informations personnelles
  firstName: z.string()
    .trim()
    .min(2, "Le prénom doit contenir au moins 2 caractères")
    .max(50, "Le prénom ne peut pas dépasser 50 caractères")
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Le prénom contient des caractères invalides"),
  
  lastName: z.string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(50, "Le nom ne peut pas dépasser 50 caractères")
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, "Le nom contient des caractères invalides"),
  
  dateOfBirth: z.string()
    .min(1, "Date de naissance requise")
    .refine((date) => {
      const birthDate = new Date(date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      return age >= 18 && age <= 100;
    }, "Vous devez avoir entre 18 et 100 ans"),
  
  gender: z.string()
    .min(1, "Genre requis")
    .refine((val) => ['homme', 'femme', 'autre'].includes(val), "Genre invalide"),
  
  address: z.string()
    .trim()
    .min(5, "L'adresse doit contenir au moins 5 caractères")
    .max(200, "L'adresse ne peut pas dépasser 200 caractères"),
  
  phone: z.string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, "Numéro de téléphone invalide (format: +229XXXXXXXX)"),
  
  email: z.string()
    .trim()
    .email("Email invalide")
    .max(255, "L'email ne peut pas dépasser 255 caractères")
    .toLowerCase(),
  
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(100, "Le mot de passe ne peut pas dépasser 100 caractères"),
  
  confirmPassword: z.string(),
  
  // Informations professionnelles
  profession: z.string()
    .min(1, "Profession requise"),
  
  specialty: z.string()
    .trim()
    .max(100, "La spécialité ne peut pas dépasser 100 caractères")
    .optional(),
  
  experience: z.string()
    .refine((val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 0 && num <= 70;
    }, "L'expérience doit être entre 0 et 70 ans"),
  
  workplace: z.string()
    .trim()
    .max(200, "Le lieu de travail ne peut pas dépasser 200 caractères")
    .optional(),
  
  // Coach sportif spécifique
  sessionTypes: z.array(z.string())
    .optional(),
  
  interventionZone: z.string()
    .trim()
    .max(200, "La zone d'intervention ne peut pas dépasser 200 caractères")
    .optional(),
  
  interventionRadius: z.string()
    .optional(),
  
  certifications: z.string()
    .trim()
    .max(500, "Les certifications ne peuvent pas dépasser 500 caractères")
    .optional(),
  
  communesServed: z.string()
    .trim()
    .max(500, "Les communes desservies ne peuvent pas dépasser 500 caractères")
    .optional(),
  
  // Documents
  profilePhoto: z.any().optional(),
  idDocument: z.any(),
  licenseDocument: z.any().optional(),
  diploma: z.any().optional(),
  
  // Acceptation
  acceptTerms: z.boolean()
    .refine((val) => val === true, "Vous devez accepter la charte d'engagement"),
})
.refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
})
.refine((data) => {
  // Si coach sportif, vérifier les champs spécifiques
  const isCoachSportif = data.profession === 'Coach sportif';
  if (isCoachSportif) {
    if (!data.sessionTypes || data.sessionTypes.length === 0) {
      return false;
    }
    if (!data.interventionZone || data.interventionZone.trim().length < 3) {
      return false;
    }
    const radius = parseInt(data.interventionRadius || '0');
    if (isNaN(radius) || radius < 1 || radius > 100) {
      return false;
    }
    if (!data.diploma) {
      return false;
    }
  } else {
    // Autres praticiens doivent avoir une spécialité et autorisation
    if (!data.specialty || data.specialty.trim().length < 2) {
      return false;
    }
    if (!data.licenseDocument) {
      return false;
    }
  }
  return true;
}, {
  message: "Veuillez remplir tous les champs requis pour votre profession",
  path: ["profession"],
});

// Schéma simplifié pour validation conditionnelle
export const validateCoachSportifFields = (data: any) => {
  const errors: Record<string, string> = {};
  
  if (!data.sessionTypes || data.sessionTypes.length === 0) {
    errors.sessionTypes = "Au moins un type de séance requis";
  }
  
  if (!data.interventionZone || data.interventionZone.trim().length < 3) {
    errors.interventionZone = "Zone d'intervention requise (minimum 3 caractères)";
  }
  
  if (!data.interventionRadius) {
    errors.interventionRadius = "Rayon d'intervention requis";
  } else {
    const radius = parseInt(data.interventionRadius);
    if (isNaN(radius) || radius < 1 || radius > 100) {
      errors.interventionRadius = "Rayon entre 1 et 100 km";
    }
  }
  
  if (!data.diploma) {
    errors.diploma = "Diplôme ou certification requis pour les coachs sportifs";
  }
  
  if (!data.communesServed || data.communesServed.trim().length < 3) {
    errors.communesServed = "Communes desservies requises (minimum 3 caractères)";
  }
  
  return errors;
};

// Validation des documents
export const validateDocumentSecurity = (base64Data: string, maxSizeMB: number = 5): { valid: boolean; error?: string } => {
  if (!base64Data) {
    return { valid: false, error: "Document requis" };
  }

  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return { valid: false, error: "Format de fichier invalide" };
  }

  const contentType = matches[1];
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  
  if (!allowedTypes.includes(contentType)) {
    return { valid: false, error: "Type de fichier non autorisé (PDF, JPG, PNG uniquement)" };
  }

  const base64Content = matches[2];
  const sizeInBytes = (base64Content.length * 3) / 4;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (sizeInBytes > maxSizeBytes) {
    return { valid: false, error: `Fichier trop volumineux (max ${maxSizeMB}MB)` };
  }

  // Validation magic bytes
  try {
    const binaryString = atob(base64Content.substring(0, 100));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    if (contentType === 'application/pdf') {
      const pdfHeader = String.fromCharCode(...bytes.slice(0, 5));
      if (pdfHeader !== '%PDF-') {
        return { valid: false, error: "Fichier PDF corrompu" };
      }
    } else if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
      if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
        return { valid: false, error: "Fichier JPEG corrompu" };
      }
    } else if (contentType === 'image/png') {
      const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (let i = 0; i < pngMagic.length; i++) {
        if (bytes[i] !== pngMagic[i]) {
          return { valid: false, error: "Fichier PNG corrompu" };
        }
      }
    }
  } catch (error) {
    return { valid: false, error: "Impossible de valider le fichier" };
  }

  return { valid: true };
};

// Sanitize text input pour éviter les injections
export const sanitizeTextInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Enlever < et >
    .replace(/javascript:/gi, '') // Enlever javascript:
    .replace(/on\w+\s*=/gi, '') // Enlever les event handlers
    .substring(0, 1000); // Limite de sécurité
};

// Encode pour URL (WhatsApp, etc.)
export const encodeForUrl = (text: string): string => {
  return encodeURIComponent(sanitizeTextInput(text));
};

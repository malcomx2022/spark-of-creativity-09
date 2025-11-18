/**
 * Centralized authentication messages and constants
 * Ensures consistency across all auth flows
 */

export const AUTH_MESSAGES = {
  // Success messages
  LOGIN_SUCCESS: {
    title: "Connexion réussie",
    description: "Vous êtes maintenant connecté à votre compte.",
  },
  SIGNUP_SUCCESS: {
    title: "Inscription réussie",
    description: "Votre compte a été créé avec succès.",
  },
  EMAIL_CONFIRMATION_SUCCESS: {
    title: "Email confirmé",
    description: "Votre adresse email a été vérifiée avec succès.",
  },
  OTP_SENT: {
    title: "Code envoyé",
    description: "Un code de vérification a été envoyé.",
  },
  OTP_RESENT: {
    title: "Code renvoyé",
    description: "Un nouveau code de vérification a été envoyé.",
  },
  PASSWORD_RESET_SENT: {
    title: "Email envoyé",
    description: "Consultez vos emails pour réinitialiser votre mot de passe.",
  },
  LOGOUT_SUCCESS: {
    title: "Déconnexion réussie",
    description: "À bientôt !",
  },

  // Error messages
  LOGIN_ERROR: {
    title: "Erreur de connexion",
    defaultDescription: "Impossible de vous connecter. Vérifiez vos identifiants.",
  },
  SIGNUP_ERROR: {
    title: "Erreur d'inscription",
    defaultDescription: "Impossible de créer votre compte. Veuillez réessayer.",
  },
  OTP_ERROR: {
    title: "Erreur de vérification",
    defaultDescription: "Le code est invalide ou a expiré.",
  },
  EMAIL_CONFIRMATION_ERROR: {
    title: "Erreur de confirmation",
    defaultDescription: "Impossible de confirmer votre email.",
  },
  NETWORK_ERROR: {
    title: "Erreur réseau",
    description: "Vérifiez votre connexion internet et réessayez.",
  },

  // Info messages
  EMAIL_NEEDS_CONFIRMATION: {
    title: "Vérifiez votre email",
    description: "Un email de confirmation vous a été envoyé.",
  },
  REDIRECT_MESSAGE: {
    title: "Redirection en cours...",
    description: "Vous allez être redirigé vers votre tableau de bord.",
  },
} as const;

export const AUTH_PATHS = {
  HOME: "/",
  LOGIN: "/login",
  LOGIN_OTP: "/login-otp",
  SIGNUP: "/signup",
  SIGNUP_PATIENT: "/signup/patient",
  SIGNUP_PRACTITIONER: "/signup/practitioner",
  VERIFY_OTP: "/verify-otp",
  CONFIRM_EMAIL: "/confirm-email",
  ADMIN: "/admin",
  DASHBOARD_PATIENT: "/dashboard/patient",
  DASHBOARD_PRACTITIONER: "/dashboard/practitioner",
  DASHBOARD_COACH: "/dashboard/coach",
} as const;

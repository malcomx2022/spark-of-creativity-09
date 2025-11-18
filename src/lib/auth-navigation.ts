import { NavigateFunction } from "react-router-dom";
import { AUTH_PATHS } from "./auth-constants";

/**
 * Centralized navigation utilities for authentication flows
 * Ensures consistent redirect behavior across the app
 */

export interface NavigateOptions {
  replace?: boolean;
  state?: any;
}

/**
 * Navigate to a path with consistent behavior
 */
export const navigateToPath = (
  navigate: NavigateFunction,
  path: string,
  options: NavigateOptions = {}
) => {
  const { replace = false, state } = options;
  navigate(path, { replace, state });
};

/**
 * Navigate to home page
 */
export const navigateToHome = (
  navigate: NavigateFunction,
  replace: boolean = false
) => {
  navigateToPath(navigate, AUTH_PATHS.HOME, { replace });
};

/**
 * Navigate to login page
 */
export const navigateToLogin = (
  navigate: NavigateFunction,
  replace: boolean = false
) => {
  navigateToPath(navigate, AUTH_PATHS.LOGIN, { replace });
};

/**
 * Navigate to appropriate dashboard based on user type
 */
export const navigateToDashboard = (
  navigate: NavigateFunction,
  userType: "admin" | "practitioner" | "patient" | "coach",
  replace: boolean = true
) => {
  const paths = {
    admin: AUTH_PATHS.ADMIN,
    practitioner: AUTH_PATHS.DASHBOARD_PRACTITIONER,
    patient: AUTH_PATHS.DASHBOARD_PATIENT,
    coach: AUTH_PATHS.DASHBOARD_COACH,
  };

  navigateToPath(navigate, paths[userType], { replace });
};

/**
 * Navigate to email confirmation page
 */
export const navigateToEmailConfirmation = (
  navigate: NavigateFunction,
  email: string,
  type: "patient" | "practitioner"
) => {
  navigateToPath(
    navigate,
    `${AUTH_PATHS.CONFIRM_EMAIL}?email=${encodeURIComponent(email)}&type=${type}`,
    { replace: false }
  );
};

/**
 * Navigate to OTP verification page
 */
export const navigateToOTPVerification = (
  navigate: NavigateFunction,
  phone: string,
  email: string,
  type: "sms" | "email"
) => {
  navigateToPath(navigate, AUTH_PATHS.VERIFY_OTP, {
    replace: false,
    state: { phone, email, type },
  });
};

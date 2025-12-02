/**
 * Utilitaires pour la gestion des dates sans décalage de fuseau horaire
 * 
 * Le problème: new Date("2025-01-15") crée une date à minuit UTC, ce qui peut
 * afficher le jour précédent dans certains fuseaux horaires.
 * 
 * Solution: Parser la date YYYY-MM-DD manuellement pour créer une date locale.
 */

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Parse une date au format YYYY-MM-DD en objet Date local (sans décalage UTC)
 */
export function parseDateString(dateString: string): Date {
  if (!dateString || typeof dateString !== 'string') {
    console.warn('parseDateString: date invalide', dateString);
    return new Date();
  }

  // Si c'est déjà un ISO string avec heure, extraire juste la date
  const datePart = dateString.split('T')[0];
  
  const parts = datePart.split('-');
  if (parts.length !== 3) {
    console.warn('parseDateString: format invalide', dateString);
    return new Date(dateString);
  }

  const [year, month, day] = parts.map(Number);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    console.warn('parseDateString: valeurs non numériques', dateString);
    return new Date(dateString);
  }

  // Créer une date locale (mois est 0-indexé)
  return new Date(year, month - 1, day);
}

/**
 * Formate une date YYYY-MM-DD pour affichage français complet
 * Ex: "lundi 15 janvier 2025"
 */
export function formatDateFull(dateString: string): string {
  const date = parseDateString(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Formate une date YYYY-MM-DD pour affichage court
 * Ex: "15/01/2025"
 */
export function formatDateShort(dateString: string): string {
  const date = parseDateString(dateString);
  return date.toLocaleDateString('fr-FR');
}

/**
 * Formate une date YYYY-MM-DD avec date-fns
 * Ex: "lundi 15 janvier 2025"
 */
export function formatDateWithDateFns(dateString: string, formatStr: string = "EEEE d MMMM yyyy"): string {
  const date = parseDateString(dateString);
  return format(date, formatStr, { locale: fr });
}

/**
 * Convertit un objet Date en string YYYY-MM-DD sans décalage UTC
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Vérifie si une date string est dans le futur
 */
export function isDateInFuture(dateString: string): boolean {
  const date = parseDateString(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

/**
 * Vérifie si une date string est aujourd'hui
 */
export function isDateToday(dateString: string): boolean {
  const date = parseDateString(dateString);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

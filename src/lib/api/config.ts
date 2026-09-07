/** Base de l'API : `VITE_API_URL` (défaut `/api`, proxy Vite en développement, Caddy en production). */
export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

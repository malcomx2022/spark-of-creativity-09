/**
 * Authentification (ex `supabase.auth.*`) sur `/api/auth`.
 */
import { api } from './client';
import { clearSession, getCurrentUser, getSession, onAuthStateChange, refreshSession, setSession, updateSessionUser, type AuthSession, type AuthUser, type SessionResponse } from './session';
import { disconnectRealtime } from './realtime';
import { detachBrowserPush } from './push-session';
import type { Profile } from '@/types/profile';

export type { AuthSession, AuthUser, AuthEvent, AuthListener } from './session';

export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin' | 'incomplete_practitioner';
export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst';

/** Réponse de `GET /api/auth/me` : compte, profil et rôle applicatif résolu côté serveur. */
export interface Me {
  user: AuthUser;
  profile: Profile | null;
  role: AppRole;
  source: string;
  practitionerType?: string;
  adminRoles: AdminRole[];
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  userType?: 'patient' | 'practitioner';
  practitionerType?: string;
  pendingOnboarding?: Record<string, unknown>;
}

export interface SignUpResult {
  user: AuthUser;
  requiresEmailVerification: boolean;
  session: AuthSession | null;
}

let meCache: { userId: string; value: Me; at: number } | null = null;
const ME_TTL = 60_000;

export const auth = {
  getSession,
  getUser: getCurrentUser,
  onAuthStateChange,
  refresh: refreshSession,

  async signInWithPassword(input: { email: string; password: string }): Promise<AuthSession> {
    const res = await api.post<SessionResponse>('/auth/login', { email: input.email.trim().toLowerCase(), password: input.password }, { auth: false });
    meCache = null;
    return setSession(res);
  },

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const res = await api.post<{ user: AuthUser; requiresEmailVerification: boolean; session: Omit<SessionResponse, 'user'> | null }>('/auth/register', input, { auth: false });
    meCache = null;
    const session = res.session ? setSession({ ...res.session, user: res.user }) : null;
    return { user: res.user, requiresEmailVerification: res.requiresEmailVerification, session };
  },

  /** Déconnexion locale + révocation du refresh token côté API (toutes les sessions avec `everywhere`). */
  async signOut(options: { everywhere?: boolean } = {}): Promise<void> {
    const s = getSession();
    meCache = null;
    disconnectRealtime();
    try {
      if (s) {
        try { await detachBrowserPush(); } catch (error) { console.warn('[auth] push detach failed', error); }
        if (options.everywhere) await api.delete('/auth/sessions');
        else await api.post('/auth/logout', s.refreshToken ? { refreshToken: s.refreshToken } : {});
      }
    } catch (e) {
      console.warn('[auth] logout API error (session locale effacée)', e);
    } finally {
      clearSession();
    }
  },

  /** Compte + profil + rôle (cache 60 s, invalidé à chaque changement de session). */
  async me(options: { force?: boolean } = {}): Promise<Me | null> {
    const s = getSession();
    if (!s) return null;
    if (!options.force && meCache && meCache.userId === s.user.id && Date.now() - meCache.at < ME_TTL) return meCache.value;
    const value = await api.get<Me>('/auth/me');
    meCache = { userId: s.user.id, value, at: Date.now() };
    if (JSON.stringify(value.user) !== JSON.stringify(s.user)) updateSessionUser(value.user);
    return value;
  },

  invalidateMe() {
    meCache = null;
  },

  /** Ex `supabase.auth.updateUser({ data })` : fusion des métadonnées. */
  async updateMetadata(patch: Record<string, unknown>): Promise<AuthUser> {
    const user = await api.patch<AuthUser>('/auth/me/metadata', { metadata: patch });
    meCache = null;
    updateSessionUser(user);
    return user;
  },

  verifyEmail: (token: string) => api.post<{ verified: boolean; user?: AuthUser }>('/auth/verify-email', { token }, { auth: false }),
  resendVerification: (email: string) => api.post<{ sent: boolean }>('/auth/verify-email/resend', { email }, { auth: false }),
  forgotPassword: (email: string) => api.post<{ sent: boolean }>('/auth/password/forgot', { email }, { auth: false }),
  resetPassword: (token: string, password: string) => api.post<{ reset: boolean }>('/auth/password/reset', { token, password }, { auth: false }),
  /** Le refresh token identifie la session à conserver : l'API révoque toutes les autres. */
  changePassword: (currentPassword: string, newPassword: string) => {
    const refreshToken = getSession()?.refreshToken;
    return api.post<{ changed: boolean }>('/auth/password/change', refreshToken ? { currentPassword, newPassword, refreshToken } : { currentPassword, newPassword });
  },

  sendOtp: (phoneNumber: string, channel: 'sms' | 'whatsapp' | 'call' = 'sms') =>
    api.post<{ success: boolean; message?: string; status?: string }>('/auth/otp/send', { phoneNumber, channel }, { auth: false }),

  async verifyOtp(phoneNumber: string, code: string): Promise<AuthSession & { isNewUser?: boolean }> {
    const res = await api.post<SessionResponse & { isNewUser?: boolean }>('/auth/otp/verify', { phoneNumber, code }, { auth: false });
    meCache = null;
    return { ...setSession(res), isNewUser: res.isNewUser };
  },
};

onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') meCache = null;
});

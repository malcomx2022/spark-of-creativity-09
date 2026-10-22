import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReturnPath, postLoginPath, rememberReturnPath, takeReturnPath } from '../return-path';

afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); });

describe('retour à la page après connexion', () => {
  it('rouvre la conversation demandée dans l’espace du rôle connecté, une seule fois', () => {
    rememberReturnPath('/dashboard/patient?tab=messages&appointment=a1');
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient?tab=messages&appointment=a1');
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient');
  });

  it('garde /dashboard (résolu ensuite par rôle) pour tous les espaces', () => {
    rememberReturnPath('/dashboard?tab=support');
    expect(takeReturnPath('/dashboard/coach')).toBe('/dashboard?tab=support');
  });

  it('ignore une page d’un autre espace que celui du compte connecté', () => {
    rememberReturnPath('/dashboard/practitioner?tab=payouts');
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient');
    rememberReturnPath('/admin?tab=finance');
    expect(postLoginPath('/dashboard/coach')).toBe('/dashboard/coach');
  });

  it.each(['https://evil.test/dashboard/patient', '//evil.test', '/login', '/api/medical/export', '/dashboard/admin'])('ne mémorise pas %s', (path) => {
    rememberReturnPath(path);
    expect(sessionStorage.getItem('domicares.return-to')).toBeNull();
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient');
  });

  it('expire après 15 minutes et rejette une valeur altérée', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
    rememberReturnPath('/dashboard/patient?tab=reports');
    vi.setSystemTime(new Date('2026-10-22T10:16:00Z'));
    expect(takeReturnPath('/dashboard/patient')).toBeNull();
    sessionStorage.setItem('domicares.return-to', JSON.stringify({ path: 'https://evil.test/dashboard/patient', at: Date.now() }));
    expect(takeReturnPath('/dashboard/patient')).toBeNull();
    sessionStorage.setItem('domicares.return-to', '{pas du json');
    expect(takeReturnPath('/dashboard/patient')).toBeNull();
  });

  it('est effacé par une déconnexion volontaire, y compris pour les rendus qui la suivent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
    rememberReturnPath('/dashboard/patient?tab=messages&appointment=a1');
    clearReturnPath(true);
    rememberReturnPath('/dashboard/patient?tab=reports');
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient');
    vi.setSystemTime(new Date('2026-10-22T10:00:06Z'));
    rememberReturnPath('/dashboard/patient?tab=reports');
    expect(postLoginPath('/dashboard/patient')).toBe('/dashboard/patient?tab=reports');
  });
});

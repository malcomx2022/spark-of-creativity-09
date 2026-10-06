import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export function PwaStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const requestedUpdate = useRef(false);
  const banner = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const onlineChanged = () => setOffline(!navigator.onLine);
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => { setInstall(null); setIosHint(false); };
    const controllerChanged = () => { if (requestedUpdate.current) window.location.reload(); };
    const stateChanged = () => { if (active && registration?.waiting) setWaiting(registration.waiting); };
    const updateFound = () => { installing = registration?.installing ?? null; installing?.addEventListener('statechange', stateChanged); };
    window.addEventListener('online', onlineChanged);
    window.addEventListener('offline', onlineChanged);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIosHint((/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !standalone);
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
        if (!active) return;
        registration = reg;
        setWaiting(reg.waiting);
        reg.addEventListener('updatefound', updateFound);
      }).catch(error => console.warn('Service worker unavailable', error));
    }
    return () => {
      active = false;
      window.removeEventListener('online', onlineChanged);
      window.removeEventListener('offline', onlineChanged);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
      registration?.removeEventListener('updatefound', updateFound);
      installing?.removeEventListener('statechange', stateChanged);
    };
  }, []);
  useEffect(() => {
    const element = banner.current;
    if (!element) return;
    const resize = () => document.documentElement.style.setProperty('--pwa-banner-height', `${element.getBoundingClientRect().height}px`);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--pwa-banner-height'); };
  }, [offline, waiting, install, iosHint]);
  if (!offline && !waiting && !install && !iosHint) return null;
  return <aside ref={banner} aria-label="Application DomiCares" className="app-pwa-banner fixed bottom-0 inset-x-0 z-50 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
    <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3 text-sm">
      {offline && <p role="status">Hors ligne — une connexion est nécessaire pour envoyer vos demandes et paiements.</p>}
      {install && !offline && <Button size="sm" onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null); }}>Installer DomiCares</Button>}
      {iosHint && <p>Sur iPhone ou iPad : Partager → Sur l’écran d’accueil.</p>}
      {waiting && !offline && <Button size="sm" disabled={updating} onClick={() => {
        setUpdating(true); requestedUpdate.current = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }}>{updating ? 'Mise à jour…' : 'Nouvelle version : actualiser'}</Button>}
    </div>
  </aside>;
}

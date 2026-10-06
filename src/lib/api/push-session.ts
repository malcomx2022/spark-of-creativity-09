import { api } from './client';

/** Stop delivery to this browser even when server logout is unavailable. */
export async function detachBrowserPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete('/push/subscriptions', { endpoint }, { timeoutMs: 5000 });
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** checkout.js chargé à la demande : plus de script bloquant dans index.html. */
describe('loadFedaPayCheckout', () => {
  const scripts = () => Array.from(document.head.querySelectorAll('script[src*="cdn.fedapay.com"]')) as HTMLScriptElement[];

  beforeEach(() => {
    vi.resetModules();
    delete (window as { FedaPay?: unknown }).FedaPay;
    scripts().forEach((s) => s.remove());
  });
  afterEach(() => {
    delete (window as { FedaPay?: unknown }).FedaPay;
  });

  it('injecte le script une seule fois, en async, et résout true une fois FedaPay présent', async () => {
    const { loadFedaPayCheckout, FEDAPAY_CHECKOUT_URL } = await import('../fedapay-widget');
    const first = loadFedaPayCheckout();
    const second = loadFedaPayCheckout();
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(FEDAPAY_CHECKOUT_URL);
    expect(scripts()[0].async).toBe(true);
    (window as unknown as { FedaPay: object }).FedaPay = { init: vi.fn() };
    scripts()[0].dispatchEvent(new Event('load'));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('résout true sans rien injecter quand FedaPay est déjà chargé', async () => {
    (window as unknown as { FedaPay: object }).FedaPay = { init: vi.fn() };
    const { loadFedaPayCheckout } = await import('../fedapay-widget');
    await expect(loadFedaPayCheckout()).resolves.toBe(true);
    expect(scripts()).toHaveLength(0);
  });

  it('résout false en cas d’échec, retire le script et retente à l’appel suivant', async () => {
    const { loadFedaPayCheckout } = await import('../fedapay-widget');
    const failed = loadFedaPayCheckout();
    scripts()[0].dispatchEvent(new Event('error'));
    await expect(failed).resolves.toBe(false);
    expect(scripts()).toHaveLength(0);
    void loadFedaPayCheckout();
    expect(scripts()).toHaveLength(1);
  });

  it('index.html ne charge plus checkout.js de façon bloquante', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('index.html', 'utf-8')).not.toMatch(/<script[^>]+cdn\.fedapay\.com/);
  });
});

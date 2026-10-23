// Type definitions for FedaPay Checkout Widget
declare global {
  interface Window {
    FedaPay: {
      init: (options: FedaPayCheckoutOptions) => FedaPayCheckoutWidget;
      CHECKOUT_COMPLETED: number;
      DIALOG_DISMISSED: number;
    };
  }
}

export interface FedaPayCheckoutOptions {
  public_key: string;
  environment?: 'sandbox' | 'live';
  transaction?: {
    id?: number;
    amount: number;
    description: string;
    custom_metadata?: Record<string, unknown>;
  };
  customer?: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone_number?: {
      number: string;
      country: string;
    };
  };
  currency?: {
    iso?: string;
  };
  locale?: string;
  container?: string;
  onComplete?: (payload: FedaPayCompletePayload) => void;
}

export interface FedaPayCompletePayload {
  reason: number | string;
  transaction: {
    id: number;
    status: string;
    amount: number;
    description: string;
    [key: string]: unknown;
  };
}

export interface FedaPayCheckoutWidget {
  open: () => void;
  close: () => void;
}

export const initFedaPayWidget = (options: FedaPayCheckoutOptions): FedaPayCheckoutWidget | null => {
  if (typeof window === 'undefined' || !window.FedaPay) {
    console.error('FedaPay is not loaded');
    return null;
  }

  try {
    return window.FedaPay.init(options);
  } catch (error) {
    console.error('Error initializing FedaPay widget:', error);
    return null;
  }
};

export const isFedaPayLoaded = (): boolean => {
  return typeof window !== 'undefined' && !!window.FedaPay;
};

export const FEDAPAY_CHECKOUT_URL = 'https://cdn.fedapay.com/checkout.js?v=1.1.7';
let checkoutLoading: Promise<boolean> | null = null;

/**
 * Charge checkout.js à la demande, une seule fois. Placé dans index.html, ce script synchrone d'un CDN
 * externe bloquait DOMContentLoaded et load de toutes les pages quand le CDN répondait lentement.
 * Résout false en cas d'échec ; un appel suivant retente alors le chargement.
 */
export const loadFedaPayCheckout = (): Promise<boolean> => {
  if (isFedaPayLoaded()) return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (!checkoutLoading) {
    checkoutLoading = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = FEDAPAY_CHECKOUT_URL;
      script.async = true;
      script.onload = () => resolve(isFedaPayLoaded());
      script.onerror = () => {
        script.remove();
        checkoutLoading = null;
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }
  return checkoutLoading;
};

// Constants for checkout completion reasons
export const CHECKOUT_COMPLETED = 1;
export const DIALOG_DISMISSED = 2;

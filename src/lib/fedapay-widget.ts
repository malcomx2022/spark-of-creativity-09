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
    custom_metadata?: Record<string, any>;
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
  reason: number;
  transaction: {
    id: number;
    status: string;
    amount: number;
    description: string;
    [key: string]: any;
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

// Constants for checkout completion reasons
export const CHECKOUT_COMPLETED = 1;
export const DIALOG_DISMISSED = 2;

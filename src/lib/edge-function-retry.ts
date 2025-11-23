import { supabase } from "@/integrations/supabase/client";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const GLOBAL_TIMEOUT_MS = 30000; // 30 secondes max pour toutes les tentatives

const RETRYABLE_MESSAGE_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network error",
  "fetch failed",
  "load failed",
  "connection reset",
  "econnreset",
  "etimedout",
  "timeout",
  "temporarily unavailable",
  "temporary failure",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeMessage(message: string): string {
  return message.toLowerCase();
}

function extractErrorMessage(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && "message" in error && typeof (error as any).message === "string") {
    return (error as any).message;
  }

  return "";
}

function isTransientNetworkError(error: unknown): boolean {
  const message = normalizeMessage(extractErrorMessage(error));

  if (!message) {
    return false;
  }

  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch (serializationError) {
    return new Error("Unknown network error");
  }
}

export type EdgeFunctionInvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export type EdgeFunctionInvokeResult<T> = {
  data: T | null;
  error: Error | null;
  status?: number;
  statusText?: string;
};

export async function invokeEdgeFunctionWithRetry<T>(
  functionName: string,
  options?: EdgeFunctionInvokeOptions,
  maxAttempts: number = MAX_ATTEMPTS,
  onRetry?: (attempt: number, error: Error) => void
): Promise<EdgeFunctionInvokeResult<T>> {
  const attempts = Math.max(1, maxAttempts);
  let lastError: unknown = null;

  // Timeout global pour toutes les tentatives
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('La requête a pris trop de temps. Vérifiez votre connexion internet.'));
    }, GLOBAL_TIMEOUT_MS);
  });

  const retryPromise = (async () => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(`[Retry] Tentative ${attempt}/${attempts} pour ${functionName}`);
      
      const result = await supabase.functions.invoke<T>(functionName, options as any);

      if (!result.error) {
        console.log(`[Retry] Succès à la tentative ${attempt}`);
        return {
          data: result.data as T | null,
          error: null,
          status: 200,
          statusText: 'OK',
        };
      }

      if (!isTransientNetworkError(result.error) || attempt === attempts) {
        console.error(`[Retry] Échec définitif à la tentative ${attempt}:`, result.error);
        return {
          data: result.data as T | null,
          error: toError(result.error),
        };
      }

      lastError = result.error;
      console.warn(`[Retry] Tentative ${attempt} échouée, retry dans ${BASE_DELAY_MS * Math.pow(2, attempt - 1)}ms`);
      
      // Notifier le callback de retry si fourni
      if (onRetry) {
        onRetry(attempt, toError(lastError));
      }
    } catch (error) {
      if (!isTransientNetworkError(error)) {
        console.error(`[Retry] Erreur non retryable:`, error);
        throw error;
      }

      lastError = error;
      console.warn(`[Retry] Erreur réseau à la tentative ${attempt}:`, error);

      if (attempt === attempts) {
        console.error(`[Retry] Échec après ${attempts} tentatives`);
        return {
          data: null,
          error: toError(lastError),
        };
      }
      
      // Notifier le callback de retry si fourni
      if (onRetry) {
        onRetry(attempt, toError(lastError));
      }
    }

      // Backoff exponentiel: 1s, 2s, 4s, 8s...
      const backoffDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await delay(backoffDelay);
    }

    return {
      data: null,
      error: toError(lastError),
    };
  })();

  // Utiliser Promise.race pour appliquer le timeout global
  return Promise.race([retryPromise, timeoutPromise]);
}

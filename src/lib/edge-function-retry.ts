import { supabase } from "@/integrations/supabase/client";

const MAX_ATTEMPTS = 2;
const BASE_DELAY_MS = 300;

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
  maxAttempts: number = MAX_ATTEMPTS
): Promise<EdgeFunctionInvokeResult<T>> {
  const attempts = Math.max(1, maxAttempts);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await supabase.functions.invoke<T>(functionName, options as any);

      if (!result.error) {
        return {
          ...(result as Record<string, unknown>),
          data: result.data as T | null,
          error: null,
        } as EdgeFunctionInvokeResult<T>;
      }

      if (!isTransientNetworkError(result.error) || attempt === attempts) {
        return {
          ...(result as Record<string, unknown>),
          data: result.data as T | null,
          error: toError(result.error),
        } as EdgeFunctionInvokeResult<T>;
      }

      lastError = result.error;
    } catch (error) {
      if (!isTransientNetworkError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt === attempts) {
        return {
          data: null,
          error: toError(lastError),
        };
      }
    }

    const backoffDelay = BASE_DELAY_MS * attempt;
    await delay(backoffDelay);
  }

  return {
    data: null,
    error: toError(lastError),
  };
}

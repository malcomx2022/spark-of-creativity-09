/**
 * Wrapper pour ajouter un timeout aux requêtes réseau
 */
export const NETWORK_TIMEOUT = 30000; // 30 secondes

export class NetworkTimeoutError extends Error {
  constructor(message = "Délai de connexion dépassé (>30 secondes). Vérifiez votre connexion internet et réessayez.") {
    super(message);
    this.name = "NetworkTimeoutError";
  }
}

/**
 * Exécute une promesse avec un timeout
 * @param promise La promesse ou PromiseLike à exécuter
 * @param timeoutMs Timeout en millisecondes (défaut: 30s)
 * @returns Le résultat de la promesse ou rejette avec NetworkTimeoutError
 */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number = NETWORK_TIMEOUT
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new NetworkTimeoutError());
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeoutPromise]);
}

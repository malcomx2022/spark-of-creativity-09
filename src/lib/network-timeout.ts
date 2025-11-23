/**
 * Wrapper pour ajouter un timeout aux requêtes réseau
 */
export const NETWORK_TIMEOUT = 30000; // 30 secondes

export class NetworkTimeoutError extends Error {
  constructor(message = "La requête a pris trop de temps. Vérifiez votre connexion internet.") {
    super(message);
    this.name = "NetworkTimeoutError";
  }
}

/**
 * Exécute une promesse avec un timeout
 * @param promise La promesse à exécuter
 * @param timeoutMs Timeout en millisecondes (défaut: 30s)
 * @returns Le résultat de la promesse ou rejette avec NetworkTimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = NETWORK_TIMEOUT
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new NetworkTimeoutError());
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

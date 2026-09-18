/**
 * ✅ CORRECTION BUG #9: Logs structurés pour faciliter le debugging et monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMetadata {
  [key: string]: any;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  metadata?: LogMetadata;
}

/**
 * Log une entrée structurée en JSON
 */
export function log(
  level: LogLevel,
  message: string,
  metadata?: LogMetadata,
  service?: string
): void {
  const logEntry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(service && { service }),
    ...(metadata && { metadata }),
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Helpers pour chaque niveau de log
 */
export const logger = {
  debug: (message: string, metadata?: LogMetadata, service?: string) =>
    log('debug', message, metadata, service),
  
  info: (message: string, metadata?: LogMetadata, service?: string) =>
    log('info', message, metadata, service),
  
  warn: (message: string, metadata?: LogMetadata, service?: string) =>
    log('warn', message, metadata, service),
  
  error: (message: string, metadata?: LogMetadata, service?: string) =>
    log('error', message, metadata, service),
};

/**
 * Helper pour logger les erreurs avec stack trace
 */
export function logError(
  error: Error | unknown,
  context: string,
  metadata?: LogMetadata,
  service?: string
): void {
  if (error instanceof Error) {
    logger.error(context, {
      ...metadata,
      error: error.message,
      stack: error.stack,
    }, service);
  } else {
    logger.error(context, {
      ...metadata,
      error: String(error),
    }, service);
  }
}

/**
 * Helper pour logger les performances
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  metadata?: LogMetadata,
  service?: string
): void {
  logger.info(`Performance: ${operation}`, {
    ...metadata,
    duration_ms: durationMs,
    duration_human: `${durationMs}ms`,
  }, service);
}

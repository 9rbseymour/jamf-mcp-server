/**
 * Centralized error handling utilities
 */

import { createLogger } from '../server/logger.js';
import { JamfAPIError, NetworkError, AuthenticationError } from './errors.js';

const logger = createLogger('error-handler');

/**
 * Convert any error to JamfAPIError
 */
export function normalizeError(error: any, context?: Record<string, any>): JamfAPIError {
  if (error instanceof JamfAPIError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes('ECONNREFUSED') || 
        error.message.includes('ETIMEDOUT') || 
        error.message.includes('ENOTFOUND')) {
      return NetworkError.fromError(error, context);
    }

    // Check for auth errors
    if (error.message.toLowerCase().includes('unauthorized') || 
        error.message.toLowerCase().includes('authentication')) {
      return new AuthenticationError(error.message, context);
    }

    // Generic error
    return new JamfAPIError(
      error.message,
      undefined,
      'UNKNOWN_ERROR',
      ['Check the logs for more details'],
      context,
      error
    );
  }

  // Not an Error object
  return new JamfAPIError(
    String(error),
    undefined,
    'UNKNOWN_ERROR',
    ['An unexpected error occurred'],
    context
  );
}

/**
 * Unhandled rejection handler
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // In production, exit gracefully
    if (process.env.NODE_ENV === 'production') {
      logger.error('Shutting down due to unhandled rejection');
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });

    // Always exit on uncaught exceptions
    logger.error('Shutting down due to uncaught exception');
    process.exit(1);
  });
}

/**
 * Async operation with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new NetworkError(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T = any>(
  json: string,
  defaultValue: T | null = null
): T | null {
  try {
    return JSON.parse(json);
  } catch (error) {
    logger.warn('Failed to parse JSON', {
      error: error instanceof Error ? error.message : String(error),
      json: json.substring(0, 100), // Log first 100 chars only
    });
    return defaultValue;
  }
}

/**
 * Execute async function with error logging
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const jamfError = normalizeError(error, context);
    logger.error(`${operationName} failed`, {
      error: jamfError.toDetailedString(),
      context,
    });
    throw jamfError;
  }
}

/**
 * Execute async function with fallback
 */
export async function executeWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await primary();
  } catch (primaryError) {
    logger.warn(`${operationName} primary failed, trying fallback`, {
      primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      return await fallback();
    } catch (fallbackError) {
      logger.error(`${operationName} fallback also failed`, {
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      throw primaryError; // Throw original error
    }
  }
}
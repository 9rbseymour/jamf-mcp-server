import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { 
  normalizeError, 
  withTimeout,
  safeJsonParse,
  executeWithFallback
} from '../../utils/error-handler.js';
import { 
  JamfAPIError, 
  NetworkError, 
  AuthenticationError,
  RateLimitError 
} from '../../utils/errors.js';

describe('Error Handler Utilities', () => {
  describe('normalizeError', () => {
    test('should return JamfAPIError as-is', () => {
      const error = new JamfAPIError('Test error', 400);
      const result = normalizeError(error);
      expect(result).toBe(error);
    });

    test('should convert network errors', () => {
      const error = new Error('ECONNREFUSED: Connection refused');
      const result = normalizeError(error);
      expect(result).toBeInstanceOf(NetworkError);
      expect(result.message).toContain('Connection refused');
    });

    test('should convert auth errors', () => {
      const error = new Error('Unauthorized access');
      const result = normalizeError(error);
      expect(result).toBeInstanceOf(AuthenticationError);
    });

    test('should handle non-Error objects', () => {
      const result = normalizeError('String error');
      expect(result).toBeInstanceOf(JamfAPIError);
      expect(result.message).toBe('String error');
    });
  });

  describe('withTimeout', () => {
    test('should resolve before timeout', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 50));
      const result = await withTimeout(promise, 200, 'Test operation');
      expect(result).toBe('success');
    });

    test('should timeout on slow operations', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 200));
      await expect(withTimeout(promise, 50, 'Test operation'))
        .rejects
        .toThrow('Test operation timed out after 50ms');
    });
  });

  describe('safeJsonParse', () => {
    test('should parse valid JSON', () => {
      const result = safeJsonParse('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    test('should return default on invalid JSON', () => {
      const result = safeJsonParse('invalid json', { default: true });
      expect(result).toEqual({ default: true });
    });

    test('should return null by default on error', () => {
      const result = safeJsonParse('invalid json');
      expect(result).toBeNull();
    });
  });

  describe('executeWithFallback', () => {
    test('should use primary when successful', async () => {
      const primary = jest.fn().mockResolvedValue('primary result');
      const fallback = jest.fn().mockResolvedValue('fallback result');

      const result = await executeWithFallback(primary, fallback, 'Test operation');

      expect(result).toBe('primary result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    test('should use fallback when primary fails', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = jest.fn().mockResolvedValue('fallback result');

      const result = await executeWithFallback(primary, fallback, 'Test operation');

      expect(result).toBe('fallback result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    test('should throw original error when both fail', async () => {
      const primaryError = new Error('Primary failed');
      const primary = jest.fn().mockRejectedValue(primaryError);
      const fallback = jest.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(executeWithFallback(primary, fallback, 'Test operation'))
        .rejects
        .toThrow('Primary failed');
    });
  });
});
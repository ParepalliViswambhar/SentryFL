/**
 * Token Utilities Tests
 * 
 * Tests for JWT token handling utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  decodeToken, 
  isTokenExpired, 
  getTimeUntilExpiration,
  getUserFromToken 
} from './tokenUtils';

describe('tokenUtils', () => {
  describe('decodeToken', () => {
    it('should decode a valid JWT token', () => {
      // Create a mock JWT token (header.payload.signature)
      const payload = { sub: '123', username: 'testuser', exp: 1234567890 };
      const encodedPayload = btoa(JSON.stringify(payload));
      const mockToken = `header.${encodedPayload}.signature`;
      
      const decoded = decodeToken(mockToken);
      
      expect(decoded).toEqual(payload);
    });

    it('should handle base64url encoding in token', () => {
      // JWT uses base64url encoding which replaces + with - and / with _
      const payload = { sub: '123', username: 'test+user/name' };
      const jsonPayload = JSON.stringify(payload);
      const base64 = btoa(jsonPayload);
      const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const mockToken = `header.${base64url}.signature`;
      
      const decoded = decodeToken(mockToken);
      
      expect(decoded.username).toBe('test+user/name');
    });

    it('should return null for invalid token format', () => {
      expect(decodeToken('invalid-token')).toBeNull();
      expect(decodeToken('only.two.parts')).toBeNull();
      expect(decodeToken('')).toBeNull();
    });

    it('should return null for null token', () => {
      expect(decodeToken(null)).toBeNull();
    });

    it('should return null for non-string token', () => {
      expect(decodeToken(123)).toBeNull();
      expect(decodeToken({})).toBeNull();
    });

    it('should return null for malformed JSON in payload', () => {
      const invalidPayload = 'not-json';
      const mockToken = `header.${btoa(invalidPayload)}.signature`;
      
      expect(decodeToken(mockToken)).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    beforeEach(() => {
      // Mock current time to a fixed value
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return false for valid non-expired token', () => {
      const futureExp = Math.floor(new Date('2024-12-31T23:59:59Z').getTime() / 1000);
      const payload = { exp: futureExp };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(isTokenExpired(mockToken)).toBe(false);
    });

    it('should return true for expired token', () => {
      const pastExp = Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000);
      const payload = { exp: pastExp };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(isTokenExpired(mockToken)).toBe(true);
    });

    it('should return true for token without exp field', () => {
      const payload = { sub: '123', username: 'testuser' };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(isTokenExpired(mockToken)).toBe(true);
    });

    it('should return true for invalid token', () => {
      expect(isTokenExpired('invalid-token')).toBe(true);
      expect(isTokenExpired(null)).toBe(true);
      expect(isTokenExpired('')).toBe(true);
    });

    it('should return true for token expired exactly now', () => {
      const nowExp = Math.floor(Date.now() / 1000);
      const payload = { exp: nowExp };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(isTokenExpired(mockToken)).toBe(true);
    });
  });

  describe('getTimeUntilExpiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return correct time until expiration', () => {
      const futureTime = new Date('2024-01-01T01:00:00Z');
      const futureExp = Math.floor(futureTime.getTime() / 1000);
      const payload = { exp: futureExp };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      const timeRemaining = getTimeUntilExpiration(mockToken);
      
      // Should be 1 hour in milliseconds
      expect(timeRemaining).toBe(60 * 60 * 1000);
    });

    it('should return 0 for expired token', () => {
      const pastExp = Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000);
      const payload = { exp: pastExp };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(getTimeUntilExpiration(mockToken)).toBe(0);
    });

    it('should return 0 for invalid token', () => {
      expect(getTimeUntilExpiration('invalid-token')).toBe(0);
      expect(getTimeUntilExpiration(null)).toBe(0);
    });

    it('should return 0 for token without exp field', () => {
      const payload = { sub: '123' };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      expect(getTimeUntilExpiration(mockToken)).toBe(0);
    });
  });

  describe('getUserFromToken', () => {
    it('should extract user information from token', () => {
      const payload = {
        sub: '123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
      };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      const user = getUserFromToken(mockToken);
      
      expect(user).toEqual({
        id: '123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
      });
    });

    it('should handle different id field names', () => {
      const payloadWithUserId = {
        userId: '456',
        username: 'testuser2',
      };
      const mockToken1 = `header.${btoa(JSON.stringify(payloadWithUserId))}.signature`;
      
      const user1 = getUserFromToken(mockToken1);
      expect(user1.id).toBe('456');
      
      const payloadWithId = {
        id: '789',
        username: 'testuser3',
      };
      const mockToken2 = `header.${btoa(JSON.stringify(payloadWithId))}.signature`;
      
      const user2 = getUserFromToken(mockToken2);
      expect(user2.id).toBe('789');
    });

    it('should return null for invalid token', () => {
      expect(getUserFromToken('invalid-token')).toBeNull();
      expect(getUserFromToken(null)).toBeNull();
      expect(getUserFromToken('')).toBeNull();
    });

    it('should return user object with undefined fields for missing data', () => {
      const payload = { sub: '123' };
      const mockToken = `header.${btoa(JSON.stringify(payload))}.signature`;
      
      const user = getUserFromToken(mockToken);
      
      expect(user.id).toBe('123');
      expect(user.username).toBeUndefined();
      expect(user.email).toBeUndefined();
      expect(user.role).toBeUndefined();
    });
  });
});

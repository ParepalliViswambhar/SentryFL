/**
 * Token Utilities
 * 
 * JWT token handling utilities including expiration checking
 */

/**
 * Decode JWT token without verification (client-side only)
 * 
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export const decodeToken = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode base64url payload
    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if JWT token is expired
 * 
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired or invalid
 */
export const isTokenExpired = (token) => {
  const payload = decodeToken(token);
  
  if (!payload || !payload.exp) {
    return true;
  }
  
  // JWT exp is in seconds, Date.now() is in milliseconds
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  
  return currentTime >= expirationTime;
};

/**
 * Get time until token expiration in milliseconds
 * 
 * @param {string} token - JWT token
 * @returns {number} Milliseconds until expiration, or 0 if expired/invalid
 */
export const getTimeUntilExpiration = (token) => {
  const payload = decodeToken(token);
  
  if (!payload || !payload.exp) {
    return 0;
  }
  
  const expirationTime = payload.exp * 1000;
  const currentTime = Date.now();
  const timeRemaining = expirationTime - currentTime;
  
  return timeRemaining > 0 ? timeRemaining : 0;
};

/**
 * Get user information from token
 * 
 * @param {string} token - JWT token
 * @returns {Object|null} User info from token payload
 */
export const getUserFromToken = (token) => {
  const payload = decodeToken(token);
  
  if (!payload) {
    return null;
  }
  
  // Extract user information from token
  // Adjust fields based on actual token structure
  return {
    id: payload.sub || payload.userId || payload.id,
    username: payload.username,
    email: payload.email,
    role: payload.role,
  };
};

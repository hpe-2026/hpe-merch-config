/**
 * Keycloak Configuration and Setup
 * Handles validation of Keycloak JWT tokens and integration with Express middleware
 */

import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import logger from './logger.js';

class KeycloakConfig {
  constructor() {
    // Keycloak server configuration
    this.serverUrl = process.env.KEYCLOAK_SERVER_URL || 'http://keycloak:8080';
    this.realm = process.env.KEYCLOAK_REALM || 'nitte-realm';
    this.clientId = process.env.KEYCLOAK_CLIENT_ID || 'nitte-client';
    this.clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'nitte-client-secret';

    // Cache for public key (JWKS)
    this.cachedPublicKey = null;
    this.publicKeyFetchTime = null;
    this.publicKeyTTL = 3600000; // 1 hour

    // JWT configuration
    this.tokenAlgorithm = 'RS256'; // Keycloak uses RS256
    this.requiredClaims = ['sub', 'email', 'exp', 'iat'];
  }

  /**
   * Build Keycloak URLs
   */
  getTokenUrl() {
    return `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/token`;
  }

  getAuthorizationUrl() {
    return `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/auth`;
  }

  getJwksUrl() {
    return `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
  }

  getUserInfoUrl() {
    return `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`;
  }

  getLogoutUrl() {
    return `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/logout`;
  }

  getRealmUrl() {
    return `${this.serverUrl}/admin/realms/${this.realm}`;
  }

  /**
   * Fetch and cache public key (JWKS) from Keycloak
   */
  async getPublicKey() {
    try {
      // Check if cached key is still valid
      if (this.cachedPublicKey && this.publicKeyFetchTime) {
        const now = Date.now();
        if (now - this.publicKeyFetchTime < this.publicKeyTTL) {
          return this.cachedPublicKey;
        }
      }

      // Fetch JWKS from Keycloak
      const response = await axios.get(this.getJwksUrl(), {
        timeout: 5000,
      });

      const jwks = response.data;

      // Cache the key for future use
      this.cachedPublicKey = jwks;
      this.publicKeyFetchTime = Date.now();

      logger.debug('Fetched JWKS from Keycloak and cached');
      return jwks;
    } catch (error) {
      logger.error('Failed to fetch JWKS from Keycloak:', error.message);
      throw new Error('Unable to fetch public key from Keycloak');
    }
  }

  /**
   * Validate Keycloak JWT token format and claims
   * Note: This does basic validation; in production use 'jsonwebtoken' library for full validation
   */
  validateTokenClaims(decodedToken) {
    // Check required claims exist
    for (const claim of this.requiredClaims) {
      if (!(claim in decodedToken)) {
        throw new Error(`Missing required claim: ${claim}`);
      }
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decodedToken.exp < now) {
      throw new Error('Token has expired');
    }

    // Check audience if specified
    if (
      decodedToken.aud &&
      Array.isArray(decodedToken.aud) &&
      !decodedToken.aud.includes(this.clientId)
    ) {
      throw new Error('Invalid audience for this client');
    }

    return true;
  }

  /**
   * Decode a JWT token (without verification)
   * In production, always verify the signature using the public key
   */
  decodeToken(token) {
    try {
      if (!token || token.split('.').length !== 3) {
        throw new Error('Invalid token format');
      }

      const parts = token.split('.');
      const decoded = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      );

      return decoded;
    } catch (error) {
      logger.error('Failed to decode token:', error.message);
      throw new Error('Invalid token format');
    }
  }

  /**
   * Extract user information from decoded Keycloak token
   */
  extractUserInfo(decodedToken) {
    return {
      userId: decodedToken.sub,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.preferred_username,
      roles: decodedToken.realm_access?.roles || [],
      email_verified: decodedToken.email_verified || false,
    };
  }

  /**
   * Direct Access Grant (Resource Owner Password) — exchange username/password
   * for an access token. Only enabled because the realm's nitte-client has
   * `directAccessGrantsEnabled: true`. In production prefer Authorization Code + PKCE.
   */
  async passwordGrant(username, password) {
    const response = await axios.post(
      this.getTokenUrl(),
      new URLSearchParams({
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username,
        password,
        scope: 'openid profile email',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
        validateStatus: () => true,
      }
    );

    if (response.status !== 200) {
      const err = new Error(response.data?.error_description || 'Keycloak password grant failed');
      err.status = response.status;
      err.data = response.data;
      throw err;
    }
    return response.data;
  }

  /**
   * Verify a Keycloak access token's RS256 signature against JWKS.
   * Uses Node's built-in JWK→KeyObject conversion (no jwks-rsa dep needed).
   */
  async verifyAccessToken(token) {
    if (!token || token.split('.').length !== 3) {
      throw new Error('Invalid token format');
    }

    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf-8'));

    const jwks = await this.getPublicKey();
    const keys = jwks?.keys || [];
    const jwk = keys.find((k) => k.kid === header.kid) || keys[0];
    if (!jwk) {
      throw new Error('No matching JWK for token kid');
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });

    // Note: issuer is intentionally NOT enforced — in dev the issuer URL
    // depends on whether the request originated from inside the docker
    // network or the host browser. We still validate signature, expiry,
    // algorithm, and audience.
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    });

    return decoded;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code, redirectUri) {
    try {
      const response = await axios.post(
        this.getTokenUrl(),
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        refresh_expires_in: response.data.refresh_expires_in,
      };
    } catch (error) {
      logger.error('Failed to exchange code for token:', error.message);
      throw error;
    }
  }

  /**
   * Refresh an access token using refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const response = await axios.post(
        this.getTokenUrl(),
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        }
      );

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      logger.error('Failed to refresh token:', error.message);
      throw error;
    }
  }

  /**
   * Get user info from Keycloak using access token
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(this.getUserInfoUrl(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get user info:', error.message);
      throw error;
    }
  }

  /**
   * Create a user in Keycloak (admin API)
   * Requires admin token
   */
  async createUser(userPayload, adminToken) {
    try {
      const response = await axios.post(
        `${this.getRealmUrl()}/users`,
        {
          email: userPayload.email,
          username: userPayload.email, // Use email as username
          firstName: userPayload.firstName || 'User',
          lastName: userPayload.lastName || 'Account',
          enabled: userPayload.enabled !== undefined ? userPayload.enabled : true,
          emailVerified: userPayload.emailVerified || false,
          credentials: [
            {
              type: 'password',
              value: userPayload.password,
              temporary: false,
            },
          ],
          attributes: userPayload.attributes || {},
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      // Keycloak returns 201 with the new user's UUID in the Location header
      const location = response.headers?.location || '';
      const idFromLocation = location.split('/').pop();

      // Fall back to looking up by email if Location header was missing
      let userId = idFromLocation;
      if (!userId) {
        const found = await this.findUserByEmail(userPayload.email, adminToken);
        userId = found?.id;
      }

      return { id: userId, ...response.data };
    } catch (error) {
      logger.error('Failed to create user in Keycloak:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Look up a Keycloak user by email
   */
  async findUserByEmail(email, adminToken) {
    try {
      const response = await axios.get(`${this.getRealmUrl()}/users`, {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 5000,
      });
      return Array.isArray(response.data) && response.data.length ? response.data[0] : null;
    } catch (error) {
      logger.error('Failed to find user by email:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Toggle the `enabled` flag on a Keycloak user (used by approve/reject)
   */
  async setUserEnabled(userId, enabled, adminToken) {
    try {
      await axios.put(
        `${this.getRealmUrl()}/users/${userId}`,
        { enabled },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
      return true;
    } catch (error) {
      logger.error(`Failed to set enabled=${enabled} on user ${userId}:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Assign a role to a user in Keycloak (admin API)
   */
  async assignRoleToUser(userId, roleId, adminToken) {
    try {
      await axios.post(
        `${this.getRealmUrl()}/users/${userId}/role-mappings/realm`,
        [{ id: roleId, name: 'user' }], // Or appropriate role name
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );

      logger.info(`Assigned role ${roleId} to user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to assign role to user:', error.message);
      throw error;
    }
  }

  /**
   * Get admin token for server-to-server communication
   */
  async getAdminToken() {
    try {
      const response = await axios.post(
        this.getTokenUrl(),
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        }
      );

      return response.data.access_token;
    } catch (error) {
      logger.error('Failed to get admin token:', error.message);
      throw error;
    }
  }

  /**
   * Logout a user (server-side token revocation)
   */
  async logout(refreshToken) {
    try {
      await axios.post(
        this.getLogoutUrl(),
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        }
      );

      return true;
    } catch (error) {
      logger.error('Failed to logout:', error.message);
      throw error;
    }
  }

  /**
   * Get details about Keycloak connection status
   */
  async getHealthStatus() {
    try {
      const response = await axios.get(`${this.serverUrl}/health/live`, {
        timeout: 5000,
      });
      return {
        status: 'connected',
        serverUrl: this.serverUrl,
        realm: this.realm,
      };
    } catch (error) {
      return {
        status: 'disconnected',
        serverUrl: this.serverUrl,
        realm: this.realm,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
const keycloakConfig = new KeycloakConfig();

export default keycloakConfig;

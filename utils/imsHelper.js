/**
 * IMS Helper - Handles Adobe IMS authentication for CI/CD
 * 
 * Supports GitHub Actions caching to reuse tokens between workflow runs
 * Supports: OAuth S2S (client credentials grant)
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class ImsHelper {
  constructor() {
    this.imsUrl = process.env.IMS_TOKEN_URL;
    
    // OAuth S2S credentials (for CI/CD)
    this.oauthClientId = process.env.IMS_CLIENT_ID || '';
    this.oauthClientSecret = process.env.IMS_CLIENT_SECRET || '';
    
    // Cache file path (for GitHub Actions cache)
    this.cacheFilePath = path.join(process.cwd(), '.ims-token-cache.json');
  }

  /**
   * Get OAuth S2S token using client credentials grant
   * Checks cache first, fetches new token if expired
   * @returns {Promise<string>} Access token
   */
  async getOAuthToken() {
    // Try to load cached token first
    const cachedToken = this.loadCachedToken();
    if (cachedToken && this.isTokenValid(cachedToken)) {
      console.log('✅ Using cached token (still valid)');
      const remainingMinutes = Math.floor((cachedToken.expires_at - Date.now()) / 60000);
      console.log(`   Token expires in ${remainingMinutes} minutes`);
      return cachedToken.access_token;
    }

    if (cachedToken) {
      console.log('⚠️  Cached token expired, fetching new one...');
    } else {
      console.log('🔐 No cached token found, fetching from IMS...');
    }

    // Fetch new token
    const token = await this.fetchNewToken();
    
    // Cache it for next time
    this.saveCachedToken(token);
    
    return token.access_token;
  }

  /**
   * Fetch a new token from IMS
   * @private
   */
  async fetchNewToken() {
    if (!this.oauthClientId || !this.oauthClientSecret) {
      throw new Error('OAuth credentials not configured. Set IMS_CLIENT_ID and IMS_CLIENT_SECRET');
    }

    const tokenUrl = process.env.IMS_TOKEN_URL || `${this.imsUrl}/ims/token/v1`;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.oauthClientId,
          client_secret: this.oauthClientSecret,
          scope: 'openid,AdobeID'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OAuth token fetch failed: ${errorData.error_description || JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      // Add expiry timestamp (with 5 minute buffer for safety)
      const expiresIn = data.expires_in || 86400; // Default 24 hours
      data.expires_at = Date.now() + ((expiresIn - 300) * 1000); // -5 min buffer
      
      console.log('✅ New OAuth token obtained successfully');
      console.log(`   Token valid for ${Math.floor(expiresIn / 3600)} hours`);
      
      return data;
    } catch (error) {
      console.error('❌ Error getting OAuth token:', error.message);
      throw error;
    }
  }

  /**
   * Load cached token from file
   * @private
   */
  loadCachedToken() {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('⚠️  Failed to load cached token:', error.message);
    }
    return null;
  }

  /**
   * Save token to cache file
   * @private
   */
  saveCachedToken(tokenData) {
    try {
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(tokenData, null, 2));
      console.log('💾 Token cached for future workflow runs');
    } catch (error) {
      console.warn('⚠️  Failed to cache token:', error.message);
    }
  }

  /**
   * Check if token is still valid
   * @private
   */
  isTokenValid(tokenData) {
    if (!tokenData || !tokenData.expires_at) {
      return false;
    }
    return Date.now() < tokenData.expires_at;
  }

  /**
   * Get token info for debugging (decodes JWT)
   * @param {string} token - JWT access token
   * @returns {Object|null} Decoded token payload
   */
  getTokenInfo(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return {
        userId: payload.user_id,
        clientId: payload.client_id,
        expires: new Date(payload.exp * 1000).toISOString(),
        scopes: payload.scope
      };
    } catch (error) {
      console.warn('⚠️ Failed to parse token:', error.message);
      return null;
    }
  }
}

export default ImsHelper;


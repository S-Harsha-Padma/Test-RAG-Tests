/**
 * IMS Helper - Handles Adobe IMS authentication for tests
 * 
 * Supports:
 * - Local: Adobe I/O CLI (aio auth login --bare)
 * - CI/CD: OAuth S2S (client credentials grant) with GitHub Actions caching
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class ImsHelper {
  constructor() {
    this.imsUrl = process.env.IMS_TOKEN_URL;
    
    // OAuth S2S credentials (for CI/CD)
    this.oauthClientId = process.env.IMS_CLIENT_ID || '';
    this.oauthClientSecret = process.env.IMS_CLIENT_SECRET || '';
    
    const environment = process.env.CACHE_ENV || 'local';
    // Cache file path (for GitHub Actions cache) - environment-specific
    this.cacheFilePath = path.join(process.cwd(), `.ims-token-${environment}-cache.json`);
  }

  /**
   * Get IMS token for testing (universal method)
   * 
   * Automatically detects environment and uses appropriate method:
   * - Local: Adobe I/O CLI (aio auth login --bare)
   * - CI/CD: OAuth S2S with caching
   * 
   * @returns {Promise<string>} Access token
   */
  async getToken() {

    const isCI = process.env.GITHUB_ACTIONS || process.env.CI;
    
    if (isCI) {
      // CI/CD: Use OAuth S2S with caching
      // eslint-disable-next-line no-console
      console.log('CI/CD environment detected - using OAuth S2S');
      return this.getOAuthToken();
    }
    // Local: Use aio CLI
    // eslint-disable-next-line no-console
    console.log('Local environment - using aio CLI');
    return this.getLocalToken();
  }

  /**
   * Get token from local aio CLI
   * @private
   * @returns {Promise<string>} Access token
   */
  // eslint-disable-next-line class-methods-use-this
  getLocalToken() {
    try {
      const token = execSync('aio auth login --bare', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      
      if (!token) {
        throw new Error('aio CLI returned empty token');
      }
      
      console.log('Token obtained from aio CLI successfully');
      return token;
    } catch (error) {
      throw new Error(`Failed to get IMS token via aio CLI: ${error.message}\nMake sure you've run: aio auth login`);
    }
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
      console.log('Using cached token (still valid)');
      const remainingMinutes = Math.floor((cachedToken.expires_at - Date.now()) / 60000);
      console.log(`   Token expires in ${remainingMinutes} minutes`);
      return cachedToken.access_token;
    }

    if (cachedToken) {
      console.log('Cached token expired, fetching new one...');
    } else {
      console.log('No cached token found, fetching from IMS...');
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
      throw new Error('OAuth credentials not configured. Set IMS_CLIENT_ID and IMS_CLIENT_SECRET in .env for local tests');
    }

    try {
      const response = await fetch(this.imsUrl, {
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

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', JSON.stringify(errorData, null, 2));
        throw new Error(`OAuth token fetch failed (${response.status}): ${errorData.error_description || JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      // Add expiry timestamp (with 5 minute buffer for safety)
      // IMS v3 API returns expires_in in seconds
      const expiresIn = data.expires_in || 86400; // Default 24 hours in seconds
      data.expires_at = Date.now() + ((expiresIn - 300) * 1000); // -5 min buffer
      
      console.log('New OAuth token obtained successfully');
      console.log(`Token valid for ${Math.floor(expiresIn / 3600)} hours`);
      
      return data;
    } catch (error) {
      console.error('Error getting OAuth token:', error.message);
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
      console.warn('Failed to load cached token:', error.message);
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
      console.log('Token cached for future workflow runs');
    } catch (error) {
      console.warn('Failed to cache token:', error.message);
    }
  }

  /**
   * Check if token is still valid
   * @private
   */
  // eslint-disable-next-line class-methods-use-this
  isTokenValid(tokenData) {
    if (!tokenData || !tokenData.expires_at) {
      return false;
    }
    
    const now = Date.now();
    const expiresAt = tokenData.expires_at;
    
    // Check if expires_at is in the past
    if (expiresAt <= now) {
      return false;
    }
    
    // Sanity check: expires_at should not be more than 48 hours in the future
    // IMS tokens typically last 24 hours, so 48 hours is a reasonable max
    const maxValidDuration = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
    const remainingTime = expiresAt - now;
    
    if (remainingTime > maxValidDuration) {
      console.warn(`Token expiration looks invalid (${Math.floor(remainingTime / 60000)} minutes remaining).`);
      return false;
    }
    
    return true;
  }
}

export default ImsHelper;

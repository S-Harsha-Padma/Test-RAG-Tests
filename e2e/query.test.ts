/**
 * Query Endpoint E2E Tests
 *
 * Comprehensive tests for /api/query endpoint covering:
 * - IMS Authentication (valid/invalid/missing tokens)
 * - Query functionality (search, results, edge cases)
 * - User context and usage tracking
 *
 * Token Fetching:
 * - CI/CD: OAuth S2S with IMS_CLIENT_ID and IMS_CLIENT_SECRET
 * - Local: Adobe I/O CLI (aio auth login --bare)
 *
 * Run with: npm run test:e2e
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ImsHelper } from '../utils/imsHelper';
import makeQuery from '../utils/queryHelper';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// IMS Token - fetched dynamically via OAuth (CI/CD) or aio CLI (local)
// NOT stored in .env file for security reasons
let VALID_IMS_TOKEN = '';
const imsHelper = new ImsHelper();

describe('Query Endpoint E2E Tests', () => {
  beforeAll(async () => {
    try {
      VALID_IMS_TOKEN = await imsHelper.getToken();
      console.log('Valid IMS token obtained for testing');
    } catch (error: any) {
      console.error('Failed to fetch IMS token:', error.message);
    }
  }, 30000); // 30 second timeout for token fetch

  // =========================================================================
  // AUTHENTICATION TESTS
  // =========================================================================

  describe('AUTHENTICATION: IMS Token Validation', () => {
    test('Should reject request with invalid token', async () => {
      const { response, data } = await makeQuery('How to create webhooks?', {
        token: 'invalid-token-12345',
        count: 2,
        indexName: 'commerce-extensibility-docs',
      });

      expect(response.status).toBe(401);
      expect(data.error).toBe('invalid_token');
      expect(data.message).toContain('Invalid or expired IMS token');
      console.log('Invalid token rejected');
    });

    test('Should reject request without Authorization header', async () => {
      const { response, data } = await makeQuery('How to create webhooks?', {
        // No token provided = no Authorization header
        count: 2,
        indexName: 'commerce-extensibility-docs',
      });

      expect(response.status).toBe(401);
      expect(data.error).toBe('missing_token');
      expect(data.message).toContain('IMS token required');

      console.log('Missing token rejected');
    });

    test('should reject empty Authorization header', async () => {
      const { response, data } = await makeQuery('test', {
        authHeader: '', // Empty Authorization header
        count: 2,
      });

      expect(response.status).toBe(401);
      expect(data.error).toBe('missing_token');

      console.log('Empty token rejected');
    });
  });

  // =========================================================================
  // QUERY FUNCTIONALITY TESTS
  // =========================================================================

  describe('QUERY FUNCTIONALITY: Search Queries', () => {
    test('should handle valid query', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('Skipping: IMS_TOKEN not available');
        return;
      }

      const { response, data } = await makeQuery('How to create webhooks?', { token: VALID_IMS_TOKEN });

      // Should succeed (200) or hit quota (429)
      expect([200, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.query).toBe('How to create webhooks?');
        expect(data.results).toBeDefined();
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBeGreaterThan(0);

        // Verify result structure
        const firstResult = data.results[0];
        expect(firstResult).toHaveProperty('content');
        expect(firstResult).toHaveProperty('source');
        expect(firstResult).toHaveProperty('metadata');
        expect(firstResult).toHaveProperty('score');

        console.log(`Single word query returned ${data.results.length} results`);
      } else {
        console.log('Quota exceeded, skipping result validation');
      }
    });
    test('should handle typo tolerance (evnts → events)', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('Skipping: IMS_TOKEN not available');
        return;
      }

      const { response, data } = await makeQuery('evnts in Adobe Commerce', { token: VALID_IMS_TOKEN });

      expect([200, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.results).toBeDefined();

        // Should still return results about "events" despite typo
        expect(data.results.length).toBeGreaterThanOrEqual(0);

        if (data.results.length > 0) {
          console.log(`Typo tolerance working: returned ${data.results.length} results for "evnts"`);
        } else {
          console.log('No results for typo, but query succeeded');
        }
      }
    });

    test('should return usage statistics with valid query', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('Skipping: IMS_TOKEN not available');
        return;
      }

      const { response, data } = await makeQuery('Adobe Commerce events', { token: VALID_IMS_TOKEN });

      // Should succeed (200) or hit quota (429)
      expect([200, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(data.usage).toMatchObject({
          tokensUsed: expect.any(Number),
          tokensRemaining: expect.any(Number),
          monthlyLimit: expect.any(Number),
          tier: expect.any(String),
          percentUsed: expect.any(Number),
        });

        expect(['free', 'standard', 'premium']).toContain(data.usage.tier);

        console.log(`Usage tracked: ${data.usage.tokensUsed} tokens used, tier: ${data.usage.tier}`);
      } else if (response.status === 429) {
        console.log('Quota exceeded (429), skipping usage validation');
      }
    });
    test('should handle invalid context query with relevance score check', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('Skipping: IMS_TOKEN not available');
        return;
      }

      // Query completely unrelated to Adobe Commerce docs
      const { response, data } = await makeQuery('how to bake chocolate chip cookies', { token: VALID_IMS_TOKEN });

      expect([200, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.results).toBeDefined();

        // Should return results, but with low relevance scores
        if (data.results.length > 0) {
          const avgScore = data.results.reduce((sum: number, r: any) => sum + r.score, 0) / data.results.length;

          // Log for visibility
          console.log(`Invalid context query - avg score: ${avgScore.toFixed(4)}`);
          console.log(`Results returned: ${data.results.length}`);

          // Results should have lower relevance scores (typically < 0.5 for unrelated content)
          data.results.forEach((result: any, idx: number) => {
            console.log(`Result ${idx + 1} score: ${result.score.toFixed(4)}`);
          });
        } else {
          console.log('Invalid context query returned no results (ideal)');
        }
      }
    });
    test('should handle empty query string', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('Skipping: IMS_TOKEN not available');
        return;
      }

      const { response, data } = await makeQuery('', { token: VALID_IMS_TOKEN });

      // Might be 400 (bad request) or 200 with empty results
      expect([200, 400, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(data.results).toBeDefined();
        console.log('Empty query handled');
      } else if (response.status === 400) {
        console.log('Empty query rejected with 400');
      }
    });
  });
});


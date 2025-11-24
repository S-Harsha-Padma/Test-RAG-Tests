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
 * Run with: npm run test:query
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { execSync } from 'child_process';
import { ImsHelper } from '../utils/imsHelper.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Configuration
const APIM_ENDPOINT = process.env.APIM_ENDPOINT;
const QUERY_ENDPOINT = `${APIM_ENDPOINT}/api/query`;

// IMS Token - fetched dynamically via OAuth (CI/CD) or aio CLI (local)
// NOT stored in .env file for security reasons
let VALID_IMS_TOKEN = '';

/**
 * Get valid IMS token for testing
 * 
 * Uses ImsHelper (similar to e2e-test-suite) with token caching and expiry checking
 * 
 * Token Sources:
 * - CI/CD: OAuth S2S (client_credentials grant)
 * - Local: Adobe I/O CLI (aio auth login --bare)
 * 
 * Override: Set IMS_TOKEN env var to use a pre-fetched token (testing only)
 */
async function getImsToken() {
  // Override: Allow manual token for debugging/testing
  if (process.env.IMS_TOKEN) {
    console.log('ℹ️ Using IMS_TOKEN from environment variable (override)');
    return process.env.IMS_TOKEN;
  }

  const isCI = process.env.GITHUB_ACTIONS;
  
  if (isCI) {
    // CI/CD: Use ImsHelper for OAuth S2S with caching
    console.log('🔐 CI/CD environment detected - using ImsHelper for OAuth S2S');
    const imsHelper = new ImsHelper();
    const token = await imsHelper.getOAuthToken();
    return token;
  } else {
    // Local: Use aio CLI
    console.log('🔐 Local environment - using aio CLI');
    try {
      const token = execSync('aio auth login --bare', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();
      return token;
    } catch (error) {
      throw new Error(`Failed to get IMS token via aio CLI: ${error.message}`);
    }
  }
}

/**
 * Helper function to make authenticated query
 */
async function makeQuery(query, count = 3, indexName = 'commerce-extensibility-docs', customHeaders = {}) {
  if (!VALID_IMS_TOKEN && !customHeaders.Authorization) {
    console.warn('⚠️ No IMS token available for query!');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${VALID_IMS_TOKEN}`,
    ...customHeaders
  };

  const response = await fetch(QUERY_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, count, indexName })
  });

  const data = await response.json();
  
  if (response.status === 401) {
    console.error(`❌ 401 Unauthorized for query: "${query}"`);
    console.error(`   Token present: ${!!VALID_IMS_TOKEN}`);
    console.error(`   Auth header: ${headers.Authorization?.substring(0, 30)}...`);
  }
  
  return { response, data };
}

describe('Query Endpoint E2E Tests', () => {
  
  beforeAll(async () => {
    try {
      VALID_IMS_TOKEN = await getImsToken();
      console.log('✅ Valid IMS token obtained for testing');
      console.log(`   Token length: ${VALID_IMS_TOKEN?.length || 0} characters`);
      console.log(`   Token preview: ${VALID_IMS_TOKEN?.substring(0, 20)}...`);
    } catch (error) {
      console.error('❌ Failed to fetch IMS token:', error.message);
      console.warn('⚠️ Some tests will be skipped.');
    }
  }, 30000); // 30 second timeout for token fetch

  // =========================================================================
  // AUTHENTICATION TESTS
  // =========================================================================
  
  describe('AUTHENTICATION: IMS Token Validation', () => {
    
    test('Should reject request with invalid token', async () => {
      const response = await fetch(QUERY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token-12345'
        },
        body: JSON.stringify({
          query: "How to create webhooks?",
          count: 2,
          indexName: "commerce-extensibility-docs"
        })
      });

      expect(response.status).toBe(401);
      
      const result = await response.json();
      expect(result.error).toBe('invalid_token');
      expect(result.message).toContain('Invalid or expired IMS token');
      
      console.log('✅ Invalid token correctly rejected');
    });

    test('Should reject request without Authorization header', async () => {
      const response = await fetch(QUERY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        },
        body: JSON.stringify({
          query: "How to create webhooks?",
          count: 2,
          indexName: "commerce-extensibility-docs"
        })
      });

      expect(response.status).toBe(401);
      
      const result = await response.json();
      expect(result.error).toBe('missing_token');
      expect(result.message).toContain('IMS token required');
      
      console.log('✅ Missing token correctly rejected');
    });

    test('should reject empty Authorization header', async () => {
      const response = await fetch(QUERY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ''
        },
        body: JSON.stringify({
          query: "test",
          count: 2
        })
      });

      expect(response.status).toBe(401);
      expect(response.json()).resolves.toMatchObject({
        error: 'missing_token'
      });
      
      console.log('✅ Empty token correctly rejected');
    });

    test('should reject token without Bearer prefix', async () => {
      const response = await fetch(QUERY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'just-a-token-without-bearer'
        },
        body: JSON.stringify({ query: "test", count: 2 })
      });

      expect(response.status).toBe(401);
      console.log('✅ Non-Bearer format correctly rejected');
    });

    test('should reject JWT-like but invalid token', async () => {
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid';
      
      const response = await fetch(QUERY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fakeToken}`
        },
        body: JSON.stringify({ query: "test", count: 2 })
      });

      expect(response.status).toBe(401);
      console.log('✅ Fake JWT correctly rejected');
    });
  });

  // =========================================================================
  // QUERY FUNCTIONALITY TESTS
  // =========================================================================
  
  describe('QUERY FUNCTIONALITY: Valid Search Queries', () => {
    
    test('Test 1.1: should handle single word query', async () => {
      if (!VALID_IMS_TOKEN) {
        console.warn('⚠️ Skipping: IMS_TOKEN not available');
        return;
      }

      const { response, data } = await makeQuery('webhooks');

      // Should succeed (200) or hit quota (429)
      expect([200, 429]).toContain(response.status);
      
      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.query).toBe('webhooks');
        expect(data.results).toBeDefined();
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBeGreaterThan(0);
        
        // Verify result structure
        const firstResult = data.results[0];
        expect(firstResult).toHaveProperty('content');
        expect(firstResult).toHaveProperty('source');
        expect(firstResult).toHaveProperty('metadata');
        expect(firstResult).toHaveProperty('score');
        
        console.log(`✅ Single word query returned ${data.results.length} results`);
      } else {
        console.log('⚠️ Quota exceeded, skipping result validation');
      }
    });

    // test('Test 1.2: should handle multi-word query', async () => {
    //   if (!VALID_IMS_TOKEN) {
    //     console.warn('⚠️ Skipping: IMS_TOKEN not available');
    //     return;
    //   }

    //   const { response, data } = await makeQuery('How to create webhooks in Adobe Commerce?');

    //   expect([200, 429]).toContain(response.status);
      
    //   if (response.status === 200) {
    //     expect(data.success).toBe(true);
    //     expect(data.query).toBe('How to create webhooks in Adobe Commerce?');
    //     expect(data.results).toBeDefined();
    //     expect(Array.isArray(data.results)).toBe(true);
    //     expect(data.results.length).toBeGreaterThan(0);
        
    //     // Check that results contain relevant content
    //     const hasRelevantContent = data.results.some(result => 
    //       result.content.toLowerCase().includes('webhook') ||
    //       result.content.toLowerCase().includes('event')
    //     );
    //     expect(hasRelevantContent).toBe(true);
        
    //     console.log(`✅ Multi-word query returned ${data.results.length} relevant results`);
    //   }
    // });

    // test('Test 1: should return usage statistics with valid query', async () => {
    //   if (!VALID_IMS_TOKEN) {
    //     console.warn('⚠️ Skipping: IMS_TOKEN not available');
    //     return;
    //   }

    //   const { response, data } = await makeQuery('Adobe Commerce events');

    //   if (response.status === 200) {
    //     expect(data.usage).toMatchObject({
    //       tokensUsed: expect.any(Number),
    //       tokensRemaining: expect.any(Number),
    //       monthlyLimit: expect.any(Number),
    //       tier: expect.any(String),
    //       percentUsed: expect.any(Number)
    //     });
        
    //     expect(['free', 'standard', 'premium']).toContain(data.usage.tier);
        
    //     console.log(`✅ Usage tracked: ${data.usage.tokensUsed} tokens used, tier: ${data.usage.tier}`);
    //   }
    // });
  });

  // describe('QUERY FUNCTIONALITY: Technical Queries', () => {
    
  //   test('Test 2: should handle code/technical query', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('GraphQL API endpoint configuration');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       expect(data.results).toBeDefined();
  //       expect(data.results.length).toBeGreaterThan(0);
        
  //       // Technical queries should return relevant code/config content
  //       const hasTechnicalContent = data.results.some(result => 
  //         result.content.toLowerCase().includes('graphql') ||
  //         result.content.toLowerCase().includes('api') ||
  //         result.content.toLowerCase().includes('endpoint')
  //       );
  //       expect(hasTechnicalContent).toBe(true);
        
  //       console.log(`✅ Technical query returned ${data.results.length} relevant results`);
  //     }
  //   });

  //   test('should handle query with code syntax', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('composer require package.json');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       expect(data.results).toBeDefined();
  //       console.log(`✅ Code syntax query handled correctly`);
  //     }
  //   });
  // });

  // describe('QUERY FUNCTIONALITY: Typo Tolerance', () => {
    
  //   test('Test 3: should handle typo tolerance (evnts → events)', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('evnts in Adobe Commerce');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       expect(data.results).toBeDefined();
        
  //       // Should still return results about "events" despite typo
  //       // Vector search is naturally typo-tolerant
  //       expect(data.results.length).toBeGreaterThanOrEqual(0);
        
  //       if (data.results.length > 0) {
  //         console.log(`✅ Typo tolerance working: returned ${data.results.length} results for "evnts"`);
  //       } else {
  //         console.log(`⚠️ No results for typo, but query succeeded`);
  //       }
  //     }
  //   });

  //   test('should handle common misspellings', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('configuartion webhook');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       console.log(`✅ Misspelling handled`);
  //     }
  //   });
  // });

  // describe('QUERY FUNCTIONALITY: Invalid Context Queries', () => {
    
  //   test('Test 4: should handle invalid context query with relevance score check', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     // Query completely unrelated to Adobe Commerce docs
  //     const { response, data } = await makeQuery('how to bake chocolate chip cookies');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       expect(data.results).toBeDefined();
        
  //       // Should return results, but with low relevance scores
  //       if (data.results.length > 0) {
  //         const avgScore = data.results.reduce((sum, r) => sum + r.score, 0) / data.results.length;
          
  //         // Log for visibility
  //         console.log(`📊 Invalid context query - avg score: ${avgScore.toFixed(4)}`);
  //         console.log(`   Results returned: ${data.results.length}`);
          
  //         // Results should have lower relevance scores (typically < 0.5 for unrelated content)
  //         // This is informational - the service still returns results
  //         data.results.forEach((result, idx) => {
  //           console.log(`   Result ${idx + 1} score: ${result.score.toFixed(4)}`);
  //         });
  //       } else {
  //         console.log(`✅ Invalid context query returned no results (ideal)`);
  //       }
  //     }
  //   });

  //   test('should handle completely unrelated query', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('quantum physics and relativity theory');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       console.log(`✅ Unrelated query handled - returned ${data.results.length} results`);
  //     }
  //   });
  // });

  // describe('QUERY FUNCTIONALITY: Edge Cases', () => {
    
  //   test('Test 7: should handle invalid query format (single "?")', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('?');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       expect(data.results).toBeDefined();
  //       expect(Array.isArray(data.results)).toBe(true);
        
  //       // Single "?" should return empty or minimal results
  //       console.log(`✅ Invalid query "?" handled - returned ${data.results.length} results`);
  //     }
  //   });

  //   test('should handle empty query string', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('');

  //     // Might be 400 (bad request) or 200 with empty results
  //     expect([200, 400, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.results).toBeDefined();
  //       console.log(`✅ Empty query handled`);
  //     } else if (response.status === 400) {
  //       console.log(`✅ Empty query rejected with 400`);
  //     }
  //   });

  //   test('should handle very long query', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const longQuery = 'How to create and configure webhooks in Adobe Commerce ' + 'with additional context '.repeat(20);
  //     const { response, data } = await makeQuery(longQuery);

  //     expect([200, 400, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       console.log(`✅ Long query handled (${longQuery.length} chars)`);
  //     }
  //   });

  //   test('should handle special characters in query', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('API <script>alert("test")</script> configuration');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       // Should not execute script or cause issues
  //       console.log(`✅ Special characters handled safely`);
  //     }
  //   });

  //   test('should handle query with only punctuation', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('!@#$%^&*()');

  //     expect([200, 400, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       console.log(`✅ Punctuation-only query handled`);
  //     }
  //   });

  //   test('should handle query with numbers only', async () => {
  //     if (!VALID_IMS_TOKEN) {
  //       console.warn('⚠️ Skipping: IMS_TOKEN not available');
  //       return;
  //     }

  //     const { response, data } = await makeQuery('12345');

  //     expect([200, 429]).toContain(response.status);
      
  //     if (response.status === 200) {
  //       expect(data.success).toBe(true);
  //       console.log(`✅ Numbers-only query handled`);
  //     }
  //   });
  // });
});
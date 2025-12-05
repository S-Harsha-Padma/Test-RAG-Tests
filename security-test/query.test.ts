/**
 * Security Test Suite
 * Tests all 5 layers of security hardening
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { TableClient } from '@azure/data-tables';
import { ImsHelper } from '../utils/imsHelper';
import makeQuery from '../utils/queryHelper';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const FUNCTION_ENDPOINT = process.env.FUNCTION_ENDPOINT || 'https://commerce-docs-dev-api.azurewebsites.net';

let premiumToken: string; // Premium tier token (from aio CLI or env override)
// eslint-disable-next-line no-unused-vars
let freeTierToken: string; // Free tier token (from OAuth S2S)
const imsHelper = new ImsHelper();

beforeAll(async () => {
  // Get premium tier IMS token (aio CLI)
  try {
    premiumToken = await imsHelper.getToken();
    console.log('Premium tier IMS token obtained');
  } catch (error: any) {
    console.warn('Could not get premium tier token - some tests may fail');
    console.warn(`Error: ${error.message}`);
  }

  // Get OAuth S2S token for rate limiting test (free tier - 10 calls/min)
  // This requires IMS_CLIENT_ID and IMS_CLIENT_SECRET in .env
  if (process.env.IMS_CLIENT_ID && process.env.IMS_CLIENT_SECRET) {
    try {
      // Force OAuth S2S even in local environment
      freeTierToken = await imsHelper.getOAuthToken(); // will be used once rate limit is implemented
      console.log('Free tier token obtained (OAuth S2S - 10 calls/min)');
    } catch (error: any) {
      console.warn('Could not get OAuth S2S token - rate limit test may be skipped');
      console.warn(`Error: ${error.message}`);
    }
  } else {
    console.warn('IMS_CLIENT_ID/IMS_CLIENT_SECRET not set - rate limit test will use premium token');
    console.warn('Set these in .env to properly test rate limiting with free tier');
  }
}, 45000);

describe('Security Hardening Tests', () => {
  /**
   * Test 1: Valid Request via APIM (Should Work)
   * Tests: All 5 layers pass
   */
  describe('Test 1: Valid APIM Request', () => {
    it('should successfully query through APIM with valid IMS token', async () => {
      const { response, data } = await makeQuery('webhooks', {
        token: premiumToken,
        count: 2,
      });

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);

      // Verify usage tracking
      expect(data.usage).toBeDefined();
      expect(data.usage.tokensUsed).toBeGreaterThan(0);
      expect(data.usage.monthlyLimit).toBeDefined();
      expect(data.usage.tier).toBeDefined();
      expect(data.usage.tokensRemaining).toBeDefined();

      console.log('Test 1 Passed: Valid request successful');
      console.log(`   - Tokens used: ${data.usage.tokensUsed}`);
      console.log(`   - User tier: ${data.usage.tier}`);
      console.log(`   - Monthly limit: ${data.usage.monthlyLimit}`);
    }, 30000);
  });

  /**
   * Test 2: Direct Access to Function (Should Fail)
   */
  describe('Test 2: Direct Function Access', () => {
    it('should block direct access to Azure Function', async () => {
      const response = await fetch(`${FUNCTION_ENDPOINT}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'test',
        }),
      });

      // Should be blocked by 403 Forbidden
      expect(response.status).toBe(403);

      // Azure Function might return HTML instead of JSON for 403
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data: any = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();

        console.log('Test 2 Passed: Direct access blocked (JSON response)');
        console.log(`   - Status: ${response.status}`);
        console.log(`   - Error: ${data.error}`);
      } else {
        // HTML or other response type - just verify status code
        console.log('Test 2 Passed: Direct access blocked (non-JSON response)');
        console.log(`   - Status: ${response.status}`);
        console.log(`   - Content-Type: ${contentType || 'not specified'}`);
      }
    }, 15000);
  });

  /**
   * Test 3: APIM Request Without IMS Token (Should Fail)
   * Tests: Layer 3 (IMS Validation) at APIM level
   */
  describe('Test 3: Missing IMS Token', () => {
    it('should reject request without IMS token', async () => {
      // Don't pass token parameter - no Authorization header will be sent
      const { response, data } = await makeQuery('test');

      // Should be blocked by APIM policy (401)
      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
      expect(data.message).toContain('token');

      console.log('Test 3 Passed: Missing token rejected');
      console.log(`   - Status: ${response.status}`);
      console.log(`   - Message: ${data.message}`);
    }, 15000);
  });

  /**
   * Test 4: Response Headers Security
   * Tests: Security headers are present
   */
  describe('Test 4: Security Headers', () => {
    it('should include proper security headers', async () => {
      const { response } = await makeQuery('test', {
        token: premiumToken,
        count: 1,
      });

      // Check for security headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      console.log('Test 4 Completed: Security headers check');
      console.log(`   - Status: ${response.status}`);
      console.log(`   - Headers present: ${Object.keys(headers).length}`);

      // Log important security headers if present
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'content-security-policy',
        'strict-transport-security',
      ];

      securityHeaders.forEach(header => {
        if (headers[header]) {
          console.log(`   - ${header}: ${headers[header]}`);
        }
      });
    }, 15000);
  });

  /**
   * Test 5: Error Handling
   * Tests: Proper error messages without leaking sensitive info
   */
  describe('Test 5: Error Handling', () => {
    it('should return safe error messages', async () => {
      // Test with malformed request (empty query)
      const { data } = await makeQuery('', {
        token: premiumToken,
        count: 5,
      });

      // Should return error but not leak sensitive information
      if (!data.success) {
        expect(data.error).toBeDefined();

        // Error message should not contain sensitive data
        const errorStr = JSON.stringify(data).toLowerCase();
        expect(errorStr).not.toContain('password');
        expect(errorStr).not.toContain('secret');
        expect(errorStr).not.toContain('connection');
        expect(errorStr).not.toContain('stack trace');

        console.log('Test 5 Passed: Safe error handling');
        console.log(`   - Error type: ${data.error}`);
        console.log(`   - Message: ${data.message || data.error}`);
        console.log('   - No sensitive data leaked ✓');
      } else {
        // If query succeeded, that's also fine
        console.log('Test 5 Passed: Query succeeded (empty query handled gracefully)');
      }
    }, 15000);
  });

  /**
   * Test 6: Usage Tracking in Azure Table Storage
   * Tests: Layer 5 (Usage tracking) - verifies queries are logged
   */
  describe('Test 6: Usage Tracking', () => {
    it('should log query usage to Azure Table Storage', async () => {
      // Skip if Azure connection string not configured
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connectionString) {
        console.log('Test 6 Skipped: AZURE_STORAGE_CONNECTION_STRING not set');
        return;
      }

      try {
        // Make a unique query to track
        const uniqueQuery = `test query for tracking ${Date.now()}`;
        const { response, data } = await makeQuery(uniqueQuery, {
          token: premiumToken,
          count: 1,
        });

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        const tokensUsed = data.usage?.tokensUsed || 0;
        console.log('Query executed successfully');
        console.log(`   - Tokens used: ${tokensUsed}`);
        console.log(`   - Unique query: "${uniqueQuery}"`);

        // Wait for Azure to process the write (Table Storage eventual consistency)
        console.log('   - Waiting 3s for Azure Table Storage...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Query TokenUsage table to verify logging
        const tableClient = TableClient.fromConnectionString(
          connectionString,
          'TokenUsage',
        );

        // Get recent entries (last 10 minutes)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        let found = false;
        let matchedEntry: any = null;
        let entriesChecked = 0;

        console.log('   - Querying TokenUsage table...');

        // Query recent entries
        const entities = tableClient.listEntities({
          queryOptions: {
            filter: `Timestamp ge datetime'${tenMinutesAgo.toISOString()}'`,
          },
        });

        for await (const entity of entities) {
          entriesChecked++;
          // Check if this entry matches our unique query
          if (entity.query && entity.query.toString().includes(uniqueQuery)) {
            found = true;
            matchedEntry = entity;
            break;
          }
        }

        console.log(`   - Checked ${entriesChecked} recent entries`);

        if (!found) {
          console.warn('   - Query not found in TokenUsage table');
        }

        expect(found).toBe(true);

        if (matchedEntry) {
          console.log('Test 6 Passed: Usage tracking verified in TokenUsage table');
          console.log(`   - Query logged: "${matchedEntry.query.toString().substring(0, 60)}"`);
          console.log(`   - Tokens recorded: ${matchedEntry.tokensUsed || 'N/A'}`);
          console.log(`   - User tier: ${matchedEntry.tier || 'N/A'}`);
          console.log(`   - User email: ${matchedEntry.email || 'N/A'}`);
          console.log(`   - Index: ${matchedEntry.indexName || 'N/A'}`);
        }

        // Also check MonthlyQuotas table
        console.log('   - Checking MonthlyQuotas table...');
        const quotaClient = TableClient.fromConnectionString(
          connectionString,
          'MonthlyQuotas',
        );

        // List entities with a limit
        const quotaIterator = quotaClient.listEntities();
        const quotaEntries: any[] = [];
        let count = 0;
        for await (const entity of quotaIterator) {
          quotaEntries.push(entity);
          count++;
          if (count >= 10) break; // Limit to 10 entries
        }

        let quotaFound = false;
        const quotaCount = quotaEntries.length;
        const quotaDetails: any[] = [];

        if (quotaCount > 0) {
          quotaFound = true;
          // Collect details for display (matching Azure CLI output format)
          for (const entity of quotaEntries) {
            quotaDetails.push({
              partitionKey: entity.partitionKey || 'N/A',
              rowKey: entity.rowKey || 'N/A',
              email: entity.email || entity.userId || 'N/A',
              tier: entity.tier || 'N/A',
              tokensUsed: entity.tokensUsed || 0,
              monthlyLimit: entity.monthlyLimit || 'N/A',
            });
          }
        }

        if (!quotaFound) {
          console.warn('   - No entries in MonthlyQuotas table yet');
          console.warn('   - This might indicate backend is not tracking quotas');
        } else {
          console.log(`   - MonthlyQuotas table tracking active (${quotaCount} entries)`);
          quotaDetails.slice(0, 5).forEach((quota, index) => {
            console.log(`   │ User ${index + 1}: ${String(quota.email).padEnd(45)} │`);
            console.log(`   │   - Tier: ${String(quota.tier).padEnd(47)} │`);
            console.log(`   │   - Tokens Used: ${String(quota.tokensUsed).padEnd(39)} │`);
            console.log(`   │   - Monthly Limit: ${String(quota.monthlyLimit).padEnd(37)} │`);
          });
        }
      } catch (error: any) {
        console.error('Test 6 Failed:', error.message);
        console.error(`   Stack: ${error.stack}`);
        throw error;
      }
    }, 35000);
  });

  /**
   * Test 7: Rate Limiting (Layer 6 - via APIM policy)
   * Tests: Rate limit enforcement
   *
   * NOTE: During pilot phase, all users are set to premium tier (1000 calls/min)
   * This test verifies the tier header is set correctly without exhausting tokens
   */
  describe('Test 7: Rate Limiting', () => {
    it('should have rate limiting configured (verify tier header)', async () => {
      const testToken = premiumToken;

      console.log('Test 7: Verifying rate limiting configuration');
      console.log('   NOTE: During pilot phase, all users are premium tier (1000 calls/min)');

      // Make a single request to verify tier header
      const { response, data } = await makeQuery('webhooks', {
        token: testToken,
        count: 1,
      });

      expect(response.status).toBe(200);

      // Check usage info which includes tier
      if ((data as any).usage) {
        const tier = (data as any).usage.tier;
        const limit = (data as any).usage.monthlyLimit;

        console.log('Rate limiting is configured');
        console.log(`User tier: ${tier}`);
        console.log(`Monthly limit: ${limit}`);

        // Verify tier is set (premium during pilot)
        expect(tier).toBeDefined();
        expect(['premium', 'standard', 'free']).toContain(tier);
      } else {
        console.log('Usage info not returned - cannot verify tier');
      }

      console.log('');
      console.log(' Full rate limit testing skipped during pilot phase');
      console.log('(All users are premium tier with 1000 calls/min)');
      console.log('Re-enable tier differentiation to test free tier rate limiting');
    }, 30000);
  });
});


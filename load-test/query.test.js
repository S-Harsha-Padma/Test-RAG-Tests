/**
 * k6 Load Test - Basic Search Query
 * Tests the /api/query endpoint with realistic search queries
 * 
 * TARGET: 100 concurrent users, ~1000 requests/minute
 * FORMULA: req/min = (users × 60) / avg_sleep_time
 *          1000 = (100 × 60) / 6 seconds
 * 
 * Authentication:
 *   - Local: Token fetched from aio CLI (aio auth login --bare)
 *   - CI/CD: Token fetched via OAuth S2S
 *   Uses get-token.js helper automatically
 * 
 * Run with npm:
 *   npm run test:load
 * 
 * Or directly with k6 (requires IMS_TOKEN):
 *   k6 run -e APIM_ENDPOINT=https://your-apim.azure-api.net -e IMS_TOKEN=your-token load-test/query.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');
const tokensUsed = new Counter('tokens_used');

// Load test configuration
export const options = {
  // Stages simulate realistic user load - target 1000 req/min with 100 users
  stages: [
    { duration: '2m', target: 1 },   // 1 user = ~6-8 req/min (under 10/min limit)
    { duration: '1m', target: 0 },
    // { duration: '30s', target: 1 },
    // { duration: '30s', target: 2 },
    // { duration: '30s', target: 0 },
    // { duration: '1m', target: 10 },   // Warm up: ramp to 10 users
    // { duration: '1m', target: 50 },   // Ramp up: scale to 50 users
    // { duration: '3m', target: 100 },  // Peak load: 100 concurrent users
    // { duration: '1m', target: 100 },  // Sustain: hold at 100 users
    // { duration: '2m', target: 0 },    // Ramp down: cool down
  ],
  
  // Performance thresholds (test fails if these aren't met)
  thresholds: {
    'http_req_duration': ['p(95)<3000'],  // P95 latency < 3s
    'http_req_failed': ['rate<0.01'],     // Error rate < 1%
  },
};

// Configuration - Must be set via environment variables
const APIM_ENDPOINT = __ENV.APIM_ENDPOINT;
const IMS_TOKEN = __ENV.IMS_TOKEN;

if (!APIM_ENDPOINT) {
  throw new Error('APIM_ENDPOINT is required. Set it via: export APIM_ENDPOINT=https://your-endpoint.azure-api.net for local testing');
}

if (!IMS_TOKEN) {
  throw new Error('IMS_TOKEN is required. Run via "npm run test:load" which automatically fetches token.');
}

// Sample queries representing realistic user behavior
const queries = [
  'How to create webhooks in Adobe Commerce?',
  'Event handling in Commerce extensibility',
  'App Builder integration with Commerce',
  'REST API authentication',
  'Custom admin grids',
  'GraphQL schema extension',
  'Payment gateway integration',
  'Shipping method customization',
  'Product import best practices',
  'Cache management strategies',
];

// Sample indexes based on your setup
const indexes = [
  'commerce-extensibility-docs',
  'commerce-core-docs',
  'app-builder-docs',
];

// Setup function runs once before load test starts
export function setup() {
  console.log(`   APIM Endpoint: ${APIM_ENDPOINT}`);
  return { startTime: new Date().toISOString() };
}

export default function () {
  
  // Select random query and index for realistic variation
  const query = queries[Math.floor(Math.random() * queries.length)];
  const indexName = indexes[Math.floor(Math.random() * indexes.length)];
  
  const payload = JSON.stringify({
    query: query,
    count: 5,
    indexName: indexName,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${IMS_TOKEN}`,
    },
    tags: { type: 'query' },
  };

  // Execute the query
  const startTime = Date.now();
  const response = http.post(
    `${APIM_ENDPOINT}/api/query`,
    payload,
    params
  );
  const duration = Date.now() - startTime;

  // Record custom metrics
  queryDuration.add(duration);
  errorRate.add(response.status !== 200);

  // Validate response (check() automatically records metrics)
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
    'response time < 5s': (r) => r.timings.duration < 5000,
    'has success field': (r) => {
      try {
        return r.json('success') !== undefined;
      } catch (e) {
        return false;
      }
    },
    'has results array': (r) => {
      try {
        return Array.isArray(r.json('results'));
      } catch (e) {
        return false;
      }
    },
    'results not empty': (r) => {
      try {
        const results = r.json('results');
        return results && results.length > 0;
      } catch (e) {
        return false;
      }
    },
    'has usage info': (r) => {
      try {
        return r.json('usage') !== undefined;
      } catch (e) {
        return false;
      }
    },
    'tokens used tracked': (r) => {
      try {
        return r.json('usage.tokensUsed') > 0;
      } catch (e) {
        return false;
      }
    },
  });

  // Track token usage if available
  if (response.status === 200) {
    try {
      const body = response.json();
      if (body.usage && body.usage.tokensUsed) {
        tokensUsed.add(body.usage.tokensUsed);
      }
      
      // Debug: Log if results are missing even with 200 status
      if (!body.results) {
        console.warn(`Status 200 but no results field. Response:`, JSON.stringify(body).substring(0, 200));
      }
    } catch (e) {
      console.error('Error parsing response:', e.message);
      console.error('Response body:', response.body.substring(0, 500));
    }
  } else {
    // Log failed requests with details for debugging
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] Request failed with status ${response.status}`);
    console.error(`  Query: "${query.substring(0, 50)}..."`);
    console.error(`  Index: ${indexName}`);
    console.error(`  Response body: ${response.body.substring(0, 500)}`);
    console.error(`  Duration: ${duration}ms`);
  }

  // Simulate user think time (realistic pause between requests)
  // For 1000 req/min with 100 users: each user makes ~10 req/min = 1 req every 6s
  // Sleep time = 6s total - request duration (~1-2s avg) = ~4-5s sleep
  sleep(Math.random() * 2 + 4);  // Random sleep 4-6 seconds (avg ~5s for target 1000 req/min)
}

export function handleSummary(data) {
  return {
    'load-test-summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  
  // Safe access to metrics with fallbacks
  const duration = (data.state?.testRunDurationMs || 0) / 1000;
  const totalReqs = data.metrics?.http_reqs?.values?.count || 0;
  const reqRate = data.metrics?.http_reqs?.values?.rate || 0;
  const avgDuration = data.metrics?.http_req_duration?.values?.avg || 0;
  const p95 = data.metrics?.http_req_duration?.values?.['p(95)'] || 0;
  const failedRate = data.metrics?.http_req_failed?.values?.rate || 0;
  const errorRate = data.metrics?.errors?.values?.rate || 0;
  const tokensUsed = data.metrics?.tokens_used?.values?.count || 0;
  const avgTokens = totalReqs > 0 ? tokensUsed / totalReqs : 0;
  
  return `
${indent}Load Test Summary
${indent}================
${indent}
${indent}Test Duration: ${duration.toFixed(1)}s
${indent}Total Requests: ${totalReqs}
${indent}Request Rate: ${reqRate.toFixed(2)}/s
${indent}
${indent}Response Times:
${indent}  - Average: ${avgDuration.toFixed(2)}ms
${indent}  - P95: ${p95.toFixed(2)}ms
${indent}
${indent}Success Rate: ${((1 - failedRate) * 100).toFixed(2)}%
${indent}Error Rate: ${(errorRate * 100).toFixed(2)}%
${indent}
${indent}Custom Metrics:
${indent}  - Total Tokens Used: ${tokensUsed}
${indent}  - Avg Tokens/Request: ${avgTokens.toFixed(0)}
  `;
}
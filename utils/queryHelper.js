/**
 * Query Helper - Helper functions for making RAG queries in tests
 */

import fetch from 'node-fetch';

/**
 * Make a query to the RAG endpoint with flexible authentication options
 *
 * @param {string} query - Search query
 * @param {Object} options - Optional parameters
 * @param {string|null} options.token - IMS authentication token (default: null = no auth header)
 * @param {string} options.authHeader - Custom Authorization header value (overrides token)
 * @param {number} options.count - Number of results (default: 3)
 * @param {string} options.indexName - Index to search (default: 'commerce-extensibility-docs')
 * @param {Object} options.customHeaders - Additional headers to add
 * @returns {Promise<{response: Response, data: Object}>} Response object and parsed JSON data
 *
 * @example
 * // Normal authenticated query
 * makeQuery('webhooks', { token: 'valid-ims-token' })
 *
 * // Query without authentication (tests missing auth)
 * makeQuery('webhooks')
 *
 * // Query with invalid token
 * makeQuery('webhooks', { token: 'invalid-token' })
 *
 * // Query with custom auth header format
 * makeQuery('webhooks', { authHeader: 'just-a-token-without-bearer' })
 *
 * // Query with empty auth header
 * makeQuery('webhooks', { authHeader: '' })
 */
export default async function makeQuery(query, options = {}) {
  const {
    token = null,
    authHeader = null,
    count = 3,
    indexName,
    customHeaders = {},
  } = options;

  // Get endpoint from environment
  const { APIM_ENDPOINT } = process.env;
  if (!APIM_ENDPOINT) {
    throw new Error('APIM_ENDPOINT not configured in environment variables');
  }
  const QUERY_ENDPOINT = `${APIM_ENDPOINT}/api/query`;

  // Build base headers
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  // Add Authorization header based on options
  if (authHeader !== null) {
    // Custom auth header provided (for testing edge cases)
    headers.Authorization = authHeader;
  } else if (token !== null) {
    // Token provided - use Bearer format
    headers.Authorization = `Bearer ${token}`;
  }
  // else: no Authorization header (for testing missing auth)

  // Make request
  const response = await fetch(QUERY_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, count, indexName }),
  });

  // Parse response (handle empty/invalid JSON gracefully)
  let data;
  const responseText = await response.text();

  try {
    // Check for empty response (some error responses have no body)
    if (!responseText || responseText.trim() === '') {
      console.warn(`Empty response body for query: "${query}" (status: ${response.status})`);
      data = { error: 'empty_response', message: 'Server returned empty response' };
    } else {
      // Parse the text as JSON (works for both success and error responses)
      data = JSON.parse(responseText);
    }
  } catch (error) {
    // JSON parsing failed - log the raw response for debugging
    console.error(`Failed to parse response as JSON for query: "${query}"`);
    throw new Error(`Invalid JSON response: ${error.message}`);
  }

  return { response, data };
}
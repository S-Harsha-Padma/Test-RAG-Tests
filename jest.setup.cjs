/**
 * Jest Setup File
 * Initializes global objects needed for Azure SDK and fetch
 */

const { webcrypto } = require('crypto');

// Make crypto available globally for Azure SDK
global.crypto = webcrypto;

// Polyfill fetch for Node 18+ (in case Jest environment doesn't have it)
if (typeof global.fetch === 'undefined') {
  global.fetch = require('node-fetch');
  global.Headers = require('node-fetch').Headers;
  global.Request = require('node-fetch').Request;
  global.Response = require('node-fetch').Response;
}

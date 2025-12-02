/**
 * Jest Setup File
 * Initializes global objects needed for Azure SDK
 */

const { webcrypto } = require('crypto');

// Make crypto available globally for Azure SDK
global.crypto = webcrypto;

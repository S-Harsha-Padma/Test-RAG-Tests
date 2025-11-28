/**
 * Jest Setup File
 * Initializes global objects needed for Azure SDK
 */

import { webcrypto } from 'crypto';

// Make crypto available globally for Azure SDK
global.crypto = webcrypto;


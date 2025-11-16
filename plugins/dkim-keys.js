const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * DKIM Keys Plugin
 *
 * This plugin provides DKIM private and public keys for email signing.
 * Developers can customize this file to load keys from different sources:
 * - Files (default implementation)
 * - Database
 * - External API
 * - Key management service
 * - Environment variables
 *
 * The plugin should export a function that returns an object with:
 * - privateKey: PEM-formatted private key string
 * - publicKey: PEM-formatted public key string (optional, for reference)
 * - selector: DKIM selector (default: 'default')
 * - domain: Domain for DKIM signature
 */

/**
 * Get DKIM keys for a given domain
 *
 * @param {string} domain - The domain to get keys for (e.g., 'example.com')
 * @returns {Promise<{privateKey: string, publicKey: string, selector: string, domain: string}>}
 */
async function getDKIMKeys(domain) {
  try {
    // Default implementation: Load keys from files
    const keysDir = path.join(__dirname, '../keys', domain);
    const privateKeyPath = path.join(keysDir, 'private.key');
    const publicKeyPath = path.join(keysDir, 'public.key');

    // Check if keys exist for this domain
    if (!fs.existsSync(privateKeyPath)) {
      logger.warn(`DKIM private key not found for domain: ${domain}`, {
        path: privateKeyPath
      });
      return null;
    }

    // Read private key
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Read public key (optional)
    let publicKey = null;
    if (fs.existsSync(publicKeyPath)) {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    }

    // Get selector from environment or use default
    const selector = process.env.DKIM_SELECTOR || 'default';

    logger.debug(`DKIM keys loaded for domain: ${domain}`, {
      selector,
      hasPrivateKey: !!privateKey,
      hasPublicKey: !!publicKey
    });

    return {
      privateKey,
      publicKey,
      selector,
      domain
    };

  } catch (error) {
    logger.error(`Failed to load DKIM keys for domain: ${domain}`, {
      error: error.message
    });
    return null;
  }
}

/**
 * EXAMPLE: Alternative implementation using environment variables
 * Uncomment and modify this section to use environment-based keys
 */
/*
async function getDKIMKeys(domain) {
  const selector = process.env.DKIM_SELECTOR || 'default';
  const privateKey = process.env[`DKIM_PRIVATE_KEY_${domain.toUpperCase().replace(/\./g, '_')}`];

  if (!privateKey) {
    logger.warn(`No DKIM key found in environment for domain: ${domain}`);
    return null;
  }

  // Decode from base64 if needed
  const decodedKey = Buffer.from(privateKey, 'base64').toString('utf8');

  return {
    privateKey: decodedKey,
    publicKey: null,
    selector,
    domain
  };
}
*/

/**
 * EXAMPLE: Alternative implementation using MongoDB
 * Uncomment and modify this section to use database keys
 */
/*
const DKIMKey = require('../models/DKIMKey'); // You'd need to create this model

async function getDKIMKeys(domain) {
  try {
    const keyDoc = await DKIMKey.findOne({ domain, active: true });

    if (!keyDoc) {
      logger.warn(`No DKIM key found in database for domain: ${domain}`);
      return null;
    }

    return {
      privateKey: keyDoc.privateKey,
      publicKey: keyDoc.publicKey,
      selector: keyDoc.selector || 'default',
      domain: keyDoc.domain
    };
  } catch (error) {
    logger.error(`Failed to load DKIM keys from database for domain: ${domain}`, {
      error: error.message
    });
    return null;
  }
}
*/

module.exports = getDKIMKeys;

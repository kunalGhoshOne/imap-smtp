const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

/**
 * DKIM Keys Plugin - API Version
 *
 * This plugin fetches DKIM keys from an external API.
 * Useful for centralized key management across multiple servers.
 *
 * To use this plugin:
 * 1. Set DKIM_PLUGIN_PATH=./plugins/dkim-keys-api.js in .env
 * 2. Set DKIM_API_URL to your API endpoint
 * 3. Optionally set DKIM_API_KEY for authentication
 *
 * API Response Expected Format:
 * {
 *   "domain": "example.com",
 *   "selector": "default",
 *   "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...",
 *   "publicKey": "-----BEGIN PUBLIC KEY-----\n..." (optional)
 * }
 */

// In-memory cache to avoid repeated API calls
const keyCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Fetch data from API endpoint
 *
 * @param {string} url - The API URL
 * @param {object} options - Request options
 * @returns {Promise<object>}
 */
function fetchFromAPI(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000
    };

    const req = client.request(url, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        } else {
          reject(new Error(`API returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`API request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Get DKIM keys for a given domain from API
 *
 * @param {string} domain - The domain to get keys for (e.g., 'example.com')
 * @returns {Promise<{privateKey: string, publicKey: string, selector: string, domain: string}>}
 */
async function getDKIMKeys(domain) {
  try {
    // Check cache first
    const cacheKey = domain.toLowerCase();
    const cached = keyCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      logger.debug(`DKIM keys loaded from cache for domain: ${domain}`);
      return cached.data;
    }

    // Get API configuration from environment
    const apiUrl = process.env.DKIM_API_URL;
    const apiKey = process.env.DKIM_API_KEY;

    if (!apiUrl) {
      logger.error('DKIM_API_URL not configured in environment');
      return null;
    }

    // Build API URL with domain parameter
    const url = apiUrl.includes('?')
      ? `${apiUrl}&domain=${encodeURIComponent(domain)}`
      : `${apiUrl}?domain=${encodeURIComponent(domain)}`;

    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'SMTP-NodeJS-DKIM/1.0'
    };

    // Add API key if configured
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      // Alternative: headers['X-API-Key'] = apiKey;
    }

    logger.debug(`Fetching DKIM keys from API for domain: ${domain}`, {
      url: apiUrl // Don't log full URL with domain for security
    });

    // Fetch keys from API
    const response = await fetchFromAPI(url, {
      method: 'GET',
      headers,
      timeout: 10000
    });

    // Validate response
    if (!response || !response.privateKey) {
      logger.warn(`API returned invalid response for domain: ${domain}`);
      return null;
    }

    // Prepare keys object
    const keys = {
      privateKey: response.privateKey,
      publicKey: response.publicKey || null,
      selector: response.selector || process.env.DKIM_SELECTOR || 'default',
      domain: response.domain || domain
    };

    // Cache the result
    keyCache.set(cacheKey, {
      data: keys,
      timestamp: Date.now()
    });

    logger.info(`DKIM keys loaded from API for domain: ${domain}`, {
      selector: keys.selector,
      hasPrivateKey: !!keys.privateKey,
      hasPublicKey: !!keys.publicKey
    });

    return keys;

  } catch (error) {
    logger.error(`Failed to fetch DKIM keys from API for domain: ${domain}`, {
      error: error.message
    });
    return null;
  }
}

/**
 * Clear cache for a specific domain or all domains
 *
 * @param {string} domain - Optional domain to clear, clears all if not specified
 */
function clearCache(domain = null) {
  if (domain) {
    keyCache.delete(domain.toLowerCase());
    logger.debug(`Cleared DKIM cache for domain: ${domain}`);
  } else {
    keyCache.clear();
    logger.debug('Cleared all DKIM cache');
  }
}

/**
 * Get cache statistics
 *
 * @returns {object}
 */
function getCacheStats() {
  return {
    size: keyCache.size,
    domains: Array.from(keyCache.keys()),
    ttl: CACHE_TTL
  };
}

module.exports = getDKIMKeys;
module.exports.clearCache = clearCache;
module.exports.getCacheStats = getCacheStats;

/**
 * EXAMPLE API IMPLEMENTATION
 *
 * If you're building the API endpoint, here's an example Express.js handler:
 *
 * ```javascript
 * const express = require('express');
 * const app = express();
 *
 * // DKIM keys endpoint
 * app.get('/api/dkim/keys', async (req, res) => {
 *   try {
 *     const { domain } = req.query;
 *
 *     // Validate API key
 *     const apiKey = req.headers['authorization']?.replace('Bearer ', '');
 *     if (apiKey !== process.env.API_KEY) {
 *       return res.status(401).json({ error: 'Unauthorized' });
 *     }
 *
 *     // Fetch keys from your storage (database, files, etc.)
 *     const keys = await DKIMKeyModel.findOne({ domain, active: true });
 *
 *     if (!keys) {
 *       return res.status(404).json({ error: 'Keys not found for domain' });
 *     }
 *
 *     res.json({
 *       domain: keys.domain,
 *       selector: keys.selector,
 *       privateKey: keys.privateKey,
 *       publicKey: keys.publicKey
 *     });
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 *
 * app.listen(3001, () => {
 *   console.log('DKIM API running on port 3001');
 * });
 * ```
 *
 * Example API URL configuration:
 * DKIM_API_URL=https://your-api-server.com/api/dkim/keys
 * DKIM_API_KEY=your-secret-api-key
 */

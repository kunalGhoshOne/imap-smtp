const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../config/config');
const logger = require('../utils/logger');

class IPSelectionService {
  constructor() {
    this.config = config.ipSelection;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  async getIPForEmail(emailData) {
    if (!this.config.enabled) {
      logger.debug('IP selection disabled, using default connection');
      return null;
    }

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(emailData);
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        logger.debug('Using cached IP', { ip: cached.ip, emailId: emailData._id });
        return cached.ip;
      }

      // Fetch new IP from API
      const ip = await this.fetchIPFromAPI(emailData);
      
      if (ip) {
        // Cache the result
        this.cache.set(cacheKey, {
          ip,
          timestamp: Date.now()
        });
        
        logger.info('IP selected for email', { 
          ip, 
          emailId: emailData._id,
          sender: emailData.sender 
        });
        
        return ip;
      }

      // Fallback to default IP if configured
      if (this.config.fallbackIp) {
        logger.warn('Using fallback IP', { 
          fallbackIp: this.config.fallbackIp,
          emailId: emailData._id 
        });
        return this.config.fallbackIp;
      }

      logger.warn('No IP available, using default connection');
      return null;

    } catch (error) {
      logger.error('Error getting IP for email', { 
        error: error.message,
        emailId: emailData._id 
      });

      // Fallback to default IP if configured
      if (this.config.fallbackIp) {
        logger.warn('Using fallback IP due to error', { 
          fallbackIp: this.config.fallbackIp,
          emailId: emailData._id 
        });
        return this.config.fallbackIp;
      }

      return null;
    }
  }

  getCacheKey(emailData) {
    // Create a cache key based on sender domain and recipient domain
    const senderDomain = emailData.sender.split('@')[1] || 'unknown';
    const recipientDomain = emailData.recipients[0]?.split('@')[1] || 'unknown';
    return `${senderDomain}:${recipientDomain}`;
  }

  async fetchIPFromAPI(emailData) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const response = await this.makeAPIRequest(emailData);
        
        if (response && response.status === true && response.ip) {
          return response.ip;
        } else {
          throw new Error(`Invalid API response: ${JSON.stringify(response)}`);
        }
      } catch (error) {
        lastError = error;
        logger.warn(`IP API attempt ${attempt} failed`, {
          error: error.message,
          attempt,
          maxRetries: this.config.retries,
          emailId: emailData._id
        });

        if (attempt < this.config.retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All IP API attempts failed');
  }

  async makeAPIRequest(emailData) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.config.apiUrl);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      // Prepare query parameters
      const queryParams = new URLSearchParams({
        email: emailData.sender,
        recipients: emailData.recipients.join(','),
        subject: emailData.subject || '',
        timestamp: new Date().toISOString()
      });

      const fullUrl = `${this.config.apiUrl}?${queryParams.toString()}`;
      const requestUrl = new URL(fullUrl);

      const options = {
        hostname: requestUrl.hostname,
        port: requestUrl.port || (isHttps ? 443 : 80),
        path: requestUrl.pathname + requestUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'SMTP-Server-IP-Selector/1.0',
          'Accept': 'application/json'
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const response = JSON.parse(data);
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('API request timeout'));
      });

      req.end();
    });
  }

  // Clear cache (useful for testing or manual cache invalidation)
  clearCache() {
    this.cache.clear();
    logger.info('IP selection cache cleared');
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp < this.cacheTimeout) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      total: this.cache.size,
      valid: validEntries,
      expired: expiredEntries,
      cacheTimeout: this.cacheTimeout
    };
  }

  // Validate IP format
  validateIP(ip) {
    if (!ip) return false;
    
    // Basic IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }
}

module.exports = new IPSelectionService(); 
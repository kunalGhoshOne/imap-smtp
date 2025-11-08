const http = require('http');
const logger = require('../utils/logger');

// Constants
const DEFAULT_RSPAMD_HOST = 'localhost';
const DEFAULT_RSPAMD_PORT = 11333;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_REJECT_THRESHOLD = 15;
const DEFAULT_GREYLIST_THRESHOLD = 6;
const DEFAULT_ADD_HEADER_THRESHOLD = 4;
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB
const MAX_SPAM_LEVEL_ASTERISKS = 50;
const MIN_PORT = 1;
const MAX_PORT = 65535;

class RspamdService {
  constructor() {
    // Parse and validate configuration
    this.enabled = process.env.RSPAMD_ENABLED === 'true';
    this.inboundEnabled = process.env.RSPAMD_INBOUND_ENABLED === 'true';
    this.outboundEnabled = process.env.RSPAMD_OUTBOUND_ENABLED === 'true';
    this.host = process.env.RSPAMD_HOST || DEFAULT_RSPAMD_HOST;

    // Validate and parse port
    const port = parseInt(process.env.RSPAMD_PORT || String(DEFAULT_RSPAMD_PORT));
    this.port = (port >= MIN_PORT && port <= MAX_PORT) ? port : DEFAULT_RSPAMD_PORT;

    // Validate and parse timeout
    const timeout = parseInt(process.env.RSPAMD_TIMEOUT || String(DEFAULT_TIMEOUT));
    this.timeout = (timeout > 0) ? timeout : DEFAULT_TIMEOUT;

    // Validate and parse thresholds
    const rejectThreshold = parseFloat(process.env.RSPAMD_REJECT_THRESHOLD || String(DEFAULT_REJECT_THRESHOLD));
    this.rejectThreshold = (rejectThreshold >= 0) ? rejectThreshold : DEFAULT_REJECT_THRESHOLD;

    const greylistThreshold = parseFloat(process.env.RSPAMD_GREYLIST_THRESHOLD || String(DEFAULT_GREYLIST_THRESHOLD));
    this.greylistThreshold = (greylistThreshold >= 0) ? greylistThreshold : DEFAULT_GREYLIST_THRESHOLD;

    const addHeaderThreshold = parseFloat(process.env.RSPAMD_ADD_HEADER_THRESHOLD || String(DEFAULT_ADD_HEADER_THRESHOLD));
    this.addHeaderThreshold = (addHeaderThreshold >= 0) ? addHeaderThreshold : DEFAULT_ADD_HEADER_THRESHOLD;

    // Create HTTP agent for connection pooling
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: this.timeout
    });

    // Metrics tracking
    this.metrics = {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      rejects: 0,
      greylists: 0,
      accepts: 0
    };

    // Log configuration
    if (this.enabled) {
      logger.info('Rspamd service initialized', {
        host: this.host,
        port: this.port,
        inboundEnabled: this.inboundEnabled,
        outboundEnabled: this.outboundEnabled,
        rejectThreshold: this.rejectThreshold,
        greylistThreshold: this.greylistThreshold,
        addHeaderThreshold: this.addHeaderThreshold
      });
    }
  }

  /**
   * Check if rspamd is enabled for the given mail type
   * @param {string} mailType - 'inbound', 'outbound', or 'lmtp'
   * @returns {boolean}
   */
  isEnabled(mailType = 'inbound') {
    if (!this.enabled) return false;

    if (mailType === 'inbound' || mailType === 'lmtp') {
      return this.inboundEnabled;
    } else if (mailType === 'outbound') {
      return this.outboundEnabled;
    }

    return false;
  }

  /**
   * Scan email content with rspamd
   * @param {string} rawEmail - Raw email content
   * @param {object} options - Additional options (sender, recipients, ip, etc.)
   * @returns {Promise<object>} - Scan results
   */
  async scanEmail(rawEmail, options = {}) {
    if (!this.enabled) {
      logger.debug('Rspamd is disabled, skipping scan');
      return {
        action: 'no action',
        score: 0,
        required_score: this.rejectThreshold,
        symbols: {},
        messages: [],
        skipped: true
      };
    }

    this.metrics.totalScans++;

    try {
      const result = await this._makeRequest(rawEmail, options);

      this.metrics.successfulScans++;

      logger.info('Rspamd scan completed', {
        score: result.score,
        action: result.action,
        sender: options.sender,
        recipients: options.recipients,
        ip: options.ip
      });

      return result;
    } catch (error) {
      this.metrics.failedScans++;

      logger.error('Rspamd scan failed', {
        error: error.message,
        sender: options.sender,
        recipients: options.recipients,
        ip: options.ip,
        host: this.host,
        port: this.port
      });

      // Return safe default on error (fail-open policy)
      return {
        action: 'no action',
        score: 0,
        required_score: this.rejectThreshold,
        symbols: {},
        messages: [error.message],
        error: true
      };
    }
  }

  /**
   * Sanitize input to prevent header injection
   * @private
   */
  _sanitizeHeaderValue(value) {
    if (!value) return '';
    return String(value).replace(/[\r\n]/g, '').trim();
  }

  /**
   * Make HTTP request to rspamd
   * @private
   */
  _makeRequest(rawEmail, options) {
    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(rawEmail)
      };

      // Add optional headers with sanitization
      if (options.sender) {
        headers['From'] = this._sanitizeHeaderValue(options.sender);
      }
      if (options.recipients && options.recipients.length > 0) {
        headers['Rcpt'] = this._sanitizeHeaderValue(options.recipients.join(','));
      }
      if (options.ip) {
        headers['IP'] = this._sanitizeHeaderValue(options.ip);
      }
      if (options.helo) {
        headers['Helo'] = this._sanitizeHeaderValue(options.helo);
      }
      if (options.hostname) {
        headers['Hostname'] = this._sanitizeHeaderValue(options.hostname);
      }

      const requestOptions = {
        hostname: this.host,
        port: this.port,
        path: '/checkv2',
        method: 'POST',
        headers: headers,
        timeout: this.timeout,
        agent: this.agent
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        let dataSize = 0;

        res.on('data', (chunk) => {
          dataSize += chunk.length;

          // Enforce response size limit
          if (dataSize > MAX_RESPONSE_SIZE) {
            req.destroy();
            reject(new Error(`Rspamd response too large: ${dataSize} bytes`));
            return;
          }

          data += chunk;
        });

        res.on('end', () => {
          // Validate HTTP status code
          if (res.statusCode !== 200) {
            reject(new Error(`Rspamd returned status ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse rspamd response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Rspamd request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.removeAllListeners();
        req.destroy();
        reject(new Error('Rspamd request timeout'));
      });

      req.write(rawEmail);
      req.end();
    });
  }

  /**
   * Determine action based on rspamd score
   * @param {object} scanResult - Result from scanEmail
   * @returns {object} - Action to take
   */
  getAction(scanResult) {
    if (scanResult.error || scanResult.skipped) {
      return {
        action: 'accept',
        reason: scanResult.error ? 'scan_error' : 'scan_disabled',
        addHeaders: false
      };
    }

    const score = scanResult.score || 0;
    const rspamdAction = scanResult.action || 'no action';

    // Check rspamd's own action first
    if (rspamdAction === 'reject' || score >= this.rejectThreshold) {
      this.metrics.rejects++;
      return {
        action: 'reject',
        reason: 'spam_detected',
        score: score,
        threshold: this.rejectThreshold,
        message: `550 5.7.1 Message rejected as spam (score: ${score.toFixed(2)}/${this.rejectThreshold})`,
        addHeaders: true
      };
    }

    if (rspamdAction === 'greylist' || score >= this.greylistThreshold) {
      this.metrics.greylists++;
      return {
        action: 'greylist',
        reason: 'greylist',
        score: score,
        threshold: this.greylistThreshold,
        message: `451 4.7.1 Greylisted, please try again later (score: ${score.toFixed(2)}/${this.greylistThreshold})`,
        addHeaders: true
      };
    }

    this.metrics.accepts++;

    if (score >= this.addHeaderThreshold) {
      return {
        action: 'accept',
        reason: 'add_headers',
        score: score,
        threshold: this.addHeaderThreshold,
        addHeaders: true
      };
    }

    return {
      action: 'accept',
      reason: 'clean',
      score: score,
      addHeaders: false
    };
  }

  /**
   * Generate spam headers to add to email
   * @param {object} scanResult - Result from scanEmail
   * @returns {string} - Headers to add
   */
  generateHeaders(scanResult) {
    if (!scanResult || scanResult.skipped || scanResult.error) {
      return '';
    }

    const headers = [];
    const score = scanResult.score || 0;
    const requiredScore = scanResult.required_score || this.rejectThreshold;

    // Add X-Spam-Status header
    const isSpam = score >= this.addHeaderThreshold;
    headers.push(`X-Spam-Status: ${isSpam ? 'Yes' : 'No'}, score=${score.toFixed(2)} required=${requiredScore.toFixed(2)}`);

    // Add X-Spam-Score header
    headers.push(`X-Spam-Score: ${score.toFixed(2)}`);

    // Add X-Spam-Level header (asterisks representing score, capped at 50)
    const level = '*'.repeat(Math.min(Math.floor(score), MAX_SPAM_LEVEL_ASTERISKS));
    headers.push(`X-Spam-Level: ${level}`);

    // Add X-Spam-Action header
    headers.push(`X-Spam-Action: ${scanResult.action || 'no action'}`);

    // Add symbols if present
    if (scanResult.symbols && Object.keys(scanResult.symbols).length > 0) {
      const symbols = Object.entries(scanResult.symbols)
        .map(([name, data]) => {
          const symbolScore = (data && data.score !== undefined) ? data.score.toFixed(2) : '0.00';
          return `${name}(${symbolScore})`;
        })
        .join(', ');
      headers.push(`X-Spam-Symbols: ${symbols}`);
    }

    return headers.join('\r\n') + '\r\n';
  }

  /**
   * Health check for rspamd service
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.enabled) {
      return false;
    }

    return new Promise((resolve) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path: '/ping',
        method: 'GET',
        timeout: 5000,
        agent: this.agent
      }, (res) => {
        // Rspamd /ping endpoint returns 200 on success
        resolve(res.statusCode === 200);
      });

      req.on('error', (error) => {
        logger.warn('Rspamd health check failed', { error: error.message });
        resolve(false);
      });

      req.on('timeout', () => {
        req.removeAllListeners();
        req.destroy();
        logger.warn('Rspamd health check timeout');
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Get current metrics
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalScans > 0
        ? ((this.metrics.successfulScans / this.metrics.totalScans) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      rejects: 0,
      greylists: 0,
      accepts: 0
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.agent) {
      this.agent.destroy();
    }
  }
}

module.exports = new RspamdService();

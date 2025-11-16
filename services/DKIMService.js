const DKIMSign = require('dkim-signer').sign;
const path = require('path');
const logger = require('../utils/logger');

/**
 * DKIM Signing Service
 *
 * Handles DKIM signing for outbound emails.
 * Uses a plugin system to load DKIM keys from various sources.
 */
class DKIMService {
  constructor() {
    this.enabled = process.env.DKIM_ENABLED === 'true';
    this.pluginPath = process.env.DKIM_PLUGIN_PATH || './plugins/dkim-keys.js';
    this.plugin = null;
    this.selector = process.env.DKIM_SELECTOR || 'default';
    this.headersToSign = process.env.DKIM_HEADERS || 'from:to:subject:date:message-id';

    // Load plugin on initialization
    if (this.enabled) {
      this.loadPlugin();
    }
  }

  /**
   * Load the DKIM keys plugin
   */
  loadPlugin() {
    try {
      const pluginFullPath = path.resolve(this.pluginPath);
      this.plugin = require(pluginFullPath);

      logger.info('DKIM plugin loaded', {
        pluginPath: this.pluginPath,
        selector: this.selector
      });
    } catch (error) {
      logger.error('Failed to load DKIM plugin', {
        pluginPath: this.pluginPath,
        error: error.message
      });
      this.enabled = false;
    }
  }

  /**
   * Check if DKIM signing is enabled
   *
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Extract domain from email address
   *
   * @param {string} email - Email address
   * @returns {string} - Domain portion
   */
  extractDomain(email) {
    const match = email.match(/@([^@>]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  /**
   * Parse sender from email headers
   *
   * @param {string} rawEmail - Raw email content
   * @returns {string|null} - Sender email address
   */
  parseSenderFromHeaders(rawEmail) {
    // Look for From: header
    const fromMatch = rawEmail.match(/^From:\s*(.+?)$/mi);
    if (fromMatch) {
      const fromHeader = fromMatch[1];
      // Extract email from formats like "Name <email@domain.com>" or "email@domain.com"
      const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s<>]+@[^\s<>]+)/);
      if (emailMatch) {
        return emailMatch[1].trim();
      }
    }
    return null;
  }

  /**
   * Sign an email with DKIM
   *
   * @param {string} rawEmail - Raw email content (headers + body)
   * @param {string} senderEmail - Sender email address (optional, will parse from headers if not provided)
   * @returns {Promise<string>} - Signed email with DKIM-Signature header
   */
  async signEmail(rawEmail, senderEmail = null) {
    try {
      // Check if DKIM is enabled
      if (!this.enabled) {
        logger.debug('DKIM signing is disabled');
        return rawEmail;
      }

      // Check if plugin is loaded
      if (!this.plugin) {
        logger.warn('DKIM plugin not loaded, signing disabled');
        return rawEmail;
      }

      // Get sender email
      let sender = senderEmail;
      if (!sender) {
        sender = this.parseSenderFromHeaders(rawEmail);
      }

      if (!sender) {
        logger.warn('Could not determine sender email, skipping DKIM signing');
        return rawEmail;
      }

      // Extract domain from sender
      const domain = this.extractDomain(sender);
      if (!domain) {
        logger.warn('Could not extract domain from sender', { sender });
        return rawEmail;
      }

      // Get DKIM keys from plugin
      const keys = await this.plugin(domain);
      if (!keys || !keys.privateKey) {
        logger.debug('No DKIM keys available for domain, skipping signing', { domain });
        return rawEmail;
      }

      // Use selector from keys or default
      const selector = keys.selector || this.selector;

      // Prepare DKIM options
      const dkimOptions = {
        privateKey: keys.privateKey,
        keySelector: selector,
        domainName: domain,
        headerFieldNames: this.headersToSign
      };

      logger.debug('Signing email with DKIM', {
        domain,
        selector,
        sender
      });

      // Sign the email
      const signedEmail = await this.signWithDKIM(rawEmail, dkimOptions);

      logger.info('Email signed with DKIM', {
        domain,
        selector,
        sender
      });

      return signedEmail;

    } catch (error) {
      logger.error('DKIM signing failed', {
        error: error.message,
        sender: senderEmail
      });
      // Return original email if signing fails
      return rawEmail;
    }
  }

  /**
   * Perform DKIM signing using dkim-signer library
   *
   * @param {string} rawEmail - Raw email content
   * @param {object} options - DKIM options
   * @returns {Promise<string>} - Signed email
   */
  signWithDKIM(rawEmail, options) {
    return new Promise((resolve, reject) => {
      try {
        // Ensure proper line endings (CRLF)
        let email = rawEmail;
        if (!email.includes('\r\n')) {
          email = email.replace(/\n/g, '\r\n');
        }

        // Sign the email
        const signed = DKIMSign(email, {
          privateKey: options.privateKey,
          keySelector: options.keySelector,
          domainName: options.domainName,
          headerFieldNames: options.headerFieldNames
        });

        resolve(signed);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Validate DKIM configuration
   *
   * @returns {object} - Configuration status
   */
  getConfig() {
    return {
      enabled: this.enabled,
      pluginPath: this.pluginPath,
      pluginLoaded: !!this.plugin,
      selector: this.selector,
      headersToSign: this.headersToSign
    };
  }

  /**
   * Reload the plugin (useful for hot-reloading configuration)
   */
  reloadPlugin() {
    if (this.enabled) {
      // Clear require cache
      const pluginFullPath = path.resolve(this.pluginPath);
      delete require.cache[require.resolve(pluginFullPath)];

      // Reload plugin
      this.loadPlugin();
    }
  }
}

// Export singleton instance
module.exports = new DKIMService();

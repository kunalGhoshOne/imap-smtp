const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../config/config');
const logger = require('../utils/logger');

class WebhookService {
  constructor() {
    this.config = config.webhook;
  }

  async sendWebhook(type, emailData, result = null) {
    if (!this.config.enabled) {
      logger.debug('Webhooks disabled, skipping notification');
      return;
    }

    const url = type === 'success' ? this.config.successUrl : this.config.failureUrl;
    if (!url) {
      logger.warn(`No webhook URL configured for ${type} notifications`);
      return;
    }

    try {
      const payload = this.buildPayload(type, emailData, result);
      await this.sendRequest(url, payload);
      
      logger.info(`Webhook sent successfully`, {
        type,
        emailId: emailData._id,
        url: this.maskUrl(url)
      });
    } catch (error) {
      logger.error(`Failed to send webhook`, {
        type,
        emailId: emailData._id,
        error: error.message,
        url: this.maskUrl(url)
      });
    }
  }

  buildPayload(type, emailData, result) {
    const basePayload = {
      event: type,
      timestamp: new Date().toISOString(),
      email: {
        id: emailData._id?.toString(),
        sender: emailData.sender,
        recipients: emailData.recipients,
        subject: emailData.subject,
        createdAt: emailData.createdAt,
        status: emailData.status,
        retryCount: emailData.retryCount,
        lastAttempt: emailData.lastAttempt,
        sentAt: emailData.sentAt
      }
    };

    if (type === 'success') {
      return {
        ...basePayload,
        success: true,
        delivery: {
          timestamp: new Date().toISOString(),
          attempts: emailData.sendAttempts?.length || 0,
          finalAttempt: emailData.sendAttempts?.[emailData.sendAttempts.length - 1] || null
        }
      };
    } else {
      // Failure payload with detailed error information
      const lastAttempt = emailData.sendAttempts?.[emailData.sendAttempts.length - 1];
      const allErrors = this.extractAllErrors(emailData);
      
      return {
        ...basePayload,
        success: false,
        failure: {
          timestamp: new Date().toISOString(),
          attempts: emailData.sendAttempts?.length || 0,
          retryCount: emailData.retryCount,
          finalError: emailData.finalError,
          lastAttempt: lastAttempt,
          allErrors: allErrors,
          isPermanent: emailData.status === 'failed_permanent'
        },
        // Include detailed attempt history for debugging
        attemptHistory: emailData.sendAttempts || []
      };
    }
  }

  extractAllErrors(emailData) {
    const errors = [];
    
    if (emailData.sendAttempts) {
      emailData.sendAttempts.forEach((attempt, index) => {
        if (!attempt.success && attempt.response) {
          if (Array.isArray(attempt.response)) {
            attempt.response.forEach((result, resultIndex) => {
              if (!result.success && result.error) {
                errors.push({
                  attempt: index + 1,
                  recipient: result.recipient,
                  mxServer: result.mxServer,
                  error: result.error,
                  timestamp: attempt.timestamp
                });
              }
            });
          }
        }
      });
    }

    return errors;
  }

  async sendRequest(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = JSON.stringify(payload);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'SMTP-Server-Webhook/1.0',
          'X-Webhook-Event': payload.event,
          'X-Email-ID': payload.email.id
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  maskUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return 'invalid-url';
    }
  }

  // Retry mechanism for webhook failures
  async sendWebhookWithRetry(type, emailData, result = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        await this.sendWebhook(type, emailData, result);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        logger.warn(`Webhook attempt ${attempt} failed`, {
          type,
          emailId: emailData._id,
          error: error.message,
          attempt,
          maxRetries: this.config.retries
        });

        if (attempt < this.config.retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logger.error(`All webhook retries failed`, {
      type,
      emailId: emailData._id,
      error: lastError?.message,
      attempts: this.config.retries
    });
  }
}

module.exports = new WebhookService(); 
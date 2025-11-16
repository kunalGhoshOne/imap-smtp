const net = require('net');
const dns = require('dns').promises;
const IPSelectionService = require('./IPSelectionService');
const DKIMService = require('./DKIMService');
const logger = require('../utils/logger');

class MailSender {
  constructor() {
    this.timeout = 30000; // 30 seconds timeout
  }

  async sendEmail(emailData) {
    const { sender, recipients, raw } = emailData;

    try {
      // Sign email with DKIM if enabled
      const signedEmail = await DKIMService.signEmail(raw, sender);

      // Get IP for this email
      const sourceIP = await IPSelectionService.getIPForEmail(emailData);

      // Send to each recipient
      const results = [];
      for (const recipient of recipients) {
        const result = await this.sendToRecipient(sender, recipient, signedEmail, sourceIP);
        results.push(result);
      }

      return {
        success: results.every(r => r.success),
        results,
        sourceIP,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Failed to send email', { error: error.message, sender, recipients });
      throw error;
    }
  }

  async sendToRecipient(sender, recipient, rawEmail, sourceIP = null) {
    try {
      // Extract domain from recipient
      const domain = recipient.split('@')[1];
      if (!domain) {
        throw new Error('Invalid recipient format');
      }

      // Get MX records for the domain
      const mxRecords = await this.getMXRecords(domain);
      if (!mxRecords || mxRecords.length === 0) {
        throw new Error(`No MX records found for domain: ${domain}`);
      }

      // Try each MX server in order of priority
      for (const mxRecord of mxRecords) {
        try {
          const result = await this.sendToMXServer(sender, recipient, rawEmail, mxRecord, sourceIP);
          return {
            success: true,
            recipient,
            mxServer: mxRecord.exchange,
            sourceIP,
            response: result,
            timestamp: new Date()
          };
        } catch (error) {
          logger.warn(`Failed to send to MX server ${mxRecord.exchange}`, {
            error: error.message,
            recipient,
            mxServer: mxRecord.exchange,
            sourceIP
          });
          // Continue to next MX server
          continue;
        }
      }

      // If all MX servers failed
      throw new Error(`All MX servers failed for domain: ${domain}`);

    } catch (error) {
      return {
        success: false,
        recipient,
        sourceIP,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async getMXRecords(domain) {
    try {
      const mxRecords = await dns.resolveMx(domain);
      // Sort by priority (lower number = higher priority)
      return mxRecords.sort((a, b) => a.priority - b.priority);
    } catch (error) {
      logger.error(`Failed to resolve MX records for ${domain}`, { error: error.message });
      throw error;
    }
  }

  async sendToMXServer(sender, recipient, rawEmail, mxRecord, sourceIP = null) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = '';
      let isDataMode = false;
      let dataSent = false;

      // Set timeout
      socket.setTimeout(this.timeout);

      socket.on('connect', () => {
        logger.debug(`Connected to MX server: ${mxRecord.exchange}${sourceIP ? ` from ${sourceIP}` : ''}`);
      });

      socket.on('data', (chunk) => {
        const lines = chunk.toString().split(/\r?\n/);
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          response += trimmedLine + '\n';
          
          // Check for error responses
          if (trimmedLine.startsWith('4') || trimmedLine.startsWith('5')) {
            socket.end();
            reject(new Error(`SMTP Error: ${trimmedLine}`));
            return;
          }

          // Handle different SMTP responses
          if (trimmedLine.startsWith('220')) {
            // Server ready, send HELO
            socket.write(`HELO ${mxRecord.exchange}\r\n`);
          } else if (trimmedLine.startsWith('250') && !isDataMode) {
            if (!dataSent) {
              // Send MAIL FROM
              socket.write(`MAIL FROM:<${sender}>\r\n`);
            } else {
              // Email sent successfully
              socket.write('QUIT\r\n');
              socket.end();
              resolve(response);
            }
          } else if (trimmedLine.startsWith('334')) {
            // Auth challenge (if needed) - skip for now
            socket.write('\r\n');
          } else if (trimmedLine.startsWith('235')) {
            // Auth successful, send MAIL FROM
            socket.write(`MAIL FROM:<${sender}>\r\n`);
          } else if (trimmedLine.startsWith('354')) {
            // Ready for data
            isDataMode = true;
            socket.write(rawEmail + '\r\n.\r\n');
            dataSent = true;
          } else if (trimmedLine.startsWith('221')) {
            // Server closing connection
            socket.end();
            resolve(response);
          }
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (error) => {
        reject(new Error(`Connection error: ${error.message}`));
      });

      socket.on('close', () => {
        if (!dataSent) {
          reject(new Error('Connection closed before email could be sent'));
        }
      });

      // Connect to MX server with optional source IP
      if (sourceIP) {
        socket.connect(25, mxRecord.exchange, sourceIP);
      } else {
        socket.connect(25, mxRecord.exchange);
      }
    });
  }
}

module.exports = new MailSender(); 
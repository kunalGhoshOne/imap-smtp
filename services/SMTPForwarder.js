const net = require('net');
const tls = require('tls');
const DKIMService = require('./DKIMService');
const logger = require('../utils/logger');

class SMTPForwarder {
  constructor(config) {
    this.config = config;
    this.timeout = 30000; // 30 seconds timeout
  }

  async forwardEmail(sender, recipients, rawEmail) {
    try {
      logger.info('📤 Forwarding email to external SMTP', {
        sender,
        recipients,
        smtpHost: this.config.smtpHost,
        smtpPort: this.config.smtpPort
      });

      // Sign email with DKIM if enabled
      const signedEmail = await DKIMService.signEmail(rawEmail, sender);

      const result = await this.sendToExternalSMTP(sender, recipients, signedEmail);

      logger.info('✅ Email forwarded successfully', {
        sender,
        recipients,
        smtpHost: this.config.smtpHost
      });

      return result;
    } catch (error) {
      logger.error('❌ Failed to forward email', {
        error: error.message,
        sender,
        recipients,
        smtpHost: this.config.smtpHost
      });
      throw error;
    }
  }

  async sendToExternalSMTP(sender, recipients, rawEmail) {
    return new Promise((resolve, reject) => {
      let socket;
      
      if (this.config.secure) {
        // Use TLS connection
        socket = tls.connect({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          timeout: this.timeout,
          rejectUnauthorized: false // Allow self-signed certificates
        });
      } else {
        // Use regular TCP connection
        socket = new net.Socket();
        socket.setTimeout(this.timeout);
        socket.connect(this.config.smtpPort, this.config.smtpHost);
      }

      let response = '';
      let isDataMode = false;
      let dataSent = false;
      let isAuthenticated = false;

      socket.on('connect', () => {
        logger.debug(`Connected to external SMTP: ${this.config.smtpHost}:${this.config.smtpPort}`);
      });

      socket.on('secureConnect', () => {
        logger.debug('TLS connection established with external SMTP');
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
            // Server ready, send EHLO
            socket.write(`EHLO ${this.config.smtpHost}\r\n`);
          } else if (trimmedLine.startsWith('250') && !isDataMode && !isAuthenticated) {
            // EHLO successful, start authentication if credentials provided
            if (this.config.username && this.config.password) {
              this.startAuthentication(socket);
            } else {
              // No authentication, send MAIL FROM
              socket.write(`MAIL FROM:<${sender}>\r\n`);
            }
          } else if (trimmedLine.startsWith('334')) {
            // Auth challenge
            this.handleAuthChallenge(socket, trimmedLine);
          } else if (trimmedLine.startsWith('235')) {
            // Auth successful
            isAuthenticated = true;
            socket.write(`MAIL FROM:<${sender}>\r\n`);
          } else if (trimmedLine.startsWith('250') && isAuthenticated && !dataSent) {
            // MAIL FROM successful, send RCPT TO
            socket.write(`RCPT TO:<${recipients[0]}>\r\n`);
          } else if (trimmedLine.startsWith('250') && dataSent) {
            // Email sent successfully
            socket.write('QUIT\r\n');
            socket.end();
            resolve(response);
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
    });
  }

  startAuthentication(socket) {
    // Start PLAIN authentication
    const authString = Buffer.from(`\0${this.config.username}\0${this.config.password}`).toString('base64');
    socket.write(`AUTH PLAIN ${authString}\r\n`);
  }

  handleAuthChallenge(socket, challenge) {
    // Handle different authentication challenges
    if (challenge.includes('VXNlcm5hbWU6')) {
      // Username challenge (Base64 for "Username:")
      const username = Buffer.from(this.config.username).toString('base64');
      socket.write(username + '\r\n');
    } else if (challenge.includes('UGFzc3dvcmQ6')) {
      // Password challenge (Base64 for "Password:")
      const password = Buffer.from(this.config.password).toString('base64');
      socket.write(password + '\r\n');
    } else {
      // Unknown challenge, try to decode and handle
      try {
        const decoded = Buffer.from(challenge, 'base64').toString();
        if (decoded.toLowerCase().includes('username')) {
          const username = Buffer.from(this.config.username).toString('base64');
          socket.write(username + '\r\n');
        } else if (decoded.toLowerCase().includes('password')) {
          const password = Buffer.from(this.config.password).toString('base64');
          socket.write(password + '\r\n');
        } else {
          socket.write('\r\n'); // Send empty response
        }
      } catch (error) {
        socket.write('\r\n'); // Send empty response
      }
    }
  }

  // Test connection to external SMTP
  async testConnection() {
    try {
      const testEmail = {
        sender: 'test@example.com',
        recipients: ['test@example.com'],
        raw: 'From: test@example.com\r\nTo: test@example.com\r\nSubject: Test\r\n\r\nTest message\r\n'
      };

      await this.forwardEmail(
        testEmail.sender,
        testEmail.recipients,
        testEmail.raw
      );

      return { success: true, message: 'Connection test successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get forwarder configuration (without sensitive data)
  getConfig() {
    return {
      enabled: true,
      smtpHost: this.config.smtpHost,
      smtpPort: this.config.smtpPort,
      secure: this.config.secure,
      hasCredentials: !!(this.config.username && this.config.password)
    };
  }
}

module.exports = SMTPForwarder; 
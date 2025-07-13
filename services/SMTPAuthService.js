const Mailbox = require('../models/Mailbox');
const logger = require('../utils/logger');

class SMTPAuthService {
  static async authenticateUser(username, password) {
    try {
      // Find mailbox by username
      const mailbox = await Mailbox.findOne({ username });
      
      if (!mailbox) {
        logger.warn('SMTP authentication failed: mailbox not found', { username });
        return { success: false, error: 'Invalid credentials' };
      }

      // Verify password
      const isValid = await mailbox.comparePassword(password);
      
      if (!isValid) {
        logger.warn('SMTP authentication failed: invalid password', { username });
        return { success: false, error: 'Invalid credentials' };
      }

      logger.info('SMTP authentication successful', { username });
      return { 
        success: true, 
        username: mailbox.username,
        mailboxId: mailbox._id 
      };
    } catch (error) {
      logger.error('SMTP authentication error', { error: error.message, username });
      return { success: false, error: 'Authentication error' };
    }
  }

  static parseAuthPlain(authLine) {
    try {
      // AUTH PLAIN <base64-encoded-credentials>
      const parts = authLine.split(' ');
      if (parts.length < 3) {
        return null;
      }

      const credentials = Buffer.from(parts[2], 'base64').toString('utf8');
      const authParts = credentials.split('\0');
      
      if (authParts.length >= 3) {
        return {
          username: authParts[1],
          password: authParts[2]
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing AUTH PLAIN', { error: error.message });
      return null;
    }
  }

  static parseAuthLogin(authLine) {
    try {
      // AUTH LOGIN
      if (authLine === 'AUTH LOGIN') {
        return { mechanism: 'LOGIN' };
      }
      
      // Decode base64 username/password
      const decoded = Buffer.from(authLine, 'base64').toString('utf8');
      return { decoded };
    } catch (error) {
      logger.error('Error parsing AUTH LOGIN', { error: error.message });
      return null;
    }
  }

  static isAuthenticationRequired(port) {
    // Require authentication for ports 587 and 465
    return port === 587 || port === 465;
  }

  static validateSenderForAuthenticatedUser(sender, authenticatedUsername) {
    // For authenticated users, validate that sender matches their username
    // or allow them to send from their own domain
    if (!authenticatedUsername) {
      return false;
    }

    // Extract domain from authenticated username
    const authDomain = authenticatedUsername.split('@')[1];
    const senderDomain = sender.split('@')[1];

    // Allow sending from the same domain as authenticated user
    if (authDomain && senderDomain && authDomain === senderDomain) {
      return true;
    }

    // Allow sending from the exact authenticated username
    if (sender === authenticatedUsername) {
      return true;
    }

    return false;
  }
}

module.exports = SMTPAuthService; 
const { simpleParser } = require('mailparser');
const Email = require('../models/Email');
const EmailQueue = require('./EmailQueue');
const logger = require('../utils/logger');

class EmailProcessor {
  constructor() {
    this.maxSize = process.env.MAX_EMAIL_SIZE || 10 * 1024 * 1024; // 10MB
  }

  async processEmail(sender, recipients, rawData, authenticatedUsername = null) {
    try {
      // Validate email size
      if (rawData.length > this.maxSize) {
        throw new Error('Email size exceeds maximum allowed size');
      }

      // Parse the email using mailparser
      const parsed = await simpleParser(rawData);

      // Prepare email data for queue
      const emailData = {
        sender,
        recipients,
        subject: parsed.subject || '',
        text: parsed.text || '',
        html: parsed.html || '',
        raw: rawData,
        attachments: parsed.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          content: att.content,
        })),
        authenticatedUsername // Store the authenticated username
      };

      // Add to queue for sending
      const emailId = await EmailQueue.addToQueue(emailData);
      
      logger.info('✅ Email added to queue', { 
        emailId, 
        sender, 
        authenticatedUsername: authenticatedUsername || 'anonymous' 
      });
      return { success: true, message: 'Email queued for sending', emailId };
    } catch (error) {
      logger.error('❌ Email processing failed:', error.message);
      throw error;
    }
  }

  validateSender(sender) {
    // Add sender validation logic here
    return sender && sender.includes('@');
  }

  validateRecipients(recipients) {
    // Add recipient validation logic here
    return recipients && recipients.length > 0 && 
           recipients.every(rcpt => rcpt.includes('@'));
  }
}

module.exports = new EmailProcessor(); 
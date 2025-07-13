const { simpleParser } = require('mailparser');
const IncomingEmail = require('../models/IncomingEmail');
const logger = require('../utils/logger');

class IncomingEmailProcessor {
  constructor() {
    this.maxSize = process.env.MAX_EMAIL_SIZE || 10 * 1024 * 1024; // 10MB
  }

  async processIncomingEmail(sender, recipients, rawData, source = 'SMTP') {
    try {
      // Validate email size
      if (rawData.length > this.maxSize) {
        throw new Error('Email size exceeds maximum allowed size');
      }

      // Parse the email using mailparser
      const parsed = await simpleParser(rawData);

      // Create incoming email document
      const emailDoc = new IncomingEmail({
        sender,
        recipients,
        subject: parsed.subject || 'No Subject',
        text: parsed.text || '',
        html: parsed.html || '',
        raw: rawData,
        attachments: parsed.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          content: att.content,
        })),
        source: source, // Track where the email came from (SMTP, IMAP, LMTP)
        receivedAt: new Date(),
        messageId: parsed.messageId,
        headers: parsed.headers
      });

      await emailDoc.save();
      
      logger.info('✅ Incoming email stored', { 
        emailId: emailDoc._id, 
        sender, 
        recipients: recipients.join(', '),
        source,
        subject: emailDoc.subject
      });

      return { 
        success: true, 
        message: 'Incoming email stored successfully', 
        emailId: emailDoc._id 
      };
    } catch (error) {
      logger.error('❌ Incoming email processing failed:', error.message);
      throw error;
    }
  }

  async getIncomingEmails(options = {}) {
    try {
      const {
        limit = 50,
        page = 1,
        recipient = null,
        source = null,
        startDate = null,
        endDate = null
      } = options;

      const skip = (page - 1) * limit;
      const query = {};

      // Filter by recipient
      if (recipient) {
        query.recipients = { $in: [recipient] };
      }

      // Filter by source
      if (source) {
        query.source = source;
      }

      // Filter by date range
      if (startDate || endDate) {
        query.receivedAt = {};
        if (startDate) query.receivedAt.$gte = new Date(startDate);
        if (endDate) query.receivedAt.$lte = new Date(endDate);
      }

      const emails = await IncomingEmail.find(query)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await IncomingEmail.countDocuments(query);

      return {
        emails,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('❌ Failed to get incoming emails:', error.message);
      throw error;
    }
  }

  async getIncomingEmailById(emailId) {
    try {
      const email = await IncomingEmail.findById(emailId);
      
      if (!email) {
        throw new Error('Incoming email not found');
      }

      return email;
    } catch (error) {
      logger.error('❌ Failed to get incoming email by ID:', error.message);
      throw error;
    }
  }

  async deleteIncomingEmail(emailId) {
    try {
      const result = await IncomingEmail.deleteOne({ _id: emailId });
      
      if (result.deletedCount === 0) {
        throw new Error('Incoming email not found');
      }

      logger.info('✅ Incoming email deleted', { emailId });
      return { success: true, message: 'Incoming email deleted successfully' };
    } catch (error) {
      logger.error('❌ Failed to delete incoming email:', error.message);
      throw error;
    }
  }

  async getIncomingEmailStats() {
    try {
      const stats = await IncomingEmail.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalSize: { $sum: { $strLenCP: '$raw' } },
            bySource: {
              $push: '$source'
            }
          }
        }
      ]);

      if (stats.length === 0) {
        return {
          total: 0,
          totalSize: 0,
          bySource: {}
        };
      }

      const sourceStats = {};
      stats[0].bySource.forEach(source => {
        sourceStats[source] = (sourceStats[source] || 0) + 1;
      });

      return {
        total: stats[0].total,
        totalSize: stats[0].totalSize,
        bySource: sourceStats
      };
    } catch (error) {
      logger.error('❌ Failed to get incoming email stats:', error.message);
      throw error;
    }
  }

  validateSender(sender) {
    return sender && sender.includes('@');
  }

  validateRecipients(recipients) {
    return recipients && recipients.length > 0 && 
           recipients.every(rcpt => rcpt.includes('@'));
  }
}

module.exports = new IncomingEmailProcessor(); 
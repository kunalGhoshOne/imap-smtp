const { simpleParser } = require('mailparser');
const IncomingEmail = require('../models/IncomingEmail');
const Email = require('../models/Email');
const Mailbox = require('../models/Mailbox');
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

      // Create incoming email document (for archival/logging)
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

      // Deliver to each recipient's mailbox
      const deliveryResults = [];
      for (const recipient of recipients) {
        const result = await this.deliverToMailbox(recipient, parsed, rawData);
        deliveryResults.push({
          recipient,
          ...result
        });
      }

      // Log delivery summary
      const successCount = deliveryResults.filter(r => r.success).length;
      const failCount = deliveryResults.length - successCount;

      logger.info('📬 Email delivery completed', {
        incomingEmailId: emailDoc._id,
        totalRecipients: recipients.length,
        delivered: successCount,
        failed: failCount,
        details: deliveryResults
      });

      return {
        success: true,
        message: 'Incoming email processed and delivered',
        emailId: emailDoc._id,
        deliveryResults
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

  /**
   * Extract username from email address
   * e.g., test@example.com -> test
   */
  extractUsername(email) {
    if (!email || !email.includes('@')) {
      return null;
    }
    return email.split('@')[0].toLowerCase();
  }

  /**
   * Check if a mailbox exists for the given username
   */
  async mailboxExists(username) {
    try {
      const mailbox = await Mailbox.findOne({ username });
      return !!mailbox;
    } catch (error) {
      logger.error('❌ Error checking mailbox existence:', error.message);
      return false;
    }
  }

  /**
   * Deliver email to user's mailbox in Email collection
   * This makes the email visible via IMAP
   */
  async deliverToMailbox(recipient, parsed, rawData) {
    try {
      const username = this.extractUsername(recipient);

      if (!username) {
        logger.warn('⚠️ Cannot extract username from recipient', { recipient });
        return { success: false, reason: 'invalid_recipient' };
      }

      // Check if mailbox exists
      const mailboxExists = await this.mailboxExists(username);

      if (!mailboxExists) {
        logger.warn('⚠️ Mailbox does not exist for recipient', { recipient, username });
        return { success: false, reason: 'no_mailbox' };
      }

      // Create email document for the user's mailbox
      const emailDoc = new Email({
        sender: parsed.from?.text || parsed.from?.value?.[0]?.address || '',
        recipients: [recipient],
        subject: parsed.subject || 'No Subject',
        text: parsed.text || '',
        html: parsed.html || '',
        raw: rawData,
        attachments: parsed.attachments.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          content: att.content,
        })),
        mailbox: 'INBOX', // Folder name (can be moved to Spam, Trash, etc. later)
        authenticatedUsername: username, // Owner of this email (THIS is the important field for queries)
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        internalDate: new Date(),
        // Set IMAP flags for new incoming message
        flags: {
          seen: false,
          answered: false,
          flagged: false,
          deleted: false,
          draft: false,
          recent: true,
          keywords: {}
        }
        // Note: uid will be auto-assigned by pre-save hook in Email model
      });

      await emailDoc.save();

      logger.info('✅ Email delivered to mailbox', {
        emailId: emailDoc._id,
        recipient,
        username,
        uid: emailDoc.uid,
        subject: emailDoc.subject
      });

      return { success: true, emailId: emailDoc._id, username };
    } catch (error) {
      logger.error('❌ Failed to deliver email to mailbox:', error.message);
      return { success: false, reason: 'delivery_error', error: error.message };
    }
  }
}

module.exports = new IncomingEmailProcessor(); 
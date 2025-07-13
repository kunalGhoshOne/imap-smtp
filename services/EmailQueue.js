const Email = require('../models/Email');
const MailSender = require('./MailSender');
const WebhookService = require('./WebhookService');
const logger = require('../utils/logger');

class EmailQueue {
  constructor() {
    this.isProcessing = false;
    this.retryDelays = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000]; // 5min, 15min, 30min, 1hour
    this.maxRetries = 3;
  }

  async addToQueue(emailData) {
    try {
      const emailDoc = new Email({
        ...emailData,
        status: 'pending',
        retryCount: 0,
        lastAttempt: null,
        sendAttempts: []
      });

      await emailDoc.save();
      logger.info('Email added to queue', { emailId: emailDoc._id, sender: emailData.sender });
      
      // Automatically start processing the email
      this.processEmail(emailDoc);

      return emailDoc._id;
    } catch (error) {
      logger.error('Failed to add email to queue', { error: error.message });
      throw error;
    }
  }

  async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.info('Starting email queue processing');

    try {
      while (true) {
        // Get pending emails that are ready to be sent
        const pendingEmails = await Email.find({
          status: 'pending',
          $or: [
            { lastAttempt: null },
            { lastAttempt: { $lt: new Date(Date.now() - this.getRetryDelay(0)) } }
          ]
        }).limit(10);

        if (pendingEmails.length === 0) {
          // Check for retry emails
          const retryEmails = await this.getRetryEmails();
          if (retryEmails.length === 0) {
            break; // No more emails to process
          }
          await this.processRetryEmails(retryEmails);
          continue;
        }

        await this.processBatch(pendingEmails);
      }
    } catch (error) {
      logger.error('Error in queue processing', { error: error.message });
    } finally {
      this.isProcessing = false;
      logger.info('Email queue processing completed');
      
      // Schedule next processing run
      setTimeout(() => {
        this.processQueue();
      }, 30000); // Check again in 30 seconds
    }
  }

  async getRetryEmails() {
    const retryEmails = [];
    
    for (let retryCount = 1; retryCount <= this.maxRetries; retryCount++) {
      const delay = this.getRetryDelay(retryCount - 1);
      const emails = await Email.find({
        status: 'failed',
        retryCount: retryCount - 1,
        lastAttempt: { $lt: new Date(Date.now() - delay) }
      }).limit(5);

      retryEmails.push(...emails);
    }

    return retryEmails;
  }

  async processRetryEmails(emails) {
    for (const email of emails) {
      try {
        await this.processEmail(email);
      } catch (error) {
        logger.error('Failed to process retry email', { 
          emailId: email._id, 
          error: error.message 
        });
      }
    }
  }

  async processBatch(emails) {
    const promises = emails.map(email => this.processEmail(email));
    await Promise.allSettled(promises);
  }

  async processEmail(emailDoc) {
    try {
      logger.info('Processing email', { 
        emailId: emailDoc._id, 
        sender: emailDoc.sender, 
        retryCount: emailDoc.retryCount 
      });

      // Update last attempt
      emailDoc.lastAttempt = new Date();
      await emailDoc.save();

      // Attempt to send email
      const result = await MailSender.sendEmail({
        sender: emailDoc.sender,
        recipients: emailDoc.recipients,
        raw: emailDoc.raw
      });

      // Record attempt
      const attempt = {
        timestamp: new Date(),
        success: result.success,
        response: result.results,
        error: result.success ? null : 'Sending failed'
      };

      emailDoc.sendAttempts.push(attempt);

      if (result.success) {
        // Email sent successfully
        emailDoc.status = 'sent';
        emailDoc.sentAt = new Date();
        await emailDoc.save();
        
        logger.info('Email sent successfully', { 
          emailId: emailDoc._id, 
          recipients: emailDoc.recipients 
        });

        // Send success webhook
        await WebhookService.sendWebhookWithRetry('success', emailDoc, result);
      } else {
        // Email failed
        await this.handleFailedEmail(emailDoc, result);
      }

    } catch (error) {
      logger.error('Error processing email', { 
        emailId: emailDoc._id, 
        error: error.message 
      });
      
      await this.handleFailedEmail(emailDoc, { 
        success: false, 
        results: [{ 
          success: false, 
          error: error.message 
        }] 
      });
    }
  }

  async handleFailedEmail(emailDoc, result) {
    emailDoc.retryCount += 1;
    
    // Record attempt
    const attempt = {
      timestamp: new Date(),
      success: false,
      response: result.results,
      error: 'Sending failed'
    };
    emailDoc.sendAttempts.push(attempt);

    if (emailDoc.retryCount >= this.maxRetries) {
      // Max retries reached
      emailDoc.status = 'failed_permanent';
      emailDoc.finalError = this.getFinalError(result.results);
      await emailDoc.save();
      
      logger.error('Email permanently failed after max retries', { 
        emailId: emailDoc._id, 
        retryCount: emailDoc.retryCount,
        finalError: emailDoc.finalError
      });

      // Send failure webhook for permanent failure
      await WebhookService.sendWebhookWithRetry('failure', emailDoc, result);
    } else {
      // Schedule for retry
      emailDoc.status = 'failed';
      await emailDoc.save();
      
      logger.warn('Email failed, scheduled for retry', { 
        emailId: emailDoc._id, 
        retryCount: emailDoc.retryCount 
      });

      // Send failure webhook for temporary failure
      await WebhookService.sendWebhookWithRetry('failure', emailDoc, result);
    }
  }

  getRetryDelay(retryCount) {
    return this.retryDelays[retryCount] || this.retryDelays[this.retryDelays.length - 1];
  }

  getFinalError(results) {
    if (!results || results.length === 0) {
      return 'Unknown error';
    }
    
    const errors = results
      .filter(r => !r.success)
      .map(r => r.error)
      .filter(Boolean);
    
    return errors.length > 0 ? errors.join('; ') : 'Sending failed';
  }

  async getQueueStats() {
    const stats = await Email.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = {};
    stats.forEach(stat => {
      statsMap[stat._id] = stat.count;
    });

    return {
      pending: statsMap.pending || 0,
      sent: statsMap.sent || 0,
      failed: statsMap.failed || 0,
      failed_permanent: statsMap.failed_permanent || 0,
      total: Object.values(statsMap).reduce((sum, count) => sum + count, 0)
    };
  }

  async retryFailedEmail(emailId) {
    try {
      const email = await Email.findById(emailId);
      if (!email) {
        throw new Error('Email not found');
      }

      if (email.status === 'sent') {
        throw new Error('Email already sent successfully');
      }

      // Reset retry count and status
      email.status = 'pending';
      email.retryCount = 0;
      email.lastAttempt = null;
      await email.save();

      logger.info('Email reset for retry', { emailId: email._id });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }

      return true;
    } catch (error) {
      logger.error('Failed to retry email', { emailId, error: error.message });
      throw error;
    }
  }
}

module.exports = new EmailQueue(); 
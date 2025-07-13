const Email = require('../models/Email');
const EmailQueue = require('./EmailQueue');
const logger = require('../utils/logger');

class DatabaseWatcher {
  constructor() {
    this.changeStream = null;
    this.isWatching = false;
  }

  startWatching() {
    if (this.isWatching) {
      logger.warn('Database watcher is already running');
      return;
    }

    try {
      // Create change stream to watch for new emails
      this.changeStream = Email.watch([
        {
          $match: {
            'operationType': 'insert',
            'fullDocument.status': 'pending'
          }
        }
      ]);

      this.changeStream.on('change', async (change) => {
        try {
          const emailDoc = change.fullDocument;
          if (emailDoc && emailDoc.status === 'pending') {
            logger.info('New email detected in database', {
              emailId: emailDoc._id,
              sender: emailDoc.sender
            });

            // Process the email immediately
            await EmailQueue.processEmail(emailDoc);
          }
        } catch (error) {
          logger.error('Error processing new email from change stream', {
            error: error.message,
            emailId: change.fullDocument?._id
          });
        }
      });

      this.changeStream.on('error', (error) => {
        logger.error('Change stream error', { error: error.message });
        this.restartWatching();
      });

      this.changeStream.on('close', () => {
        logger.warn('Change stream closed, attempting to restart');
        this.restartWatching();
      });

      this.isWatching = true;
      logger.info('Database watcher started successfully');

    } catch (error) {
      logger.error('Failed to start database watcher', { error: error.message });
      // Fallback to polling if change streams are not available
      this.startPolling();
    }
  }

  async restartWatching() {
    if (this.changeStream) {
      this.changeStream.close();
      this.changeStream = null;
    }
    
    this.isWatching = false;
    
    // Wait a bit before restarting
    setTimeout(() => {
      this.startWatching();
    }, 5000);
  }

  startPolling() {
    logger.info('Starting polling fallback for database monitoring');
    
    const pollInterval = setInterval(async () => {
      try {
        // Find pending emails that haven't been processed yet
        const pendingEmails = await Email.find({
          status: 'pending',
          lastAttempt: null
        }).limit(10);

        for (const email of pendingEmails) {
          logger.info('Processing pending email from polling', {
            emailId: email._id,
            sender: email.sender
          });

          await EmailQueue.processEmail(email);
        }
      } catch (error) {
        logger.error('Error in polling fallback', { error: error.message });
      }
    }, 10000); // Check every 10 seconds

    // Store interval reference for cleanup
    this.pollInterval = pollInterval;
  }

  stop() {
    this.isWatching = false;
    
    if (this.changeStream) {
      this.changeStream.close();
      this.changeStream = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    logger.info('Database watcher stopped');
  }

  // Process any existing pending emails on startup
  async processExistingPendingEmails() {
    try {
      const pendingEmails = await Email.find({
        status: 'pending'
      }).limit(50);

      if (pendingEmails.length > 0) {
        logger.info(`Found ${pendingEmails.length} pending emails, processing...`);
        
        for (const email of pendingEmails) {
          await EmailQueue.processEmail(email);
        }
      }
    } catch (error) {
      logger.error('Error processing existing pending emails', { error: error.message });
    }
  }
}

module.exports = new DatabaseWatcher(); 
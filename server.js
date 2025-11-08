const config = require('./config/config');
const database = require('./config/database');
const MultiPortSMTPServer = require('./services/MultiPortSMTPServer');
const IMAPServer = require('./services/IMAPServer');
const LMTPServer = require('./services/LMTPServer');
const QueueAPI = require('./services/QueueAPI');
const DatabaseWatcher = require('./services/DatabaseWatcher');
const MailboxAPI = require('./services/MailboxAPI');
const RspamdService = require('./services/RspamdService');
const logger = require('./utils/logger');

class Application {
  constructor() {
    this.multiPortSMTPServer = null;
    this.imapServer = null;
    this.lmtpServer = null;
    this.queueAPI = null;
    this.mailboxAPI = null;
    this.isShuttingDown = false;
  }

  async start() {
    try {
      // Connect to database
      await database.connect();

      // Check rspamd health if enabled
      if (RspamdService.enabled) {
        logger.info('Rspamd is enabled, performing health check...');
        const healthy = await RspamdService.healthCheck();

        if (healthy) {
          logger.info('✅ Rspamd health check passed');
        } else {
          logger.warn('⚠️ Rspamd health check failed - rspamd may not be available');
          logger.warn('⚠️ Emails will be accepted without spam filtering (fail-open mode)');
          logger.warn('⚠️ Please ensure rspamd is running and accessible');
        }
      }

      // Start Database Watcher
      DatabaseWatcher.startWatching();
      await DatabaseWatcher.processExistingPendingEmails();

      // Start Multi-Port SMTP server
      this.multiPortSMTPServer = new MultiPortSMTPServer();
      this.multiPortSMTPServer.start();
      
      // Start IMAP server
      this.imapServer = new IMAPServer();
      this.imapServer.start();
      
      // Start LMTP server
      try {
        this.lmtpServer = new LMTPServer();
        this.lmtpServer.start();
      } catch (error) {
        logger.warn('⚠️ LMTP server failed to start, continuing without it', error.message);
      }
      
      // Start Queue API server
      this.queueAPI = new QueueAPI(config.server.apiPort || 3000);
      this.queueAPI.start();

      // Start Mailbox API server
      this.mailboxAPI = new MailboxAPI();
      this.mailboxAPI.start();
      
      logger.info('🚀 Application started successfully');
      
      // Handle graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('❌ Failed to start application', error);
      process.exit(1);
    }
  }

  async stop() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('🛑 Shutting down application...');
    
    try {
      // Stop Multi-Port SMTP server
      if (this.multiPortSMTPServer) {
        this.multiPortSMTPServer.stop();
      }
      
      // Stop IMAP server
      if (this.imapServer) {
        this.imapServer.stop();
      }
      
      // Stop LMTP server
      if (this.lmtpServer) {
        this.lmtpServer.stop();
      }

      // Stop Mailbox API server
      if (this.mailboxAPI) {
        this.mailboxAPI.stop();
      }

      // Stop Database Watcher
      DatabaseWatcher.stop();

      // Cleanup rspamd connection pool
      if (RspamdService.enabled) {
        logger.info('Cleaning up rspamd resources...');
        RspamdService.destroy();
      }

      // Disconnect from database
      await database.disconnect();

      logger.info('✅ Application stopped gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown', error);
      process.exit(1);
    }
  }

  setupGracefulShutdown() {
    // Handle SIGTERM (Docker, Kubernetes)
    process.on('SIGTERM', () => {
      logger.info('📨 Received SIGTERM, starting graceful shutdown');
      this.stop();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('📨 Received SIGINT, starting graceful shutdown');
      this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception', error);
      this.stop();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      this.stop();
    });
  }
}

// Start the application
const app = new Application();
app.start();

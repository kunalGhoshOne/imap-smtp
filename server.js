const config = require('./config/config');
const database = require('./config/database');
const MultiPortSMTPServer = require('./services/MultiPortSMTPServer');
const QueueAPI = require('./services/QueueAPI');
const DatabaseWatcher = require('./services/DatabaseWatcher');
const logger = require('./utils/logger');

class Application {
  constructor() {
    this.multiPortSMTPServer = null;
    this.queueAPI = null;
    this.isShuttingDown = false;
  }

  async start() {
    try {
      // Connect to database
      await database.connect();
      
      // Start Database Watcher
      DatabaseWatcher.startWatching();
      await DatabaseWatcher.processExistingPendingEmails();
      
      // Start Multi-Port SMTP server
      this.multiPortSMTPServer = new MultiPortSMTPServer();
      this.multiPortSMTPServer.start();
      
      // Start Queue API server
      this.queueAPI = new QueueAPI(config.server.apiPort || 3000);
      this.queueAPI.start();
      
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
      
      // Stop Database Watcher
      DatabaseWatcher.stop();
      
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

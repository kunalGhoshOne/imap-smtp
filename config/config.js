require('dotenv').config();

const config = {
  server: {
    port: process.env.SMTP_PORT || 2525,
    host: process.env.SMTP_HOST || '0.0.0.0',
    apiPort: process.env.API_PORT || 3000,
  },
  database: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/smtp-server',
  },
  email: {
    maxSize: process.env.MAX_EMAIL_SIZE || 10 * 1024 * 1024, // 10MB
    allowedDomains: process.env.ALLOWED_DOMAINS ? 
      process.env.ALLOWED_DOMAINS.split(',') : [],
  },
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    successUrl: process.env.WEBHOOK_SUCCESS_URL,
    failureUrl: process.env.WEBHOOK_FAILURE_URL,
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000, // 10 seconds
    retries: parseInt(process.env.WEBHOOK_RETRIES) || 3,
  },
  ipSelection: {
    enabled: process.env.IP_SELECTION_ENABLED === 'true',
    apiUrl: process.env.IP_SELECTION_API_URL,
    timeout: parseInt(process.env.IP_SELECTION_TIMEOUT) || 5000, // 5 seconds
    retries: parseInt(process.env.IP_SELECTION_RETRIES) || 3,
    fallbackIp: process.env.FALLBACK_IP || null,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.ENABLE_CONSOLE_LOG !== 'false',
  }
};

module.exports = config; 
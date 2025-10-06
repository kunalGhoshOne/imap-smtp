const config = require('../config/config');

class Logger {
  constructor() {
    this.level = config.logging.level;
    this.enableConsole = config.logging.enableConsole;
  }

  log(level, message, data = null) {
    if (!this.enableConsole) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };

    const logString = `[${timestamp}] ${level.toUpperCase()}: ${message}${data ? ' ' + JSON.stringify(data) : ''}`;

    switch (level.toLowerCase()) {
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'info':
        console.log(logString);
        break;
      case 'debug':
        if (this.level === 'debug') {
          console.log(logString);
        }
        break;
      default:
        console.log(logString);
    }
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }
}

module.exports = new Logger(); 
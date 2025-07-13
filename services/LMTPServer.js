const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const database = require('../config/database');
const Email = require('../models/Email');
const logger = require('../utils/logger');

class LMTPServer {
  constructor() {
    this.server = null;
    this.sslServer = null;
    this.connections = new Set();
    this.isRunning = false;
  }

  start() {
    try {
      // Start non-SSL LMTP server on port 24
      this.server = net.createServer((socket) => {
        this.handleConnection(socket, false);
      });

      this.server.listen(config.lmtp.port || 24, () => {
        logger.info(`📧 LMTP server listening on port ${config.lmtp.port || 24}`);
      });

      // Start SSL LMTP server if SSL is enabled
      if (config.lmtp.ssl && config.lmtp.sslPort) {
        const sslOptions = this.getSSLOptions();
        this.sslServer = tls.createServer(sslOptions, (socket) => {
          this.handleConnection(socket, true);
        });

        this.sslServer.listen(config.lmtp.sslPort, () => {
          logger.info(`📧 LMTP SSL server listening on port ${config.lmtp.sslPort}`);
        });
      }

      this.isRunning = true;
      logger.info('🚀 LMTP server started successfully');

    } catch (error) {
      logger.error('❌ Failed to start LMTP server', error);
      throw error;
    }
  }

  stop() {
    this.isRunning = false;
    
    // Close all connections
    this.connections.forEach(connection => {
      try {
        connection.socket.end();
      } catch (error) {
        logger.error('Error closing LMTP connection', error);
      }
    });
    this.connections.clear();

    // Close servers
    if (this.server) {
      this.server.close();
      logger.info('📧 LMTP server stopped');
    }

    if (this.sslServer) {
      this.sslServer.close();
      logger.info('📧 LMTP SSL server stopped');
    }
  }

  handleConnection(socket, isSSL) {
    const connection = {
      socket,
      isSSL,
      state: 'INIT',
      currentEmail: null,
      buffer: '',
      id: Math.random().toString(36).substr(2, 9)
    };

    this.connections.add(connection);
    logger.info(`📧 LMTP connection ${connection.id} established (SSL: ${isSSL})`);

    // Send welcome message
    this.sendResponse(socket, '220', 'LMTP server ready');

    socket.on('data', (data) => {
      this.handleData(connection, data);
    });

    socket.on('error', (error) => {
      logger.error(`📧 LMTP connection ${connection.id} error:`, error);
      this.connections.delete(connection);
    });

    socket.on('close', () => {
      logger.info(`📧 LMTP connection ${connection.id} closed`);
      this.connections.delete(connection);
    });
  }

  handleData(connection, data) {
    if (connection.state === 'DATA') {
      this.handleEmailData(connection, data);
      return;
    }

    const lines = (connection.buffer + data.toString()).split('\r\n');
    connection.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this.processCommand(connection, line.trim());
      }
    }
  }

  processCommand(connection, command) {
    const parts = command.split(' ');
    const cmd = parts[0].toUpperCase();
    const args = parts.slice(1);

    logger.debug(`📧 LMTP ${connection.id}: ${command}`);

    switch (cmd) {
      case 'LHLO':
        this.handleLHLO(connection, args);
        break;
      case 'MAIL':
        this.handleMAIL(connection, args);
        break;
      case 'RCPT':
        this.handleRCPT(connection, args);
        break;
      case 'DATA':
        this.handleDATA(connection);
        break;
      case 'RSET':
        this.handleRSET(connection);
        break;
      case 'NOOP':
        this.handleNOOP(connection);
        break;
      case 'QUIT':
        this.handleQUIT(connection);
        break;
      default:
        this.sendResponse(connection.socket, '500', 'Unknown command');
    }
  }

  handleLHLO(connection, args) {
    if (connection.state !== 'INIT') {
      this.sendResponse(connection.socket, '503', 'Bad sequence of commands');
      return;
    }

    if (args.length === 0) {
      this.sendResponse(connection.socket, '501', 'Syntax error in parameters');
      return;
    }

    connection.state = 'READY';
    connection.hostname = args[0];
    
    this.sendResponse(connection.socket, '250', `Hello ${args[0]}, LMTP server ready`);
  }

  handleMAIL(connection, args) {
    if (connection.state !== 'READY') {
      this.sendResponse(connection.socket, '503', 'Bad sequence of commands');
      return;
    }

    if (!args[0] || !args[0].toUpperCase().startsWith('FROM:')) {
      this.sendResponse(connection.socket, '501', 'Syntax error in parameters');
      return;
    }

    const fromMatch = args[0].match(/FROM:\s*<(.+)>/i);
    if (!fromMatch) {
      this.sendResponse(connection.socket, '501', 'Syntax error in parameters');
      return;
    }

    connection.currentEmail = {
      from: fromMatch[1],
      to: [],
      data: '',
      receivedAt: new Date()
    };

    connection.state = 'MAIL';
    this.sendResponse(connection.socket, '250', 'OK');
  }

  handleRCPT(connection, args) {
    if (connection.state !== 'MAIL' && connection.state !== 'RCPT') {
      this.sendResponse(connection.socket, '503', 'Bad sequence of commands');
      return;
    }

    if (!args[0] || !args[0].toUpperCase().startsWith('TO:')) {
      this.sendResponse(connection.socket, '501', 'Syntax error in parameters');
      return;
    }

    const toMatch = args[0].match(/TO:\s*<(.+)>/i);
    if (!toMatch) {
      this.sendResponse(connection.socket, '501', 'Syntax error in parameters');
      return;
    }

    connection.currentEmail.to.push(toMatch[1]);
    connection.state = 'RCPT';
    this.sendResponse(connection.socket, '250', 'OK');
  }

  handleDATA(connection) {
    if (connection.state !== 'RCPT') {
      this.sendResponse(connection.socket, '503', 'Bad sequence of commands');
      return;
    }

    if (connection.currentEmail.to.length === 0) {
      this.sendResponse(connection.socket, '503', 'No valid recipients');
      return;
    }

    connection.state = 'DATA';
    this.sendResponse(connection.socket, '354', 'Start mail input; end with <CRLF>.<CRLF>');
  }

  handleRSET(connection) {
    connection.state = 'READY';
    connection.currentEmail = null;
    this.sendResponse(connection.socket, '250', 'OK');
  }

  handleNOOP(connection) {
    this.sendResponse(connection.socket, '250', 'OK');
  }

  handleQUIT(connection) {
    this.sendResponse(connection.socket, '221', 'Bye');
    connection.socket.end();
  }

  async saveEmail(connection) {
    try {
      const email = new Email({
        from: connection.currentEmail.from,
        to: connection.currentEmail.to,
        subject: this.extractSubject(connection.currentEmail.data),
        body: connection.currentEmail.data,
        receivedAt: connection.currentEmail.receivedAt,
        source: 'LMTP',
        status: 'received'
      });

      await email.save();
      logger.info(`📧 LMTP email saved: ${email._id} from ${connection.currentEmail.from} to ${connection.currentEmail.to.join(', ')}`);
      
      return true;
    } catch (error) {
      logger.error('❌ Error saving LMTP email', error);
      return false;
    }
  }

  extractSubject(data) {
    const subjectMatch = data.match(/^Subject:\s*(.+)$/mi);
    return subjectMatch ? subjectMatch[1].trim() : 'No Subject';
  }

  sendResponse(socket, code, message) {
    const response = `${code} ${message}\r\n`;
    socket.write(response);
    logger.debug(`📧 LMTP response: ${response.trim()}`);
  }

  getSSLOptions() {
    const sslConfig = config.lmtp.ssl;
    
    if (!sslConfig.key || !sslConfig.cert) {
      throw new Error('SSL key and certificate paths are required for LMTP SSL');
    }

    return {
      key: fs.readFileSync(path.resolve(sslConfig.key)),
      cert: fs.readFileSync(path.resolve(sslConfig.cert)),
      ca: sslConfig.ca ? fs.readFileSync(path.resolve(sslConfig.ca)) : undefined
    };
  }

  // Handle email data reception
  handleEmailData(connection, data) {
    const lines = data.toString().split('\r\n');
    
    for (const line of lines) {
      if (line === '.') {
        // End of email data
        this.finalizeEmail(connection);
        return;
      }
      
      if (line.startsWith('..')) {
        // Unescape dot-stuffing
        connection.currentEmail.data += line.substring(1) + '\r\n';
      } else {
        connection.currentEmail.data += line + '\r\n';
      }
    }
  }

  async finalizeEmail(connection) {
    try {
      const success = await this.saveEmail(connection);
      
      if (success) {
        this.sendResponse(connection.socket, '250', 'OK');
      } else {
        this.sendResponse(connection.socket, '550', 'Failed to save email');
      }
    } catch (error) {
      logger.error('❌ Error finalizing LMTP email', error);
      this.sendResponse(connection.socket, '550', 'Internal server error');
    }

    // Reset connection state
    connection.state = 'READY';
    connection.currentEmail = null;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      connections: this.connections.size,
      port: config.lmtp.port || 24,
      sslPort: config.lmtp.ssl ? config.lmtp.sslPort : null
    };
  }
}

module.exports = LMTPServer; 
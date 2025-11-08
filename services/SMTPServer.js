const net = require('net');
const EmailProcessor = require('./EmailProcessor');
const RspamdService = require('./RspamdService');
const logger = require('../utils/logger');

class SMTPServer {
  constructor(port = 2525, host = '0.0.0.0') {
    this.port = port;
    this.host = host;
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(this.port, this.host, () => {
      logger.info(`🚀 MTA server listening on ${this.host}:${this.port}`);
    });

    this.server.on('error', (error) => {
      logger.error('🔥 Server error:', error.message);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('🛑 SMTP server stopped');
    }
  }

  handleConnection(socket) {
    logger.info('📬 Client connected');

    let sender = '';
    let recipients = [];
    let rawData = '';
    let isDataMode = false;
    let clientIp = socket.remoteAddress;
    let helo = '';

    // Send welcome message
    socket.write('220 Custom Node MTA Ready\r\n');

    socket.on('data', async (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);

      for (let line of lines) {
        line = line.trim();

        if (isDataMode) {
          if (line === '.') {
            isDataMode = false;
            await this.handleEmailData(socket, sender, recipients, rawData, {
              ip: clientIp,
              helo: helo,
              mailType: 'inbound'
            });

            // Reset state
            rawData = '';
            sender = '';
            recipients = [];
          } else {
            rawData += line + '\r\n';
          }
          continue;
        }

        this.handleSMTPCommand(socket, line, {
          setSender: (s) => { sender = s; },
          addRecipient: (r) => { recipients.push(r); },
          clearRecipients: () => { recipients = []; },
          setDataMode: (mode) => { isDataMode = mode; },
          setHelo: (h) => { helo = h; }
        });
      }
    });

    socket.on('end', () => {
      logger.info('❌ Client disconnected');
    });

    socket.on('error', (err) => {
      logger.error('🔥 Socket error:', err.message);
    });
  }

  handleSMTPCommand(socket, line, state) {
    if (line.startsWith('HELO') || line.startsWith('EHLO')) {
      const parts = line.split(' ');
      if (parts.length > 1) {
        state.setHelo(parts[1]);
      }
      socket.write('250 Hello\r\n');
    } else if (line.startsWith('MAIL FROM:')) {
      const sender = line.slice(10).replace(/[<>]/g, '').trim();
      if (EmailProcessor.validateSender(sender)) {
        state.setSender(sender);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid sender\r\n');
      }
    } else if (line.startsWith('RCPT TO:')) {
      const rcpt = line.slice(8).replace(/[<>]/g, '').trim();
      if (EmailProcessor.validateRecipients([rcpt])) {
        state.addRecipient(rcpt);
        socket.write('250 OK\r\n');
      } else {
        socket.write('501 Invalid recipient\r\n');
      }
    } else if (line === 'DATA') {
      state.setDataMode(true);
      socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
    } else if (line === 'QUIT') {
      socket.write('221 Bye\r\n');
      socket.end();
    } else if (line === 'RSET') {
      // Reset the current transaction
      state.setSender('');
      state.clearRecipients(); // Clear recipients array
      state.setDataMode(false);
      socket.write('250 OK\r\n');
    } else {
      socket.write('502 Command not implemented\r\n');
    }
  }

  async handleEmailData(socket, sender, recipients, rawData, options = {}) {
    try {
      // Determine mail type (inbound vs outbound)
      const mailType = options.mailType || 'inbound';

      // Use separate variable for processed data to avoid mutation issues
      let processedData = rawData;

      // Check if rspamd scanning is enabled for this mail type
      if (RspamdService.isEnabled(mailType)) {
        logger.info('Scanning email with rspamd', {
          sender,
          recipients,
          mailType
        });

        // Scan email with rspamd
        const scanResult = await RspamdService.scanEmail(rawData, {
          sender,
          recipients,
          ip: options.ip,
          helo: options.helo,
          hostname: options.hostname
        });

        // Get action based on scan result
        const action = RspamdService.getAction(scanResult);

        logger.info('Rspamd scan action', {
          action: action.action,
          reason: action.reason,
          score: action.score,
          sender,
          recipients
        });

        // Handle reject action
        if (action.action === 'reject') {
          logger.warn('Email rejected by rspamd', {
            sender,
            recipients,
            score: action.score,
            threshold: action.threshold
          });
          socket.write(action.message + '\r\n');
          return;
        }

        // Handle greylist action
        if (action.action === 'greylist') {
          logger.info('Email greylisted by rspamd', {
            sender,
            recipients,
            score: action.score,
            threshold: action.threshold
          });
          socket.write(action.message + '\r\n');
          return;
        }

        // Add spam headers if needed
        if (action.addHeaders) {
          const headers = RspamdService.generateHeaders(scanResult);
          processedData = headers + rawData;
          logger.debug('Added spam headers to email');
        }
      }

      // Process email normally with processed data
      await EmailProcessor.processEmail(sender, recipients, processedData);
      socket.write('250 Message accepted\r\n');
    } catch (error) {
      logger.error('❌ Save failed:', error.message);
      socket.write('550 Failed to process email\r\n');
    }
  }
}

module.exports = SMTPServer; 
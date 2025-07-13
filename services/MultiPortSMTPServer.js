const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const EmailProcessor = require('./EmailProcessor');
const SMTPForwarder = require('./SMTPForwarder');
const logger = require('../utils/logger');

class MultiPortSMTPServer {
  constructor() {
    this.servers = new Map();
    this.forwarder = null;
  }

  start() {
    const config = require('../config/config');
    
    // Initialize SMTP forwarder for port 25
    if (config.server.forward25.enabled) {
      this.forwarder = new SMTPForwarder(config.server.forward25);
    }

    // Start servers on different ports
    this.startServer(config.server.ports.smtp25, 'forward', config.server.host);
    this.startServer(config.server.ports.smtp587, 'starttls', config.server.host);
    this.startServer(config.server.ports.smtp465, 'ssl', config.server.host);

    logger.info('🚀 Multi-port SMTP servers started', {
      port25: config.server.ports.smtp25,
      port587: config.server.ports.smtp587,
      port465: config.server.ports.smtp465,
      forwarding: config.server.forward25.enabled
    });
  }

  startServer(port, mode, host) {
    let server;

    if (mode === 'ssl') {
      // SSL server for port 465
      const sslOptions = this.getSSLOptions();
      server = tls.createServer(sslOptions, (socket) => {
        this.handleConnection(socket, mode, port);
      });
    } else {
      // Regular TCP server for ports 25 and 587
      server = net.createServer((socket) => {
        this.handleConnection(socket, mode, port);
      });
    }

    server.listen(port, host, () => {
      logger.info(`📬 SMTP server listening on port ${port} (${mode.toUpperCase()})`);
    });

    server.on('error', (error) => {
      logger.error(`🔥 Server error on port ${port}`, { error: error.message });
    });

    this.servers.set(port, { server, mode });
  }

  getSSLOptions() {
    // Try to load SSL certificates
    const certPath = process.env.SSL_CERT_PATH || './ssl/cert.pem';
    const keyPath = process.env.SSL_KEY_PATH || './ssl/key.pem';

    try {
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };
      } else {
        logger.warn('SSL certificates not found, using self-signed certificate');
        // Generate self-signed certificate for testing
        return this.generateSelfSignedCert();
      }
    } catch (error) {
      logger.warn('Failed to load SSL certificates, using self-signed certificate', { error: error.message });
      return this.generateSelfSignedCert();
    }
  }

  generateSelfSignedCert() {
    // For development/testing purposes
    const { execSync } = require('child_process');
    const sslDir = './ssl';
    
    try {
      if (!fs.existsSync(sslDir)) {
        fs.mkdirSync(sslDir, { recursive: true });
      }

      const certPath = path.join(sslDir, 'cert.pem');
      const keyPath = path.join(sslDir, 'key.pem');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        logger.info('Generating self-signed SSL certificate...');
        
        const opensslCmd = `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`;
        
        try {
          execSync(opensslCmd, { stdio: 'ignore' });
          logger.info('Self-signed SSL certificate generated successfully');
        } catch (error) {
          logger.error('Failed to generate SSL certificate', { error: error.message });
          // Fallback to basic SSL options
          return {};
        }
      }

      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
    } catch (error) {
      logger.error('Error setting up SSL', { error: error.message });
      return {};
    }
  }

  handleConnection(socket, mode, port) {
    logger.info(`📬 Client connected on port ${port} (${mode.toUpperCase()})`);

    let sender = '';
    let recipients = [];
    let rawData = '';
    let isDataMode = false;
    let isAuthenticated = false;
    let supportsStartTLS = false;
    let startTLSUpgraded = false;

    // Send welcome message
    socket.write('220 Multi-Port SMTP Server Ready\r\n');

    socket.on('data', async (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);

      for (let line of lines) {
        line = line.trim();

        if (isDataMode) {
          if (line === '.') {
            isDataMode = false;
            await this.handleEmailData(socket, sender, recipients, rawData, mode, port);
            
            // Reset state
            rawData = '';
            sender = '';
            recipients = [];
          } else {
            rawData += line + '\r\n';
          }
          continue;
        }

        await this.handleSMTPCommand(socket, line, {
          setSender: (s) => { sender = s; },
          addRecipient: (r) => { recipients.push(r); },
          setDataMode: (mode) => { isDataMode = mode; },
          setAuthenticated: (auth) => { isAuthenticated = auth; },
          setStartTLS: (tls) => { supportsStartTLS = tls; },
          getStartTLS: () => supportsStartTLS,
          isStartTLSUpgraded: () => startTLSUpgraded,
          upgradeToTLS: () => { startTLSUpgraded = true; }
        }, mode, port);
      }
    });

    socket.on('end', () => {
      logger.info(`❌ Client disconnected from port ${port}`);
    });

    socket.on('error', (err) => {
      logger.error(`🔥 Socket error on port ${port}`, { error: err.message });
    });
  }

  async handleSMTPCommand(socket, line, state, mode, port) {
    if (line.startsWith('HELO') || line.startsWith('EHLO')) {
      const domain = line.split(' ')[1] || 'localhost';
      
      if (line.startsWith('EHLO')) {
        // Extended HELO - advertise capabilities
        socket.write('250-Hello\r\n');
        socket.write('250-SIZE 10485760\r\n');
        
        if (mode === 'starttls' && !state.isStartTLSUpgraded()) {
          socket.write('250-STARTTLS\r\n');
          state.setStartTLS(true);
        }
        
        socket.write('250 AUTH PLAIN LOGIN\r\n');
      } else {
        socket.write('250 Hello\r\n');
      }
    } else if (line === 'STARTTLS' && mode === 'starttls' && !state.isStartTLSUpgraded()) {
      socket.write('220 Ready to start TLS\r\n');
      
      // Upgrade the connection to TLS
      const tlsOptions = this.getSSLOptions();
      const tlsSocket = tls.connect({
        socket: socket,
        ...tlsOptions
      });

      tlsSocket.on('secure', () => {
        logger.info('🔒 TLS connection established');
        state.upgradeToTLS();
        // Re-send welcome message after TLS upgrade
        tlsSocket.write('220 Multi-Port SMTP Server Ready (TLS)\r\n');
      });

      tlsSocket.on('error', (error) => {
        logger.error('TLS upgrade failed', { error: error.message });
      });

    } else if (line.startsWith('AUTH')) {
      // Handle authentication (basic implementation)
      if (line.includes('PLAIN') || line.includes('LOGIN')) {
        socket.write('334 VXNlcm5hbWU6\r\n'); // Base64 for "Username:"
        // For now, accept any authentication
        isAuthenticated = true;
        socket.write('235 Authentication successful\r\n');
      } else {
        socket.write('504 Authentication mechanism not supported\r\n');
      }
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
      state.addRecipient = () => {}; // Clear recipients
      state.setDataMode(false);
      socket.write('250 OK\r\n');
    } else {
      socket.write('502 Command not implemented\r\n');
    }
  }

  async handleEmailData(socket, sender, recipients, rawData, mode, port) {
    try {
      if (mode === 'forward' && this.forwarder) {
        // Forward email to external SMTP service
        await this.forwarder.forwardEmail(sender, recipients, rawData);
        socket.write('250 Message forwarded successfully\r\n');
      } else {
        // Process email normally (add to queue)
        await EmailProcessor.processEmail(sender, recipients, rawData);
        socket.write('250 Message accepted\r\n');
      }
    } catch (error) {
      logger.error(`❌ Failed to process email on port ${port}`, { error: error.message });
      socket.write('550 Failed to process email\r\n');
    }
  }

  stop() {
    for (const [port, { server }] of this.servers) {
      server.close();
      logger.info(`🛑 SMTP server stopped on port ${port}`);
    }
    this.servers.clear();
  }

  getServerStats() {
    const stats = {};
    for (const [port, { mode }] of this.servers) {
      stats[port] = {
        mode,
        status: 'running'
      };
    }
    return stats;
  }
}

module.exports = MultiPortSMTPServer; 